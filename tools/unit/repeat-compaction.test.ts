import { describe, it, expect } from 'vitest';
import {
  shouldCompactReplay,
  resolveDistillDesignText,
} from '../../src/experience/generation-intent';

/**
 * CR-56（2026-10-13）——REPEAT 呈现层收敛与蒸馏原料解耦。
 *
 * 背景：「画成图片」（前端实际发送「用图片展现刚才的内容」）
 * 触发 REPEAT 逐字重放上一轮 300+ 字回答，对话流堆积重复长文
 * 本（实测「半截 / 对不上」）。收敛为一句简短引导，同时蒸馏
 * 原料独立从转录取上一轮原文。
 */
describe('shouldCompactReplay（REPEAT 展示收敛判定）', () => {
  it('「用图片展现刚才的内容」命中（前端画成图片按钮真实文本）', () => {
    expect(shouldCompactReplay('用图片展现刚才的内容')).toBe(true);
  });

  it('「以图片形式呈现」命中（呈现形式类）', () => {
    expect(shouldCompactReplay('以图片形式呈现')).toBe(true);
  });

  it('「用视频展现刚才的内容」命中（视觉模态）', () => {
    expect(shouldCompactReplay('用视频展现刚才的内容')).toBe(true);
  });

  it('「用语音展现刚才的内容」不收敛（语音朗读要听完整内容）', () => {
    expect(shouldCompactReplay('用语音展现刚才的内容')).toBe(false);
  });

  it('「读给我听」不收敛（朗读类 voice）', () => {
    expect(shouldCompactReplay('读给我听')).toBe(false);
  });

  it('「再说一遍」不收敛（纯重放指令——recognizeGenerationIntent 不命中）', () => {
    expect(shouldCompactReplay('再说一遍')).toBe(false);
  });

  it('「重复上一条」不收敛', () => {
    expect(shouldCompactReplay('重复上一条')).toBe(false);
  });

  it('「重新表达」不收敛', () => {
    expect(shouldCompactReplay('重新表达')).toBe(false);
  });

  it('「生成一个对应的猫图片」不收敛（指代类蒸馏链路独立）', () => {
    expect(shouldCompactReplay('生成一个对应的猫图片')).toBe(false);
  });

  it('「做一段深海雾气的视频」不收敛（CREATE 带主题，非 useContext）', () => {
    expect(shouldCompactReplay('做一段深海雾气的视频')).toBe(false);
  });

  it('「画一张赛博朋克城市插画」不收敛（直接创作，非 useContext）', () => {
    expect(shouldCompactReplay('画一张赛博朋克城市插画')).toBe(false);
  });
});

describe('resolveDistillDesignText（视觉蒸馏原料选择）', () => {
  const compactReply = '好的，把刚才的感受画成图片——正在生成，马上就好。';
  const previousGuidance =
    '风穿过树叶，穿过窗帘，穿过你的皮肤。现在，想象你的身体不是一堵墙，而是一片原野。';

  it('呈现形式类：取转录最后一条助手原文（而非收敛后的简短引导）', () => {
    const transcript = [
      { role: 'user' as const, text: '深入一点' },
      { role: 'assistant' as const, text: previousGuidance },
    ];
    const designText = resolveDistillDesignText(
      { useContext: true },
      compactReply,
      transcript,
    );
    expect(designText).toBe(previousGuidance);
  });

  it('呈现形式类 + 转录为空：返回 undefined（绝不回喂收敛引导）', () => {
    const designText = resolveDistillDesignText(
      { useContext: true },
      compactReply,
      [],
    );
    expect(designText).toBeUndefined();
  });

  it('呈现形式类 + 转录只有用户轮：返回 undefined', () => {
    const designText = resolveDistillDesignText(
      { useContext: true },
      compactReply,
      [{ role: 'user', text: '深入一点' }],
    );
    expect(designText).toBeUndefined();
  });

  it('呈现形式类：多轮转录取最后一条助手原文（非更早的助手轮）', () => {
    const transcript = [
      { role: 'user', text: '带我做冥想' },
      { role: 'assistant', text: '首轮引导：闭上眼睛。' },
      { role: 'user', text: '深入一点' },
      { role: 'assistant', text: previousGuidance },
    ];
    const designText = resolveDistillDesignText(
      { useContext: true },
      compactReply,
      transcript,
    );
    expect(designText).toBe(previousGuidance);
  });

  it('呈现形式类 + 原文超长：截断到 700 字', () => {
    const long = '风'.repeat(800);
    const designText = resolveDistillDesignText(
      { useContext: true },
      compactReply,
      [{ role: 'assistant', text: long }],
    );
    expect(designText).toBe('风'.repeat(700));
  });

  it('指代类：保持原逻辑，使用流内 answerText', () => {
    const designText = resolveDistillDesignText(
      { useContext: true, referential: true },
      '一只橘猫在窗台上打盹。',
      [{ role: 'assistant', text: '不应该被取用的更早内容' }],
    );
    expect(designText).toBe('一只橘猫在窗台上打盹。');
  });

  it('直接创作（无 useContext）：保持原逻辑，使用流内 answerText', () => {
    const designText = resolveDistillDesignText(
      { useContext: false },
      '赛博朋克城市街道，霓虹灯光。',
      [{ role: 'assistant', text: '不相关转录' }],
    );
    expect(designText).toBe('赛博朋克城市街道，霓虹灯光。');
  });

  it('直接创作 + answerText 为空：返回 undefined', () => {
    const designText = resolveDistillDesignText(
      { useContext: false },
      '   ',
      [],
    );
    expect(designText).toBeUndefined();
  });
});
