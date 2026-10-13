import { describe, expect, it } from 'vitest';
import { classifyInput } from '../../src/experience/classifier';

/**
 * 意图分类（classifier.ts）——语义动作识别 + 优先级链。
 * 锁：STOP 永远优先 > CHANGE_DIRECTION > CORRECTION > CREATE >
 * DEEPEN = SIMPLIFY = REFRAME > WHY > WHAT_IF > DIRECT_ANSWER > CONTINUE/REPEAT。
 * 契约依据：P-01、PD-12、S2b（policy_v2.0.0 变更 4 冻结优先级链）、S4/S4A。
 */
describe('classifier：优先级链', () => {
  it('STOP 永远优先（P-01）', () => {
    expect(classifyInput('好了')).toEqual({ semanticAction: 'STOP' });
  });

  it('显式方向变更优先于探索继续（P-03）', () => {
    expect(classifyInput('换个话题')).toEqual({ semanticAction: 'CHANGE_DIRECTION' });
  });

  it('纠正优先于继续（G04-NEG / G07-NEG 基础）', () => {
    expect(classifyInput('我理解错了')).toEqual({ semanticAction: 'CORRECTION' });
  });

  it('创造意图（CREATE）', () => {
    expect(classifyInput('做一个像素头像')).toEqual({ semanticAction: 'CREATE' });
  });

  it('深入（DEEPEN——位于 CREATE 之后）', () => {
    expect(classifyInput('深入一点')).toEqual({ semanticAction: 'DEEPEN' });
  });

  it('为什么（WHY——PD-12 先于 WHAT_IF）', () => {
    expect(classifyInput('为什么光速是上限')).toEqual({ semanticAction: 'WHY' });
  });

  it('如果…会怎样（WHAT_IF）', () => {
    expect(classifyInput('如果会怎样')).toEqual({ semanticAction: 'WHAT_IF' });
  });
});
