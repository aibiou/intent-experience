/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  MODIFY_PATTERNS,
  RESTORE_PATTERNS,
  PREVIOUS_CANDIDATE_PATTERNS,
  isRestoreIntent,
  deriveCorrectionTarget,
} from '../../src/lib/experience/correction';
import type { CreationObject } from '../../src/lib/experience/creation';

/**
 * 纠正运行时纯逻辑（correction.ts，S2a 真实 LLM 适配版）。
 * 锁：MODIFY 词表正/负样本（08 §10 修改类型族，与创作修改族同源——
 *     单一词表两处路由）、RESTORE 三词（08 §28 恢复子型）、指代表 6 词、
 *     deriveCorrectionTarget 三分支（指代 > 创作分量 > 当前候选）、isRestoreIntent。
 * 契约依据：08 号契约 §10/§11/§12/§13/§16/§28 / S2A-F3-SEMANTIC-FREEZE
 *     （D-01 / D-02 / D-04）/ Evaluation System V1 §5 G07。
 *
 * 注意：每条断言均先经临时脚本对真实实现逐一跑通后再落测试文件
 * （断言来自实际词表，不发明契约）。
 */

function matchesAny(patterns: ReadonlyArray<RegExp>, input: string): boolean {
  return patterns.some((pattern) => pattern.test(input));
}

function makeCreation(overrides?: Partial<CreationObject>): CreationObject {
  return {
    creationId: 'creation-1',
    sourceSession: 'session-1',
    sourceStateVersion: 3,
    concept: { theme: '深海生物发光', goal: '一个小游戏' },
    content: '第一版：一个极简文字迷宫——你从起点出发，沿途收集线索，抵达终点即获胜。',
    userChanges: [],
    version: 1,
    phase: 'PREVIEW',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('correction：MODIFY 词表（08 §10 修改类型族；正/负样本）', () => {
  it('正样本命中（五个子型词族各有代表词）', () => {
    const hits = [
      '帮我改一下', // 通用"改"
      '太难了', // rebalance 族
      '做成更有科幻感', // restyle 族
      '把出口换成金币', // replace 族（换成）
      '替换一下背景', // replace 族（替换）
      '改名为传送门', // rename 族（改名）
      '叫做星星门', // rename 族（叫做）
      '更名为北门', // rename 族（更名为）
      '调整一下', // tune 族（调整）
      '放远一点', // tune 族（放远）
      '太近了', // tune 族（太近）
    ];
    for (const input of hits) {
      expect(matchesAny(MODIFY_PATTERNS, input)).toBe(true);
    }
  });

  it('负样本不命中（普通陈述 / 探索 / 以及 add、remove 意图不属 MODIFY 族）', () => {
    const misses = [
      '今天天气不错',
      '继续',
      '为什么会发光',
      '再加两个障碍', // ADD 意图——不命中 MODIFY 族
      '移除出口', // REMOVE 意图——不命中 MODIFY 族
    ];
    for (const input of misses) {
      expect(matchesAny(MODIFY_PATTERNS, input)).toBe(false);
    }
  });
});

describe('correction：RESTORE 词表（08 §28 恢复子型，三词）与 isRestoreIntent', () => {
  it('三个恢复短语全部经 isRestoreIntent 命中', () => {
    for (const input of ['刚才那个更好', '退回刚才那个', '撤销刚才修改']) {
      expect(isRestoreIntent(input)).toBe(true);
    }
  });

  it('isRestoreIntent 负样本（普通修改 / 指代但非恢复 / 无关输入）', () => {
    expect(isRestoreIntent('帮我改一下')).toBe(false);
    expect(isRestoreIntent('刚才那个不错')).toBe(false); // 指代词命中但非恢复短语
    expect(isRestoreIntent('今天天气不错')).toBe(false);
  });

  it('RESTORE_PATTERNS 与 isRestoreIntent 判定一致（同一词表）', () => {
    for (const input of ['刚才那个更好', '退回刚才那个', '撤销刚才修改', '帮我改一下', '今天天气不错']) {
      expect(matchesAny(RESTORE_PATTERNS, input)).toBe(isRestoreIntent(input));
    }
  });
});

describe('correction：指代词表（D-02：命中 → 上一候选，6 词）', () => {
  it('刚才 / 那个 / 上一步 / 上一个 / 上一版 / 上一个版本 全部命中', () => {
    for (const word of ['刚才', '那个', '上一步', '上一个', '上一版', '上一个版本']) {
      expect(matchesAny(PREVIOUS_CANDIDATE_PATTERNS, `回到${word}`)).toBe(true);
    }
  });

  it('负样本不命中（无指代词的输入）', () => {
    expect(matchesAny(PREVIOUS_CANDIDATE_PATTERNS, '帮我改一下')).toBe(false);
    expect(matchesAny(PREVIOUS_CANDIDATE_PATTERNS, '继续')).toBe(false);
  });
});

describe('correction：纠正目标派生 deriveCorrectionTarget（D-02 三分支）', () => {
  it('指代词表命中 → previous_candidate（优先级最高，即使同时含创作分量词）', () => {
    const creation = makeCreation();
    expect(deriveCorrectionTarget('回到刚才', creation)).toEqual({ kind: 'previous_candidate' });
    expect(deriveCorrectionTarget('把刚才那个障碍改一下', creation)).toEqual({
      kind: 'previous_candidate', // 指代优先于创作分量（词表顺序）
    });
    expect(deriveCorrectionTarget('回到刚才')).toEqual({ kind: 'previous_candidate' });
  });

  it('有 creation 且同义词命中 → creation_component（component 为映射后的英文分量名）', () => {
    const creation = makeCreation();
    expect(deriveCorrectionTarget('把障碍改一下', creation)).toEqual({
      kind: 'creation_component',
      component: 'obstacle',
    });
    expect(deriveCorrectionTarget('调整一下出口', creation)).toEqual({
      kind: 'creation_component',
      component: 'exit',
    });
    expect(deriveCorrectionTarget('把难度调低', creation)).toEqual({
      kind: 'creation_component',
      component: 'difficulty',
    });
  });

  it('默认 → current_candidate（无指代且无分量命中；无 creation 时同义词不参与路由——如实锁定）', () => {
    const creation = makeCreation();
    expect(deriveCorrectionTarget('帮我改一下', creation)).toEqual({ kind: 'current_candidate' });
    expect(deriveCorrectionTarget('帮我改一下')).toEqual({ kind: 'current_candidate' });
    expect(deriveCorrectionTarget('把障碍改一下')).toEqual({ kind: 'current_candidate' }); // 分量映射仅在有 creation 时生效
  });
});
