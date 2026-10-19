import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../src/lib/experience/prompt-engine';
import { initialSimulationDomain } from '../../src/lib/experience/types';
import type { ExperienceState } from '../../src/lib/experience/types';

const state: ExperienceState = {
  view: { status: 'WAITING', stage: 'UNDERSTANDING' },
  experienceId: 'custom',
  topic: '夜晚的萤火虫为什么会同步闪烁？',
  turn: 1,
  goal: { primary: 'understand', satisfaction: 0.2 },
  knowledge: { confirmed: [], inferred: [] },
  userModel: { questions: [], hypotheses: [], corrections: [] },
  variables: {},
  history: [],
  completion: { done: false, exitReason: null },
  creation: null,
  simulation: initialSimulationDomain(),
};

describe('buildSystemPrompt', () => {
  it('要求省略不可确认的人名与来源，禁止用近似译名兜底', () => {
    const prompt = buildSystemPrompt(state);
    expect(prompt).toContain('人名、作品、论文、机构、数据和来源');
    expect(prompt).toContain('不得编造近似名');
    expect(prompt).toContain('我不能确认具体出处');
  });
});
