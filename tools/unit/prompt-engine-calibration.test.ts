import { describe, it, expect } from 'vitest';
import {
  isMeditativeIntent,
  containsAnatomicLiteral,
  buildDistillSystemPrompt,
  shouldRejectDistilled,
  sanitizeDistilled,
} from '../../src/experience/prompt-engine';

describe('isMeditativeIntent', () => {
  it('冥想类意图词命中（冥想）', () => {
    expect(isMeditativeIntent('带我做几分钟的冥想练习')).toBe(true);
  });

  it('冥想类意图词命中（风声 / 安静练习）', () => {
    expect(isMeditativeIntent('带我做几分钟的安静练习，以风声为引')).toBe(true);
  });

  it('创作描述命中（呼吸）', () => {
    expect(isMeditativeIntent('深入一点', '你的呼吸开始跟着风走，放松肩膀')).toBe(true);
  });

  it('非冥想类不误伤（创作类）', () => {
    expect(isMeditativeIntent('帮我做一个极简像素头像')).toBe(false);
  });

  it('非冥想类不误伤（知识探索类）', () => {
    expect(isMeditativeIntent('深海发光生物的生存策略', '聊聊生物发光怎么成了深海的通用语言')).toBe(false);
  });
});

describe('containsAnatomicLiteral', () => {
  it('解剖具象词命中（脊柱）', () => {
    expect(containsAnatomicLiteral('人体背部轮廓，脊柱泛着银色微光')).toBe(true);
  });

  it('解剖具象词命中（血管 / 胸腔）', () => {
    expect(containsAnatomicLiteral('银光流入血管，吹开胸腔中央的结')).toBe(true);
  });

  it('自然意境不误伤', () => {
    expect(containsAnatomicLiteral('风穿过旷野，银色的光晕在云层间流动，水面泛起涟漪')).toBe(false);
  });

  it('远景剪影不误伤', () => {
    expect(containsAnatomicLiteral('山野间一个安静的剪影，晨光洒下')).toBe(false);
  });
});

describe('buildDistillSystemPrompt', () => {
  it('非冥想图像蒸馏 = 基础 system（无意境化纪律）', () => {
    const prompt = buildDistillSystemPrompt('image', false);
    expect(prompt).toContain('文生图提示词工程师');
    expect(prompt).not.toContain('意境化');
  });

  it('冥想图像蒸馏 = 注入意境化纪律', () => {
    const prompt = buildDistillSystemPrompt('image', true);
    expect(prompt).toContain('意境化自然意象');
    expect(prompt).toContain('禁止人体解剖');
  });

  it('冥想视频蒸馏 = 注入意境化纪律', () => {
    const prompt = buildDistillSystemPrompt('video', true);
    expect(prompt).toContain('文生视频提示词工程师');
    expect(prompt).toContain('禁止人体解剖');
  });
});

describe('shouldRejectDistilled', () => {
  it('冥想 + 解剖具象词 → 拒绝（回退）', () => {
    expect(shouldRejectDistilled('人体脊柱，银光流入血管，器官细节清晰', true)).toBe(true);
  });

  it('冥想 + 纯自然意象 → 通过', () => {
    expect(shouldRejectDistilled('风拂过旷野，银色的光雾在湖面上流动，远处山影朦胧', true)).toBe(false);
  });

  it('非冥想 + 解剖词 → 不拦截（普通场景不误伤）', () => {
    expect(shouldRejectDistilled('心脏血管结构科普示意图', false)).toBe(false);
  });
});

describe('sanitizeDistilled', () => {
  it('单行正常输出 → 原样通过', () => {
    const out = sanitizeDistilled('温暖逆光下，一只熟睡的橘猫侧卧在亚麻床单上，周身环绕金色声波涟漪');
    expect(out).toContain('橘猫');
  });

  it('多行输出（首行客套话 + 主体行）→ 取内容最丰富的主体行（CR-58）', () => {
    const raw = '好的，让我为你构思一下：\n温暖逆光下，一只熟睡的橘猫侧卧在亚麻床单上，喉部微微起伏，周身环绕着半透明的金色声波涟漪与轻柔光雾，将低频震动具象化为流动的丝状光环，采用极简治愈风格，柔焦摄影，浅景深。';
    const out = sanitizeDistilled(raw);
    expect(out).not.toContain('好的');
    expect(out).toContain('橘猫');
    expect(out).toContain('声波涟漪');
  });

  it('超长输出 → 截断到 200 字符保主体（CR-58，原为整条拒绝）', () => {
    const longBody = '温暖逆光下橘猫'.repeat(40);
    const out = sanitizeDistilled(longBody);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(200);
  });

  it('剥前缀与成对引号', () => {
    expect(sanitizeDistilled('提示词：静夜中的猫')).toBe('静夜中的猫');
    expect(sanitizeDistilled('「风穿过旷野」')).toBe('风穿过旷野');
  });

  it('过短无信息 → 拒绝', () => {
    expect(sanitizeDistilled('好的')).toBeNull();
    expect(sanitizeDistilled('   ')).toBeNull();
  });
});
