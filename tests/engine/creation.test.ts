/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  nextCreationPhase,
  inheritCreationContext,
  extractCount,
  TARGET_SYNONYMS,
  extractTarget,
  interpretCreationInput,
  applyCreationPatchMeta,
  buildRestorePatch,
  interpretRestore,
} from '../../src/lib/experience/creation';
import type {
  CreationObject,
  CreationPatch,
  CreationPhase,
  CreationPhaseEvent,
} from '../../src/lib/experience/creation';

/**
 * 创作运行时纯逻辑（creation.ts，S2a 真实 LLM 适配版）。
 * 锁：子状态机 6 条合法迁移 + 其余 30 组合全拒（S1-04 纪律）、
 *     上下文继承五项（08 §4/§6/§25）、数量/目标确定性提取（08 §12）、
 *     输入解释四分支（08 §10 修改族 + §16 冲突判据 + §27 完成词表）、
 *     补丁登记不变式（version 恰好 +1 / userChanges 只追加 / content 不变）、
 *     RESTORE 恢复（08 §28；fromVersion = max(1, version - 1)）。
 * 契约依据：08 号契约 §4–§28 / S2A-F2-SEMANTIC-FREEZE（D-02/D-03/D-04/D-05）/
 *     E2 Stage 5。
 *
 * 注意：每条断言均先经临时脚本对真实实现逐一跑通后再落测试文件
 * （断言来自实际词表 / 迁移表，不发明契约）。
 */

function makeCreation(overrides?: Partial<CreationObject>): CreationObject {
  return {
    creationId: 'creation-1',
    sourceSession: 'session-1',
    sourceStateVersion: 3,
    concept: { theme: '深海生物发光', goal: '一个小游戏' },
    // 纯中文草稿：不含任何英文目标词（exit/obstacle/player/…），
    // 使 extractTarget 的 content 层不命中，便于分层断言。
    content: '第一版：一个极简文字迷宫——你从起点出发，沿途收集线索，抵达终点即获胜。',
    userChanges: [],
    version: 1,
    phase: 'PREVIEW',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const ALL_PHASES: ReadonlyArray<CreationPhase> = [
  'CREATE_INTENT',
  'CONTEXT_INHERIT',
  'MINIMAL_BUILD',
  'PREVIEW',
  'USER_FEEDBACK',
  'COMPLETE',
];

const ALL_EVENTS: ReadonlyArray<CreationPhaseEvent> = [
  'context_inherited',
  'minimal_built',
  'previewed',
  'feedback_started',
  'patch_applied',
  'completed',
];

/** 唯一合法组合（迁移表全集）。 */
const LEGAL_RULES: ReadonlyArray<{ from: CreationPhase; event: CreationPhaseEvent; to: CreationPhase }> = [
  { from: 'CREATE_INTENT', event: 'context_inherited', to: 'CONTEXT_INHERIT' },
  { from: 'CONTEXT_INHERIT', event: 'minimal_built', to: 'MINIMAL_BUILD' },
  { from: 'MINIMAL_BUILD', event: 'previewed', to: 'PREVIEW' },
  { from: 'PREVIEW', event: 'feedback_started', to: 'USER_FEEDBACK' },
  { from: 'USER_FEEDBACK', event: 'patch_applied', to: 'PREVIEW' },
  { from: 'USER_FEEDBACK', event: 'completed', to: 'COMPLETE' },
];

function expectIllegalPhase(from: CreationPhase, event: CreationPhaseEvent): void {
  expect(nextCreationPhase(from, event)).toBeNull();
}

describe('creation：子状态机——合法迁移（6 条全通，E2 Stage 5）', () => {
  it('迁移表 6 条逐一命中（CREATE_INTENT 一路走到 COMPLETE 的骨架）', () => {
    for (const rule of LEGAL_RULES) {
      expect(nextCreationPhase(rule.from, rule.event)).toBe(rule.to);
    }
  });

  it('主干全链路：CREATE_INTENT → CONTEXT_INHERIT → MINIMAL_BUILD → PREVIEW → USER_FEEDBACK → COMPLETE', () => {
    const chain: ReadonlyArray<[CreationPhaseEvent, CreationPhase]> = [
      ['context_inherited', 'CONTEXT_INHERIT'],
      ['minimal_built', 'MINIMAL_BUILD'],
      ['previewed', 'PREVIEW'],
      ['feedback_started', 'USER_FEEDBACK'],
      ['completed', 'COMPLETE'],
    ];
    let phase: CreationPhase = 'CREATE_INTENT';
    for (const [event, expected] of chain) {
      const next = nextCreationPhase(phase, event);
      expect(next).toBe(expected);
      phase = next as CreationPhase;
    }
    expect(phase).toBe('COMPLETE');
  });

  it('反馈循环多轮：USER_FEEDBACK→patch_applied→PREVIEW→feedback_started→USER_FEEDBACK 往复（08 §11 / 13 §21）', () => {
    let phase: CreationPhase = 'USER_FEEDBACK';
    for (let round = 0; round < 3; round += 1) {
      expect(nextCreationPhase(phase, 'patch_applied')).toBe('PREVIEW');
      phase = 'PREVIEW';
      expect(nextCreationPhase(phase, 'feedback_started')).toBe('USER_FEEDBACK');
      phase = 'USER_FEEDBACK';
    }
    // 多轮循环后完成仍合法（完成信号在任一轮反馈后可发出）
    expect(nextCreationPhase('USER_FEEDBACK', 'completed')).toBe('COMPLETE');
  });
});

describe('creation：子状态机——非法组合一律拒绝（S1-04 纪律）', () => {
  it('穷举 6×6 全矩阵：恰 6 条合法，其余 30 条一律返回 null', () => {
    let legal = 0;
    let illegal = 0;
    for (const phase of ALL_PHASES) {
      for (const event of ALL_EVENTS) {
        const result = nextCreationPhase(phase, event);
        const rule = LEGAL_RULES.find((r) => r.from === phase && r.event === event);
        if (rule) {
          expect(result).toBe(rule.to);
          legal += 1;
        } else {
          expect(result).toBeNull();
          illegal += 1;
        }
      }
    }
    expect(legal).toBe(6);
    expect(illegal).toBe(30);
  });

  it('越级跳步被拒绝（CREATE_INTENT 上 minimal_built / previewed / feedback_started / completed 等）', () => {
    expectIllegalPhase('CREATE_INTENT', 'minimal_built');
    expectIllegalPhase('CREATE_INTENT', 'previewed');
    expectIllegalPhase('CREATE_INTENT', 'feedback_started');
    expectIllegalPhase('CREATE_INTENT', 'completed');
    expectIllegalPhase('CONTEXT_INHERIT', 'previewed');
    expectIllegalPhase('CONTEXT_INHERIT', 'feedback_started');
    expectIllegalPhase('CONTEXT_INHERIT', 'completed');
    expectIllegalPhase('MINIMAL_BUILD', 'feedback_started');
    expectIllegalPhase('MINIMAL_BUILD', 'completed');
  });

  it('倒退 / 自环被拒绝（阶段指针只能沿表前进）', () => {
    expectIllegalPhase('CONTEXT_INHERIT', 'context_inherited');
    expectIllegalPhase('MINIMAL_BUILD', 'context_inherited');
    expectIllegalPhase('MINIMAL_BUILD', 'minimal_built');
    expectIllegalPhase('PREVIEW', 'context_inherited');
    expectIllegalPhase('PREVIEW', 'minimal_built');
    expectIllegalPhase('PREVIEW', 'previewed');
    expectIllegalPhase('USER_FEEDBACK', 'context_inherited');
    expectIllegalPhase('USER_FEEDBACK', 'minimal_built');
    expectIllegalPhase('USER_FEEDBACK', 'previewed');
    expectIllegalPhase('USER_FEEDBACK', 'feedback_started');
  });

  it('patch_applied 仅可从 USER_FEEDBACK 发出（CREATE_INTENT / CONTEXT_INHERIT / MINIMAL_BUILD / PREVIEW 全拒）', () => {
    expectIllegalPhase('CREATE_INTENT', 'patch_applied');
    expectIllegalPhase('CONTEXT_INHERIT', 'patch_applied');
    expectIllegalPhase('MINIMAL_BUILD', 'patch_applied');
    expectIllegalPhase('PREVIEW', 'patch_applied');
  });

  it('PREVIEW 上 completed 被拒绝——完成只能从 USER_FEEDBACK 发出（13 §21：补丁必经预览，完成前用户必见预览）', () => {
    expectIllegalPhase('PREVIEW', 'completed');
    // 完成信号亦不得越级直发
    expectIllegalPhase('CREATE_INTENT', 'completed');
    expectIllegalPhase('CONTEXT_INHERIT', 'completed');
    expectIllegalPhase('MINIMAL_BUILD', 'completed');
  });

  it('终态 COMPLETE 上任何事件均返回 null（零续行）', () => {
    for (const event of ALL_EVENTS) {
      expectIllegalPhase('COMPLETE', event);
    }
  });
});

describe('creation：上下文继承五项（08 §4/§6/§25）', () => {
  it('主题透传 + 理解/尝试计数标签（×N，仅 N>0 时加入；范围外动作不计入）', () => {
    const inherited = inheritCreationContext({
      theme: '深海生物发光',
      actionHistory: [
        'DIRECT_ANSWER',
        'DIRECT_ANSWER',
        'WHY',
        'WHAT_IF',
        'WHAT_IF',
        'WHAT_IF',
        'CHANGE_DIRECTION',
        'CORRECTION', // 不属继承计数范围——如实忽略
      ],
      createInput: '做成一个小游戏。',
    });
    expect(inherited).toEqual({
      theme: '深海生物发光',
      understood: ['direct_answer_delivered×2', 'explanation_delivered×1'],
      coreVariables: [],
      attempted: ['what_if_simulation×3', 'direction_change×1'],
      newGoal: '一个小游戏',
    });
  });

  it('空历史：understood / attempted 均为空数组（零计数不入表）', () => {
    expect(
      inheritCreationContext({ theme: 't', actionHistory: [], createInput: '我想要一个塔防游戏' }),
    ).toEqual({
      theme: 't',
      understood: [],
      coreVariables: [],
      attempted: [],
      newGoal: '我想要一个塔防游戏',
    });
  });

  it('仅 WHY 命中时 attempted 为空（理解与尝试两栏独立）', () => {
    expect(inheritCreationContext({ theme: 't', actionHistory: ['WHY'], createInput: 'x' })).toEqual({
      theme: 't',
      understood: ['explanation_delivered×1'],
      coreVariables: [],
      attempted: [],
      newGoal: 'x',
    });
  });

  it('newGoal 解析："做成一个小游戏。" → "一个小游戏"（全角句号剥离）', () => {
    expect(
      inheritCreationContext({ theme: 't', actionHistory: [], createInput: '做成一个小游戏。' }).newGoal,
    ).toBe('一个小游戏');
  });

  it('newGoal 解析：半角句号同样剥离（"帮我做成一个迷宫." → "一个迷宫"）', () => {
    expect(
      inheritCreationContext({ theme: 't', actionHistory: [], createInput: '帮我做成一个迷宫.' }).newGoal,
    ).toBe('一个迷宫');
  });

  it('newGoal 未命中"做成 X"用 createInput 原文（含"做成"后无内容的最小输入）', () => {
    expect(inheritCreationContext({ theme: 't', actionHistory: [], createInput: '做成' }).newGoal).toBe('做成');
  });

  it('coreVariables 恒为空数组（真实 LLM 模式下由最小构建提供——即使历史丰富也不提取）', () => {
    const inherited = inheritCreationContext({
      theme: 't',
      actionHistory: ['DIRECT_ANSWER', 'WHY', 'WHAT_IF', 'CHANGE_DIRECTION'],
      createInput: '做成一个东西',
    });
    expect(inherited.coreVariables).toEqual([]);
  });
});

describe('creation：数量提取 extractCount（08 §12，确定性词表）', () => {
  it('全值域：两/2→2、三/3→3、四/4→4、五/5→5、十/10→10', () => {
    expect(extractCount('再加两个障碍')).toBe(2);
    expect(extractCount('来2个')).toBe(2);
    expect(extractCount('加三个')).toBe(3);
    expect(extractCount('加3个')).toBe(3);
    expect(extractCount('加四个')).toBe(4);
    expect(extractCount('4个')).toBe(4);
    expect(extractCount('加五个')).toBe(5);
    expect(extractCount('5个')).toBe(5);
    expect(extractCount('加十个')).toBe(10);
    expect(extractCount('来10个')).toBe(10);
  });

  it('默认 1（无数词 / 空输入）', () => {
    expect(extractCount('加一个')).toBe(1);
    expect(extractCount('帮我加一些')).toBe(1);
    expect(extractCount('')).toBe(1);
  });

  it('词表按序首个命中，不做算术（"两三"→2；"12"含"2"→2——如实锁定确定性表的行为）', () => {
    expect(extractCount('两三')).toBe(2);
    expect(extractCount('12')).toBe(2);
  });
});

describe('creation：目标同义词表 TARGET_SYNONYMS（全 8 条，单一词表两处路由）', () => {
  it('8 条映射逐词命中（含多词同项）', () => {
    const cases: ReadonlyArray<[string, string]> = [
      ['出口', 'exit'],
      ['障碍', 'obstacle'],
      ['玩家', 'player'],
      ['角色', 'player'],
      ['时间', 'time_limit'],
      ['时限', 'time_limit'],
      ['难度', 'difficulty'],
      ['资源', 'resource'],
      ['分数', 'score'],
      ['得分', 'score'],
      ['关卡', 'level'],
    ];
    expect(TARGET_SYNONYMS).toHaveLength(8);
    for (const [word, target] of cases) {
      const hit = TARGET_SYNONYMS.find((synonym) => synonym.pattern.test(word));
      expect(hit?.target).toBe(target);
    }
  });
});

describe('creation：目标提取 extractTarget（三层确定性）', () => {
  it('第一层：中文同义词命中——优先于 content（输入词表权威）', () => {
    const creation = makeCreation({ content: '草稿里只有 obstacle。' });
    expect(extractTarget('移除出口', creation)).toBe('exit');
    expect(extractTarget('再加两个障碍', creation)).toBe('obstacle');
  });

  it('第二层：输入未命中同义词时，取 content 首个命中的英文目标词（真实 LLM 适配）', () => {
    expect(extractTarget('帮我调整一下', makeCreation({ content: '版本草稿：迷宫中放置 player 与 exit。' }))).toBe('exit');
    expect(extractTarget('帮我调整一下', makeCreation({ content: '草稿：迷宫中放置若干 obstacle。' }))).toBe('obstacle');
    expect(extractTarget('帮我调整一下', makeCreation({ content: '草稿：你操纵 player 前进。' }))).toBe('player');
  });

  it('第三层：同义词与 content 均未命中 → 默认作品级 "creation"', () => {
    expect(extractTarget('帮我调整一下', makeCreation())).toBe('creation');
    expect(extractTarget('调整一下', makeCreation({ content: '' }))).toBe('creation');
  });
});

describe('creation：输入解释 interpretCreationInput——完成词表（08 §27）', () => {
  it('四词全部命中 completion（"好了"由通用 STOP 分类覆盖，此处补齐其余词）', () => {
    for (const word of ['就这样', '可以了', '完成', '这个就是我想要的']) {
      expect(interpretCreationInput(word, makeCreation())).toEqual({ kind: 'completion' });
    }
  });
});

describe('creation：输入解释——add / remove 分支（08 §10/§12）', () => {
  it('"再加两个障碍" → add / obstacle / count 2', () => {
    expect(interpretCreationInput('再加两个障碍', makeCreation())).toEqual({
      kind: 'modification',
      patch: { operation: 'add', target: 'obstacle', change: { count: 2 }, summary: '再加两个障碍' },
    });
  });

  it('"移除出口" → remove / exit / count 1（无数词默认 1）', () => {
    expect(interpretCreationInput('移除出口', makeCreation())).toEqual({
      kind: 'modification',
      patch: { operation: 'remove', target: 'exit', change: { count: 1 }, summary: '移除出口' },
    });
  });
});

describe('creation：输入解释——modify 分支（08 §10 子型，rebalance > restyle > replace > rename > tune）', () => {
  it('"太难了" / "太简单了" → rebalance', () => {
    for (const input of ['太难了', '太简单了']) {
      expect(interpretCreationInput(input, makeCreation())).toEqual({
        kind: 'modification',
        patch: { operation: 'modify', target: 'creation', change: { kind: 'rebalance' }, summary: input },
      });
    }
  });

  it('"做成更有科幻感" → restyle', () => {
    expect(interpretCreationInput('做成更有科幻感', makeCreation())).toEqual({
      kind: 'modification',
      patch: { operation: 'modify', target: 'creation', change: { kind: 'restyle' }, summary: '做成更有科幻感' },
    });
  });

  it('"改名叫做传送门" → rename 且带 to（冻结正则 /改名为?(.+?)[。.]?$/ 捕获"改名"之后全部文本，如实锁定）', () => {
    expect(interpretCreationInput('改名叫做传送门', makeCreation())).toEqual({
      kind: 'modification',
      patch: {
        operation: 'modify',
        target: 'creation',
        change: { kind: 'rename', to: '叫做传送门' },
        summary: '改名叫做传送门',
      },
    });
  });

  it('"改名为传送门。" → rename / to="传送门"（句号剥离；"为"可选被吸收）', () => {
    expect(interpretCreationInput('改名为传送门。', makeCreation())).toEqual({
      kind: 'modification',
      patch: {
        operation: 'modify',
        target: 'creation',
        change: { kind: 'rename', to: '传送门' },
        summary: '改名为传送门。',
      },
    });
  });

  it('"把出口放远一点" → tune（目标经同义词表 → exit）', () => {
    expect(interpretCreationInput('把出口放远一点', makeCreation())).toEqual({
      kind: 'modification',
      patch: { operation: 'modify', target: 'exit', change: { kind: 'tune' }, summary: '把出口放远一点' },
    });
  });

  it('replace 子型的真实可达性（如实锁定）：换成/替换 必含"换"字，恒同时命中 CHANGE_DIRECTION 冲突轴 → 一律 ambiguous，不落 modification', () => {
    // 08 §16 冲突纪律压过替换意图：含"换成/替换"的输入永远走澄清问题，
    // {kind:'replace'} 的 modification 分支在冻结词表下不可达——与参考实现一致。
    expect(interpretCreationInput('把障碍换成金币', makeCreation()).kind).toBe('ambiguous');
    expect(interpretCreationInput('替换一下背景', makeCreation()).kind).toBe('ambiguous');
  });
});

describe('creation：输入解释——冲突判据（08 §16：命中修改意图又命中冲突轴 → ambiguous）', () => {
  const QUESTION = (label: string) =>
    `这一句既像在修改当前作品，又像想${label}。先确认一下：它是作为作品的修改，还是作为${label}？`;

  it('"换个角度改一下" → ambiguous / CHANGE_DIRECTION', () => {
    expect(interpretCreationInput('换个角度改一下', makeCreation())).toEqual({
      kind: 'ambiguous',
      conflictingAxis: 'CHANGE_DIRECTION',
      question: QUESTION('换个方向'),
    });
  });

  it('"不要这个了，去掉障碍" → ambiguous / CHANGE_DIRECTION（remove 意图被冲突遮蔽）', () => {
    expect(interpretCreationInput('不要这个了，去掉障碍', makeCreation())).toEqual({
      kind: 'ambiguous',
      conflictingAxis: 'CHANGE_DIRECTION',
      question: QUESTION('换个方向'),
    });
  });

  it('"如果加两个障碍" → ambiguous / WHAT_IF（add 意图被冲突遮蔽）', () => {
    expect(interpretCreationInput('如果加两个障碍', makeCreation())).toEqual({
      kind: 'ambiguous',
      conflictingAxis: 'WHAT_IF',
      question: QUESTION('做个假设推演'),
    });
  });

  it('"为什么这里改了" → ambiguous / WHY', () => {
    expect(interpretCreationInput('为什么这里改了', makeCreation())).toEqual({
      kind: 'ambiguous',
      conflictingAxis: 'WHY',
      question: QUESTION('追问原因'),
    });
  });

  it('"不是，把出口改一下" → ambiguous / CORRECTION（四轴全覆盖）', () => {
    expect(interpretCreationInput('不是，把出口改一下', makeCreation())).toEqual({
      kind: 'ambiguous',
      conflictingAxis: 'CORRECTION',
      question: QUESTION('纠正一下刚才的理解'),
    });
  });
});

describe('creation：输入解释——none（词表未命中，不发明语义）', () => {
  it('"嗯嗯" / "今天天气不错" → none（由运行时诚实升级处理）', () => {
    expect(interpretCreationInput('嗯嗯', makeCreation())).toEqual({ kind: 'none' });
    expect(interpretCreationInput('今天天气不错', makeCreation())).toEqual({ kind: 'none' });
  });
});

describe('creation：补丁登记 applyCreationPatchMeta（登记权威 / 内容分离——真实 LLM 适配）', () => {
  const addPatch: CreationPatch = {
    operation: 'add',
    target: 'obstacle',
    change: { count: 2 },
    summary: '再加两个障碍',
  };

  it('version 恰好 +1、updatedAt=now、userChanges 追加 {version, at, patch}', () => {
    const next = applyCreationPatchMeta(makeCreation(), addPatch, '2026-01-02T00:00:00.000Z');
    expect(next.version).toBe(2);
    expect(next.updatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(next.userChanges).toEqual([
      { version: 2, at: '2026-01-02T00:00:00.000Z', patch: addPatch },
    ]);
  });

  it('content 逐字节不变（本函数只管版本与登记；内容由 runtime 经 LLM 另行写入）', () => {
    const creation = makeCreation();
    const next = applyCreationPatchMeta(creation, addPatch, 't');
    expect(next.content).toBe(creation.content);
    expect(next.content.length).toBe(creation.content.length);
    expect(next.phase).toBe(creation.phase); // 阶段迁移不经补丁函数（另一条轨道）
  });

  it('原对象不被 mutate（深拷贝：concept / userChanges 均为新引用，旧记录不可变）', () => {
    const creation = makeCreation({
      userChanges: [{ version: 1, at: '2026-01-01T00:00:00.000Z', patch: addPatch }],
    });
    const before = JSON.parse(JSON.stringify(creation)) as CreationObject;
    const next = applyCreationPatchMeta(creation, addPatch, '2026-01-02T00:00:00.000Z');
    expect(creation).toEqual(before); // 原对象保持原状
    expect(next.concept).not.toBe(creation.concept);
    expect(next.userChanges).not.toBe(creation.userChanges);
    expect(creation.userChanges).toHaveLength(1); // 旧登记不追加
  });

  it('登记后的 patch 与外部后续修改隔离（登记时深拷贝）', () => {
    const mutable: CreationPatch = { operation: 'add', target: 'exit', change: { count: 1 }, summary: 's' };
    const next = applyCreationPatchMeta(makeCreation(), mutable, 't');
    mutable.change.count = 99;
    mutable.summary = 'hacked';
    expect(next.userChanges[0].patch).toEqual({ operation: 'add', target: 'exit', change: { count: 1 }, summary: 's' });
  });

  it('连续 3 次补丁版本 1→2→3→4 单调、userChanges 0→3 累积、旧版本对象不被后续补丁改动', () => {
    const v1 = makeCreation();
    const v2 = applyCreationPatchMeta(v1, addPatch, '2026-01-02T00:00:00.000Z');
    const v3 = applyCreationPatchMeta(v2, addPatch, '2026-01-03T00:00:00.000Z');
    const v4 = applyCreationPatchMeta(v3, addPatch, '2026-01-04T00:00:00.000Z');
    expect([v1.version, v2.version, v3.version, v4.version]).toEqual([1, 2, 3, 4]);
    expect([v1.userChanges.length, v2.userChanges.length, v3.userChanges.length, v4.userChanges.length]).toEqual([0, 1, 2, 3]);
    expect(v2.userChanges[0].version).toBe(2); // 旧对象的登记不因后续补丁改变
    expect(v4.userChanges.map((change) => change.version)).toEqual([2, 3, 4]);
    expect(v4.content).toBe(v1.content); // 三次补丁后 content 仍逐字节不变
  });
});

describe('creation：恢复 interpretRestore / buildRestorePatch（08 §28；RESTORE 词表来自 correction.ts）', () => {
  it('buildRestorePatch：{operation:"restore", target:"creation", change:{restoreFromVersion}, summary}', () => {
    expect(buildRestorePatch(makeCreation(), 2, '刚才那个更好')).toEqual({
      operation: 'restore',
      target: 'creation',
      change: { restoreFromVersion: 2 },
      summary: '刚才那个更好',
    });
  });

  it('"刚才那个更好"（version=3）→ restore 补丁 restoreFromVersion=2（version-1）', () => {
    const creation = makeCreation({ version: 3 });
    expect(interpretRestore('刚才那个更好', creation)).toEqual({
      kind: 'restore',
      patch: {
        operation: 'restore',
        target: 'creation',
        change: { restoreFromVersion: 2 },
        summary: '刚才那个更好',
      },
    });
  });

  it('无历史可回（version=1）→ fromVersion 收敛为 1（版本指针永不回退到 1 以下）', () => {
    const creation = makeCreation({ version: 1 });
    expect(interpretRestore('退回刚才那个', creation)).toEqual({
      kind: 'restore',
      patch: {
        operation: 'restore',
        target: 'creation',
        change: { restoreFromVersion: 1 },
        summary: '退回刚才那个',
      },
    });
  });

  it('未命中 RESTORE 词表 → null（"帮我改一下" 走修改轨道；"这个更好" 缺"刚才那个"不构成恢复）', () => {
    const creation = makeCreation({ version: 3 });
    expect(interpretRestore('帮我改一下', creation)).toBeNull();
    expect(interpretRestore('这个更好', creation)).toBeNull();
  });
});
