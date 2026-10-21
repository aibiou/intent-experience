/**
 * 轮次路由（纯函数）——分类器 → 生成意图 → 创作域意图 的确定性改写链。
 *
 * 从 runtime.ts 抽出，目的：让「路由决策」可被回放诊断直接调用，
 * 而不需要在诊断脚本里复刻一份逻辑（复刻会掩盖缺陷——诊断与实现
 * 两份代码各自演化时，诊断测的是自己而不是产品）。
 *
 * DEFECT-CREATION-001 的修复点集中在本文件：CONTINUE + 生成意图
 * 在活跃创作域内的改写分支。
 */

import type { SemanticAction } from './classifier';
import { classifyInput } from './classifier';
import { recognizeGenerationIntent, type GenerationIntent } from './generation-intent';
import {
  buildRestorePatch,
  hasCreationSubject,
  inheritCreationContext,
  interpretCreationInput,
  isSameCreationGoal,
  type CreationInterpretation,
  type CreationObject,
} from './creation';

export interface TurnRouting {
  /** 最终语义动作（供策略解析）。 */
  semanticAction: SemanticAction;
  /** 本轮识别到的媒体生成意图（无则 null）。 */
  generationIntent: GenerationIntent | null;
  /** 创作域修改意图（无则 null）。 */
  creationIntent: CreationInterpretation | null;
  /** 完成信号（经 STOP 路径在创作域登记）。 */
  creationCompletionSignal: boolean;
  /** 记忆操作意图（仅认领 UNKNOWN 层输入）。 */
  memoryIntent: ReturnType<typeof classifyInput>['memoryIntent'];
  /** 分类器给出的纠正子型（RESTORE 预检使用）。 */
  correctionIntent: ReturnType<typeof classifyInput>['correctionIntent'];
}

/**
 * 计算一轮输入的路由结果。
 *
 * @param raw 用户原始输入
 * @param activeCreation 当前活跃创作对象（无活跃创作域传 null）
 */
export function routeTurn(raw: string, activeCreation: CreationObject | null): TurnRouting {
  const classification = classifyInput(raw);

  // ── 生成意图识别（认领 UNKNOWN / CHANGE_DIRECTION / CONTINUE / CREATE 层）──
  let generationIntent: GenerationIntent | null = null;
  {
    const before = classification.semanticAction;
    if (before === 'CORRECTION') {
      // 「根据选中的图重新生成：…」会被通用修正词表抢先命中；
      // 只有带明确再生成标记的媒体请求才可越过修正层。
      const candidate = recognizeGenerationIntent(raw);
      if (candidate?.regen === true) generationIntent = candidate;
    } else if (
      before === 'UNKNOWN' ||
      before === 'CHANGE_DIRECTION' ||
      before === 'CONTINUE' ||
      before === 'CREATE'
    ) {
      generationIntent = recognizeGenerationIntent(raw);
    }
  }

  // ── 创作会话内输入路由（UNKNOWN / CORRECTION 层）──
  let semanticAction: SemanticAction = classification.semanticAction;
  let creationIntent: CreationInterpretation | null = null;
  let creationCompletionSignal = false;

  if (semanticAction === 'UNKNOWN' && activeCreation) {
    const interpretation = interpretCreationInput(raw, activeCreation);
    if (interpretation.kind === 'completion') {
      semanticAction = 'STOP';
      creationCompletionSignal = true;
    } else if (interpretation.kind === 'modification' || interpretation.kind === 'ambiguous') {
      semanticAction = 'CREATE';
      creationIntent = interpretation;
    }
    // kind === 'none'：保持 UNKNOWN
  }

  if (semanticAction === 'CORRECTION' && activeCreation) {
    if (classification.correctionIntent === 'restore' && activeCreation.version > 1) {
      semanticAction = 'CREATE';
      creationIntent = {
        kind: 'modification',
        patch: buildRestorePatch(activeCreation, activeCreation.version - 1, raw),
      };
    } else {
      const correctionInterpretation = interpretCreationInput(raw, activeCreation);
      if (correctionInterpretation.kind === 'completion') {
        semanticAction = 'STOP';
        creationCompletionSignal = true;
      } else if (
        correctionInterpretation.kind === 'modification' ||
        correctionInterpretation.kind === 'ambiguous'
      ) {
        semanticAction = 'CREATE';
        creationIntent = correctionInterpretation;
      }
    }
  }

  // ── 生成意图改写（策略解析前）──
  if (generationIntent) {
    if (semanticAction === 'UNKNOWN') {
      // DEFECT-CREATION-001（入口二）：创作域已活跃时，裸生成请求
      // （「生成视频」「生成动态的视频」）是对**当前创作**的再生成，
      // 不是另起一个创作。原实现一律改写为 CREATE 走首建路径，
      // 导致每次重复表达都替换 creation 对象（version 重置为 1）。
      //
      // 但「带新目标的生成请求」是例外：「生成一张森林的图」在
      // 「灯塔插画」的创作里，用户要的是另一个作品——这种情况仍应
      // 走 CREATE（取代并归档旧创作），否则用户永远无法开新作品。
      if (activeCreation) {
        const inherited = inheritCreationContext({
          theme: activeCreation.concept.theme,
          actionHistory: [],
          createInput: raw,
        });
        const sameGoal = isSameCreationGoal(activeCreation.concept.goal, inherited.newGoal);
        semanticAction = sameGoal || !hasCreationSubject(raw) ? 'CONTINUE' : 'CREATE';
      } else {
        semanticAction = generationIntent.useContext ? 'REPEAT' : 'CREATE';
      }
    } else if (semanticAction === 'CHANGE_DIRECTION') {
      // 再生成特例（「换一张图片，夏天的服装」）：模态词在场时「换」
      // 指向媒体再生成而非体验方向变更——否则会误触会话结束。
      semanticAction = 'CREATE';
    } else if (semanticAction === 'CONTINUE') {
      // 「继续生成一张图片…」是明确的继续创作，不是「继续」触发下一层讲解；
      // 引用上文（useContext）的继续呈现仍保留重放。
      //
      // DEFECT-CREATION-001：创作域已活跃时，「继续生成视频」是对**同一创作**
      // 的重复生成请求，不是「重新开始一个创作」。改写为 CREATE 会走首建路径
      // 并把现有 creation 整对象替换（version 重置为 1、contentHistory 清空），
      // 用户重复表达同一诉求即陷入「新建→取代→再新建」死循环
      // （实测 19/20 会话 version 恒为 1、仅 1/41 会话完成）。
      // 故活跃创作域内保持 CONTINUE——由内容轮随流追加媒体生成，不触碰 state.creation。
      if (generationIntent.useContext) {
        semanticAction = 'REPEAT';
      } else if (!activeCreation) {
        semanticAction = 'CREATE';
      }
      // activeCreation && !useContext：保持 CONTINUE（仅追加生成）
    } else if (semanticAction === 'CREATE') {
      // 明确的图像 / 视频 / 语音请求优先于泛化文字创作补丁；
      // 没有生成动词的「加一个出口」仍保留创作域补丁。
      creationIntent = null;
      // DEFECT-CREATION-001 步骤 3：活跃创作域内、目标与现有创作相同的
      // CREATE 请求是「对同一作品再生成一次」，不是「另起一个创作」。
      // 原实现无条件走首建路径：supersede 旧创作 + version 重置为 1，
      // 用户反复表达同一诉求就永远停在第 1 版（真实会话 19/20 如此）。
      // 同目标改为 CONTINUE：创作对象不动，媒体产物随流追加。
      if (activeCreation && generationIntent) {
        const inherited = inheritCreationContext({
          theme: activeCreation.concept.theme,
          actionHistory: [],
          createInput: raw,
        });
        if (isSameCreationGoal(activeCreation.concept.goal, inherited.newGoal)) {
          semanticAction = 'CONTINUE';
        }
      }
    } else if (semanticAction === 'CORRECTION' && generationIntent.regen === true) {
      semanticAction = 'CREATE';
      creationIntent = null;
    }
  }

  return {
    semanticAction,
    generationIntent,
    creationIntent,
    creationCompletionSignal,
    memoryIntent: classification.memoryIntent,
    correctionIntent: classification.correctionIntent,
  };
}
