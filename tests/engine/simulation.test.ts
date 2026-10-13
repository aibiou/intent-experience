/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  applyBranchOperation,
  deriveSimulationSeparation,
  interpretBranchOperation,
  recordSimulationRound,
  validateBranchOperation,
} from '../../src/lib/experience/simulation';
import type {
  BranchRecord,
  SimulationDomainState,
  SimulationRoundRecord,
  SimulationSeparation,
} from '../../src/lib/experience/simulation';

/**
 * 模拟域（simulation.ts）——WHAT_IF 四元分离 + 分支操作 + 轮次登记。
 * 契约依据：S2A-F4-SEMANTIC-FREEZE-01 v1.0.0（四元分离 E8-G2-CC07 /
 * D-02 轴外分支子状态机 / D-03 四操作最小集 + WHAT_IF 首轮自动 CREATE /
 * D-04 会话内持久 / S2-BRANCH-REFLOW-DEF-01 v1.0.0 第五操作 ADOPT_BRANCH）。
 * 切片边界：S2a = 会话内持久（不引入 S3a 跨会话分支持久化）。
 * 纯逻辑：零 DB / 零网络；所有函数输入数组 / 状态 → 新数组 / 新状态，不 mutate 入参。
 *
 * 注意：断言均从实现的实际词表 / 状态迁移出发（语义权威源：
 * intent-experience 仓库 src/experience/simulation.ts），不发明期望契约。
 */

const NOW = '2025-05-01T10:00:00.000Z';
const LATER = '2025-05-02T10:00:00.000Z';

function makeSeparation(n: number): SimulationSeparation {
  return { fact: `事实${n}`, inference: `推断${n}`, hypothesis: `假设${n}`, simulation: `模拟${n}` };
}

function makeRound(n: number, branchId: string): SimulationRoundRecord {
  return {
    roundId: `sim_round_${String(n).padStart(4, '0')}`,
    round: n,
    branchId,
    sourceInput: `第 ${n} 轮 WHAT_IF 输入`,
    separation: makeSeparation(n),
    stateVersion: n,
    recordedAt: NOW,
  };
}

function makeBranch(branchId: string, roundNums: number[], overrides: Partial<BranchRecord> = {}): BranchRecord {
  const rounds = roundNums.map((n) => makeRound(n, branchId));
  return {
    branchId,
    sourceRound: roundNums.length > 0 ? roundNums[0] : 1,
    rounds,
    version: rounds.length,
    lifecycle: 'ACTIVE',
    adopted: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function emptyState(): SimulationDomainState {
  return { rounds: [], branches: [], currentBranchId: null, roundCounter: 0, branchCounter: 0 };
}

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('simulation：四元分离派生（E8-G2-CC07）', () => {
  it('完整四段内容按标记正确切分；simulation = 全文', () => {
    const content =
      '事实——雨声会掩盖环境噪声。推断——掩蔽效应降低警觉需求。假设——这可能是雨声助眠的原因。本提案以三十分钟雨声场景模拟放松过程。';
    const separation = deriveSimulationSeparation(content);
    expect(separation.fact).toBe('雨声会掩盖环境噪声。');
    expect(separation.inference).toBe('掩蔽效应降低警觉需求。');
    expect(separation.hypothesis).toBe('这可能是雨声助眠的原因');
    expect(separation.simulation).toBe(content);
  });

  it('缺尾部标记：假设段切到全文末尾', () => {
    const content = '事实——A。推断——B。假设——C。';
    const separation = deriveSimulationSeparation(content);
    expect(separation.fact).toBe('A。');
    expect(separation.inference).toBe('B。');
    expect(separation.hypothesis).toBe('C。');
    expect(separation.simulation).toBe(content);
  });

  it('缺标记空串容错：无任何标记 → 三段空串、simulation 仍为全文', () => {
    const content = '这里没有任何分段标记的普通模拟内容。';
    const separation = deriveSimulationSeparation(content);
    expect(separation.fact).toBe('');
    expect(separation.inference).toBe('');
    expect(separation.hypothesis).toBe('');
    expect(separation.simulation).toBe(content);
  });

  it('缺标记空串容错：仅假设标记 + 尾标记 → 事实 / 推断为空串', () => {
    const content = '假设——只有假设段。本提案其余略。';
    const separation = deriveSimulationSeparation(content);
    expect(separation.fact).toBe('');
    expect(separation.inference).toBe('');
    expect(separation.hypothesis).toBe('只有假设段');
    expect(separation.simulation).toBe(content);
  });

  it('空内容 → 全部空串', () => {
    expect(deriveSimulationSeparation('')).toEqual({ fact: '', inference: '', hypothesis: '', simulation: '' });
  });

  it('确定性：同输入重复解析结果一致', () => {
    const content = '事实——X。推断——Y。假设——Z。本提案W。';
    expect(deriveSimulationSeparation(content)).toEqual(deriveSimulationSeparation(content));
  });
});

describe('simulation：分支操作识别（D-03 词表 + ADOPT_BRANCH）', () => {
  it('RETURN 词表五词全部命中（无目标序号需求）', () => {
    const inputs = ['返回主线', '回到主线', '返回主模拟', '回到主模拟', '返回主上下文'];
    for (const input of inputs) {
      expect(interpretBranchOperation(input)).toEqual({ operation: 'RETURN', targetOrdinal: null });
    }
  });

  it('RETURN 优先于作用域操作（混合句确定性）', () => {
    expect(interpretBranchOperation('返回主线，顺便看看分支二')).toEqual({
      operation: 'RETURN',
      targetOrdinal: null,
    });
    expect(interpretBranchOperation('我想返回主模拟了')).toEqual({ operation: 'RETURN', targetOrdinal: null });
  });

  it('中文数字序号：“切换到分支二” → SWITCH / 2', () => {
    expect(interpretBranchOperation('切换到分支二')).toEqual({ operation: 'SWITCH', targetOrdinal: 2 });
  });

  it('阿拉伯数字序号（含空格）：“查看分支 3” → SWITCH / 3', () => {
    expect(interpretBranchOperation('查看分支 3')).toEqual({ operation: 'SWITCH', targetOrdinal: 3 });
  });

  it('ABANDON：“放弃分支一” → 1；“丢弃分支 2” → 2', () => {
    expect(interpretBranchOperation('放弃分支一')).toEqual({ operation: 'ABANDON', targetOrdinal: 1 });
    expect(interpretBranchOperation('丢弃分支 2')).toEqual({ operation: 'ABANDON', targetOrdinal: 2 });
  });

  it('ADOPT_BRANCH：“采用分支1” → 1；“采纳分支十” → 10（中文数字映射上界）', () => {
    expect(interpretBranchOperation('采用分支1')).toEqual({ operation: 'ADOPT_BRANCH', targetOrdinal: 1 });
    expect(interpretBranchOperation('采纳分支十')).toEqual({ operation: 'ADOPT_BRANCH', targetOrdinal: 10 });
  });

  it('无作用域词 → null（未命中走通用 SIMULATE 路径）', () => {
    expect(interpretBranchOperation('切换到那个')).toBeNull();
    expect(interpretBranchOperation('放弃一下')).toBeNull();
  });

  it('有序号需求但不可解析 → null：“删除分支”', () => {
    expect(interpretBranchOperation('删除分支')).toBeNull();
  });

  it('序号 0（越下界）→ null', () => {
    expect(interpretBranchOperation('查看分支0')).toBeNull();
  });

  it('作用域词“支线”命中但序号模式要求“分支”字样 → null（词表实现细节，与参考实现一致）', () => {
    expect(interpretBranchOperation('切换到支线二')).toBeNull();
  });

  it('作用域命中但无操作词 → null', () => {
    expect(interpretBranchOperation('分支三不错')).toBeNull();
  });

  it('混合操作词优先级：SWITCH > ABANDON > ADOPT_BRANCH', () => {
    expect(interpretBranchOperation('切换并放弃分支三')).toEqual({ operation: 'SWITCH', targetOrdinal: 3 });
    expect(interpretBranchOperation('放弃并采用分支三')).toEqual({ operation: 'ABANDON', targetOrdinal: 3 });
  });
});

describe('simulation：分支操作前置校验（validateBranchOperation）', () => {
  function twoBranches(): BranchRecord[] {
    return [makeBranch('branch_0001', [1, 2]), makeBranch('branch_0002', [3])];
  }

  it('RETURN 无激活分支 → 拒绝（INVALID_STATE_TRANSITION）', () => {
    const result = validateBranchOperation(twoBranches(), null, { operation: 'RETURN', targetOrdinal: null });
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('unreachable');
    }
    expect(result.code).toBe('INVALID_STATE_TRANSITION');
    expect(result.reason).toContain('no active simulation branch');
  });

  it('RETURN 有激活分支 → 通过', () => {
    const result = validateBranchOperation(twoBranches(), 'branch_0002', { operation: 'RETURN', targetOrdinal: null });
    expect(result).toEqual({ ok: true });
  });

  it('序号越界（0 / 超出分支数 / null）→ 拒绝', () => {
    const branches = twoBranches();
    for (const ordinal of [0, 3]) {
      const result = validateBranchOperation(branches, 'branch_0001', { operation: 'SWITCH', targetOrdinal: ordinal });
      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error('unreachable');
      }
      expect(result.code).toBe('INVALID_STATE_TRANSITION');
      expect(result.reason).toContain('does not resolve');
    }
    const nullOrdinal = validateBranchOperation(branches, 'branch_0001', {
      operation: 'ABANDON',
      targetOrdinal: null,
    });
    expect(nullOrdinal.ok).toBe(false);
  });

  it('目标 ABANDONED → 拒绝（SWITCH / ABANDON / ADOPT_BRANCH 均不可操作已放弃分支）', () => {
    const branches = [makeBranch('branch_0001', [1, 2]), makeBranch('branch_0002', [3], { lifecycle: 'ABANDONED' })];
    for (const operation of ['SWITCH', 'ABANDON', 'ADOPT_BRANCH'] as const) {
      const result = validateBranchOperation(branches, 'branch_0001', { operation, targetOrdinal: 2 });
      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error('unreachable');
      }
      expect(result.code).toBe('INVALID_STATE_TRANSITION');
      expect(result.reason).toContain('ABANDONED');
    }
  });

  it('合法目标 → 通过（SWITCH / ABANDON / ADOPT_BRANCH）', () => {
    const branches = twoBranches();
    for (const operation of ['SWITCH', 'ABANDON', 'ADOPT_BRANCH'] as const) {
      expect(validateBranchOperation(branches, 'branch_0001', { operation, targetOrdinal: 1 })).toEqual({ ok: true });
    }
  });
});

describe('simulation：分支操作应用（applyBranchOperation——四操作状态转移）', () => {
  function twoBranches(): BranchRecord[] {
    return [makeBranch('branch_0001', [1, 2]), makeBranch('branch_0002', [3])];
  }

  it('RETURN：当前分支 → RETURNED、指针清空、summary 说明返回主线 + 下一轮自动开新分支', () => {
    const branches = twoBranches();
    const before = snapshot(branches);
    const result = applyBranchOperation(branches, 'branch_0002', { operation: 'RETURN', targetOrdinal: null }, LATER);
    expect(result.currentBranchId).toBeNull();
    expect(result.branch.branchId).toBe('branch_0002');
    expect(result.branch.lifecycle).toBe('RETURNED');
    expect(result.branch.updatedAt).toBe(LATER);
    expect(result.branches[1].lifecycle).toBe('RETURNED');
    expect(result.branches[0].lifecycle).toBe('ACTIVE'); // 非当前分支不受影响
    expect(result.summary).toContain('mainline');
    expect(result.summary).toContain('auto-creates');
    expect(result.branches).not.toBe(branches); // 返回新数组
    expect(branches).toEqual(before); // 不 mutate 入参
  });

  it('ABANDON 当前分支：目标 → ABANDONED、指针清空、记录保留至会话结束', () => {
    const branches = twoBranches();
    const result = applyBranchOperation(branches, 'branch_0002', { operation: 'ABANDON', targetOrdinal: 2 }, LATER);
    expect(result.branch.branchId).toBe('branch_0002');
    expect(result.branch.lifecycle).toBe('ABANDONED');
    expect(result.currentBranchId).toBeNull();
    expect(result.branches[1].lifecycle).toBe('ABANDONED');
    expect(result.branch.rounds).toHaveLength(1); // 记录保留（不删除）
    expect(result.summary).toContain('persist to session end');
    expect(branches[1].lifecycle).toBe('ACTIVE'); // 入参未被 mutate
  });

  it('ABANDON 非当前分支：指针不变', () => {
    const branches = twoBranches();
    const result = applyBranchOperation(branches, 'branch_0002', { operation: 'ABANDON', targetOrdinal: 1 }, LATER);
    expect(result.branches[0].lifecycle).toBe('ABANDONED');
    expect(result.currentBranchId).toBe('branch_0002');
  });

  it('ADOPT_BRANCH：adopted=true、指针不变、summary 说明不回流主线 + 须另行 CREATE', () => {
    const branches = twoBranches();
    const result = applyBranchOperation(branches, 'branch_0002', { operation: 'ADOPT_BRANCH', targetOrdinal: 2 }, LATER);
    expect(result.branch.adopted).toBe(true);
    expect(result.branch.lifecycle).toBe('ACTIVE'); // 生命周期不变（三态契约）
    expect(result.currentBranchId).toBe('branch_0002'); // 指针不变
    expect(result.branches[1].adopted).toBe(true);
    expect(result.branches[0].adopted).toBe(false);
    expect(result.summary).toContain('does not flow back');
    expect(result.summary).toContain('CREATE');
    expect(branches[1].adopted).toBe(false); // 入参未被 mutate
  });

  it('ADOPT_BRANCH 幂等：重复采用不改变已置标记', () => {
    const branches = twoBranches();
    const first = applyBranchOperation(branches, 'branch_0002', { operation: 'ADOPT_BRANCH', targetOrdinal: 2 }, LATER);
    const second = applyBranchOperation(first.branches, first.currentBranchId, { operation: 'ADOPT_BRANCH', targetOrdinal: 2 }, LATER);
    expect(second.branch.adopted).toBe(true);
    expect(second.branch.lifecycle).toBe('ACTIVE');
    expect(second.branch.rounds).toHaveLength(1);
  });

  it('ADOPT_BRANCH 于 RETURNED 分支：仅附加 adopted，生命周期保持 RETURNED', () => {
    const branches = [makeBranch('branch_0001', [1]), makeBranch('branch_0002', [2], { lifecycle: 'RETURNED' })];
    const result = applyBranchOperation(branches, null, { operation: 'ADOPT_BRANCH', targetOrdinal: 2 }, LATER);
    expect(result.branch.adopted).toBe(true);
    expect(result.branch.lifecycle).toBe('RETURNED');
    expect(result.currentBranchId).toBeNull(); // 主线当前上下文不变
  });

  it('SWITCH：目标 → ACTIVE、指针切换', () => {
    const branches = twoBranches();
    const result = applyBranchOperation(branches, 'branch_0002', { operation: 'SWITCH', targetOrdinal: 1 }, LATER);
    expect(result.branch.branchId).toBe('branch_0001');
    expect(result.branch.lifecycle).toBe('ACTIVE');
    expect(result.currentBranchId).toBe('branch_0001');
    expect(result.summary).toContain('switched to branch branch_0001');
  });

  it('SWITCH 恢复 RETURNED 分支：lifecycle → ACTIVE', () => {
    const branches = [makeBranch('branch_0001', [1]), makeBranch('branch_0002', [2], { lifecycle: 'RETURNED' })];
    const result = applyBranchOperation(branches, null, { operation: 'SWITCH', targetOrdinal: 2 }, LATER);
    expect(result.branch.lifecycle).toBe('ACTIVE');
    expect(result.currentBranchId).toBe('branch_0002');
  });

  it('四操作均不 mutate 入参数组', () => {
    const branches = twoBranches();
    const before = snapshot(branches);
    applyBranchOperation(branches, 'branch_0002', { operation: 'RETURN', targetOrdinal: null }, LATER);
    applyBranchOperation(branches, 'branch_0002', { operation: 'ABANDON', targetOrdinal: 2 }, LATER);
    applyBranchOperation(branches, 'branch_0002', { operation: 'ADOPT_BRANCH', targetOrdinal: 2 }, LATER);
    applyBranchOperation(branches, 'branch_0002', { operation: 'SWITCH', targetOrdinal: 1 }, LATER);
    expect(branches).toEqual(before);
  });
});

describe('simulation：模拟轮次登记（recordSimulationRound）', () => {
  it('首轮自动创建分支（D-03 CREATE）：branch_0001 / sourceRound=1 / ACTIVE', () => {
    const state = emptyState();
    const result = recordSimulationRound(state, {
      sourceInput: '如果用雨声助眠会怎样',
      separation: makeSeparation(1),
      stateVersion: 1,
      now: NOW,
    });
    expect(result.branchCreated).toBe(true);
    expect(result.branch.branchId).toBe('branch_0001');
    expect(result.branch.sourceRound).toBe(1);
    expect(result.branch.lifecycle).toBe('ACTIVE');
    expect(result.branch.adopted).toBe(false);
    expect(result.branch.version).toBe(1);
    expect(result.branch.rounds).toHaveLength(1);
    // 状态侧
    expect(result.state.rounds).toHaveLength(1);
    expect(result.state.branches).toHaveLength(1);
    expect(result.state.currentBranchId).toBe('branch_0001');
    expect(result.state.roundCounter).toBe(1);
    expect(result.state.branchCounter).toBe(1);
    // 轮次字段
    const round = result.state.rounds[0];
    expect(round.roundId).toBe('sim_round_0001');
    expect(round.round).toBe(1);
    expect(round.branchId).toBe('branch_0001');
    expect(round.sourceInput).toBe('如果用雨声助眠会怎样');
    expect(round.separation).toEqual(makeSeparation(1));
    expect(round.stateVersion).toBe(1);
    expect(round.recordedAt).toBe(NOW);
    // 不 mutate 入参
    expect(state).toEqual(emptyState());
  });

  it('第二轮入同分支：round=2、branch.version=2、不新建分支', () => {
    const first = recordSimulationRound(emptyState(), {
      sourceInput: 'r1',
      separation: makeSeparation(1),
      stateVersion: 1,
      now: NOW,
    });
    const second = recordSimulationRound(first.state, {
      sourceInput: 'r2',
      separation: makeSeparation(2),
      stateVersion: 2,
      now: LATER,
    });
    expect(second.branchCreated).toBe(false);
    expect(second.branch.branchId).toBe('branch_0001');
    expect(second.branch.rounds).toHaveLength(2);
    expect(second.branch.version).toBe(2);
    expect(second.branch.updatedAt).toBe(LATER);
    expect(second.state.rounds).toHaveLength(2);
    expect(second.state.branches).toHaveLength(1);
    expect(second.state.branchCounter).toBe(1);
    expect(second.state.roundCounter).toBe(2);
    expect(second.state.currentBranchId).toBe('branch_0001');
    expect(second.state.rounds[1].roundId).toBe('sim_round_0002');
    expect(second.state.rounds[1].round).toBe(2);
    // 上一轮结果未被 mutate（不可变历史）
    expect(first.state.rounds).toHaveLength(1);
    expect(first.state.rounds[0].round).toBe(1);
    expect(first.state.branches[0].rounds).toHaveLength(1);
  });

  it('rounds 全局编号跨分支连续：RETURN 后新一轮自动开新分支（branch_0002）', () => {
    const first = recordSimulationRound(emptyState(), {
      sourceInput: 'r1',
      separation: makeSeparation(1),
      stateVersion: 1,
      now: NOW,
    });
    const second = recordSimulationRound(first.state, {
      sourceInput: 'r2',
      separation: makeSeparation(2),
      stateVersion: 2,
      now: NOW,
    });
    const returned = applyBranchOperation(
      second.state.branches,
      second.state.currentBranchId,
      { operation: 'RETURN', targetOrdinal: null },
      NOW,
    );
    const stateAfterReturn: SimulationDomainState = {
      ...second.state,
      branches: returned.branches,
      currentBranchId: returned.currentBranchId,
    };
    expect(stateAfterReturn.currentBranchId).toBeNull();
    expect(stateAfterReturn.branches[0].lifecycle).toBe('RETURNED');
    const third = recordSimulationRound(stateAfterReturn, {
      sourceInput: 'r3',
      separation: makeSeparation(3),
      stateVersion: 3,
      now: LATER,
    });
    expect(third.branchCreated).toBe(true);
    expect(third.branch.branchId).toBe('branch_0002');
    expect(third.branch.sourceRound).toBe(3);
    expect(third.branch.lifecycle).toBe('ACTIVE');
    expect(third.state.rounds).toHaveLength(3);
    expect(third.state.rounds[2].round).toBe(3); // 跨分支连续编号
    expect(third.state.rounds[2].roundId).toBe('sim_round_0003');
    expect(third.state.rounds[2].branchId).toBe('branch_0002');
    expect(third.state.branchCounter).toBe(2);
    expect(third.state.branches[0].lifecycle).toBe('RETURNED'); // 旧分支保留（会话内持久——D-04）
    expect(third.state.branches[0].rounds).toHaveLength(2);
  });

  it('SWITCH 后新轮次入被切换分支（跨分支往返）', () => {
    const first = recordSimulationRound(emptyState(), {
      sourceInput: 'r1',
      separation: makeSeparation(1),
      stateVersion: 1,
      now: NOW,
    });
    const second = recordSimulationRound(first.state, {
      sourceInput: 'r2',
      separation: makeSeparation(2),
      stateVersion: 2,
      now: NOW,
    });
    const returned = applyBranchOperation(
      second.state.branches,
      second.state.currentBranchId,
      { operation: 'RETURN', targetOrdinal: null },
      NOW,
    );
    const third = recordSimulationRound(
      { ...second.state, branches: returned.branches, currentBranchId: returned.currentBranchId },
      { sourceInput: 'r3', separation: makeSeparation(3), stateVersion: 3, now: NOW },
    );
    expect(third.branch.branchId).toBe('branch_0002');
    const switched = applyBranchOperation(
      third.state.branches,
      third.state.currentBranchId,
      { operation: 'SWITCH', targetOrdinal: 1 },
      LATER,
    );
    expect(switched.currentBranchId).toBe('branch_0001');
    const fourth = recordSimulationRound(
      { ...third.state, branches: switched.branches, currentBranchId: switched.currentBranchId },
      { sourceInput: 'r4', separation: makeSeparation(4), stateVersion: 4, now: LATER },
    );
    expect(fourth.branchCreated).toBe(false);
    expect(fourth.branch.branchId).toBe('branch_0001');
    expect(fourth.branch.rounds).toHaveLength(3); // 两旧 + 一新
    expect(fourth.branch.version).toBe(3);
    expect(fourth.state.rounds).toHaveLength(4);
    expect(fourth.state.rounds[3].round).toBe(4);
    expect(fourth.state.rounds[3].branchId).toBe('branch_0001');
  });

  it('不 mutate 入参：输入状态在登记前后内容不变', () => {
    const first = recordSimulationRound(emptyState(), {
      sourceInput: 'r1',
      separation: makeSeparation(1),
      stateVersion: 1,
      now: NOW,
    });
    const before = snapshot(first.state);
    recordSimulationRound(first.state, {
      sourceInput: 'r2',
      separation: makeSeparation(2),
      stateVersion: 2,
      now: LATER,
    });
    expect(first.state).toEqual(before);
  });
});
