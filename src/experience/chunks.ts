/**
 * 合成语料分块加载。
 *
 * 治理约束：语料全部为合成 fixtures（synthetic/ 前缀），
 * 不含真实用户数据；运行时不调用任何真实 LLM 提供方。
 */

import { directAnswer } from './fixtures/direct-answer';
import { why } from './fixtures/why';

export interface ChunkFixture {
  fixtureId: string;
  semanticAction: string;
  policyAction: string;
  chunks: string[];
}

const FIXTURES: Readonly<Record<string, ChunkFixture>> = {
  [directAnswer.semanticAction]: directAnswer,
  [why.semanticAction]: why,
};

export type ChunkResolution =
  | { ok: true; fixture: ChunkFixture }
  | { ok: false; code: 'NO_FIXTURE_FOR_ACTION'; semanticAction: string };

export function loadChunkFixture(semanticAction: string): ChunkResolution {
  const fixture = FIXTURES[semanticAction];
  if (!fixture) {
    return { ok: false, code: 'NO_FIXTURE_FOR_ACTION', semanticAction };
  }
  return { ok: true, fixture };
}
