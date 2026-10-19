import { describe, expect, it } from 'bun:test';
import {
  applyVisualPromptContract,
  buildVideoContinuationPrompt,
} from '../../src/lib/experience/visual-prompt';

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

describe('图像→视频接续提示词（G1.1）', () => {
  it('保留来源画面描述，并把用户新约束追加为运动/镜头要求', () => {
    const prompt = buildVideoContinuationPrompt(
      '月光下的猫蜷缩在窗台，宁静夜色',
      '把它做成视频，镜头缓缓推进'
    );
    expect(prompt).toContain('月光下的猫蜷缩在窗台');
    expect(prompt).toContain('镜头缓缓推进');
    expect(prompt).not.toContain('把它做成视频');
  });

  it('「把这张图做成视频」无新增约束时只保留来源画面描述', () => {
    const prompt = buildVideoContinuationPrompt(
      '海边灯塔，雾气弥漫',
      '把这张图做成视频'
    );
    expect(prompt).toBe('海边灯塔，雾气弥漫');
  });

  it('冒号/逗号后的约束完整保留（镜头、时长、动作）', () => {
    const prompt = buildVideoContinuationPrompt(
      '旧书摊，雨天，暖黄灯',
      '把这张图做成一段视频：镜头从书摊缓慢推向雨棚，持续 5 秒'
    );
    expect(prompt).toContain('旧书摊');
    expect(prompt).toContain('镜头从书摊缓慢推向雨棚，持续 5 秒');
    expect(prompt).not.toContain('做成一段视频');
  });
});
