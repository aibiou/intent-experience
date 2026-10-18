import { describe, expect, it } from 'bun:test';
import { applyVisualPromptContract } from '../../src/lib/experience/visual-prompt';

describe('视觉提示词履约层', () => {
  it('保留用户原有限定，并把它们声明为不可替换的硬约束', () => {
    const prompt = applyVisualPromptContract(
      '清晨薄雾中的灯塔观鸟站，保留门口的蓝色信封和长草',
    );
    expect(prompt).toContain('清晨薄雾中的灯塔观鸟站');
    expect(prompt).toContain('保留门口的蓝色信封和长草');
    expect(prompt).toContain('不得替换成相反的时间、天气或场景');
    expect(prompt).toContain('不得增删关键限定物');
  });

  it('适用于上下文蒸馏后的画面描述，而不是依赖某个固定场景词表', () => {
    const prompt = applyVisualPromptContract('晨雾里的湖边木栈道，一位老人在观察水鸟');
    expect(prompt).toContain('晨雾里的湖边木栈道');
    expect(prompt).toContain('不得加入水印或文字签名');
  });

  it('先剥除否定子句，避免提供方把“不是雪夜”渲染成雪夜', () => {
    const prompt = applyVisualPromptContract('暖秋渔港，保留干渔网，不是雪夜');
    expect(prompt).not.toContain('雪夜');
    expect(prompt).toContain('暖秋渔港');
    expect(prompt).toContain('保留干渔网');
  });
});
