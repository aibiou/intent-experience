import { describe, it, expect } from 'vitest';
import { RuntimeActions } from '../../src/experience/runtime-actions';
import type { StreamEvent } from '../../src/experience/stream';

/**
 * CR-56（2026-10-13）——captureLastResponse 跳过捕获行为。
 *
 * 呈现形式类收敛 REPEAT（「画成图片」）的收敛引导语不得入转录、
 * 不得覆盖 lastResponse——否则蒸馏会取到引导语而非上一轮真实
 * 回答，且后续「再说一遍」会重放引导语。
 */

function chunkEvent(content: string, index: number): StreamEvent {
  return {
    type: 'chunk',
    policyAction: 'REPEAT',
    semanticAction: 'REPEAT',
    fixtureId: 'fixture-test',
    index,
    totalChunks: 1,
    content,
    at: new Date().toISOString(),
  };
}

function doneEvent(): StreamEvent {
  return {
    type: 'done',
    policyAction: 'REPEAT',
    semanticAction: 'REPEAT',
    fixtureId: 'fixture-test',
    index: 1,
    totalChunks: 1,
    content: null,
    at: new Date().toISOString(),
  };
}

async function* streamOf(events: StreamEvent[]): AsyncGenerator<StreamEvent> {
  for (const event of events) {
    yield event;
  }
}

class TestRuntime extends RuntimeActions {
  public snapshotCalls: string[] = [];

  protected override snapshotSession(experienceId: string): void {
    this.snapshotCalls.push(experienceId);
  }

  public async run(
    experienceId: string,
    events: StreamEvent[],
    options?: { skipCapture?: boolean },
  ): Promise<StreamEvent[]> {
    const out: StreamEvent[] = [];
    for await (const event of this.captureLastResponse(
      experienceId,
      streamOf(events),
      options,
    )) {
      out.push(event);
    }
    return out;
  }

  public transcript(id: string) {
    return this.transcripts.get(id) ?? [];
  }

  public lastResponse(id: string) {
    return this.lastResponseByExperience.get(id);
  }
}

describe('captureLastResponse（CR-56 跳过捕获）', () => {
  it('普通内容轮：chunk 入转录、更新 lastResponse', async () => {
    const rt = new TestRuntime();
    const events = await rt.run('exp-1', [chunkEvent('完整回答正文', 0), doneEvent()]);
    expect(events.map((e) => e.type)).toEqual(['chunk', 'done']);
    expect(rt.transcript('exp-1')).toEqual([
      { role: 'assistant', text: '完整回答正文' },
    ]);
    expect(rt.lastResponse('exp-1')?.chunks).toEqual(['完整回答正文']);
    expect(rt.snapshotCalls).toContain('exp-1');
  });

  it('收敛 REPEAT（skipCapture=true）：事件原样转发但不入转录、不更新 lastResponse', async () => {
    const rt = new TestRuntime();
    const events = await rt.run(
      'exp-2',
      [chunkEvent('好的，把刚才的感受画成图片——正在生成，马上就好。', 0), doneEvent()],
      { skipCapture: true },
    );
    expect(events.map((e) => e.type)).toEqual(['chunk', 'done']);
    expect(events[0]?.content).toBe('好的，把刚才的感受画成图片——正在生成，马上就好。');
    expect(rt.transcript('exp-2')).toEqual([]);
    expect(rt.lastResponse('exp-2')).toBeUndefined();
    // 快照仍刷新（跨重启续讲不被破坏）
    expect(rt.snapshotCalls).toContain('exp-2');
  });

  it('收敛轮不污染既有内容：真实回答保留在转录与 lastResponse', async () => {
    const rt = new TestRuntime();
    // 先有一轮真实深入回答
    await rt.run('exp-3', [chunkEvent('风穿过树叶，穿过你的皮肤。', 0), doneEvent()]);
    // 再来一轮收敛 REPEAT（画成图片）
    await rt.run(
      'exp-3',
      [chunkEvent('好的，把刚才的感受画成图片——正在生成，马上就好。', 0), doneEvent()],
      { skipCapture: true },
    );
    // 转录里仍是真实回答，没有收敛引导
    expect(rt.transcript('exp-3')).toEqual([
      { role: 'assistant', text: '风穿过树叶，穿过你的皮肤。' },
    ]);
    // lastResponse 仍是真实回答（后续「再说一遍」拿得到原文）
    expect(rt.lastResponse('exp-3')?.chunks).toEqual(['风穿过树叶，穿过你的皮肤。']);
  });

  it('空轮次（无 chunk）：不登记，行为与 skipCapture 无关', async () => {
    const rt = new TestRuntime();
    await rt.run('exp-4', [doneEvent()]);
    expect(rt.transcript('exp-4')).toEqual([]);
    expect(rt.lastResponse('exp-4')).toBeUndefined();
  });
});
