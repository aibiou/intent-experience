import { describe, it, expect } from 'vitest';
import {
  isMeditativeIntent,
  containsAnatomicLiteral,
  containsSchematicLiteral,
  buildDistillSystemPrompt,
  shouldRejectDistilled,
  sanitizeDistilled,
  safeVisualFallback,
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

  it('解剖部位词命中（喉部 / 声带——科普机制跑偏面）', () => {
    expect(containsAnatomicLiteral('橘猫颈部喉部特写，声带振动')).toBe(true);
  });

  it('自然意境不误伤', () => {
    expect(containsAnatomicLiteral('风穿过旷野，银色的光晕在云层间流动，水面泛起涟漪')).toBe(false);
  });

  it('远景剪影不误伤', () => {
    expect(containsAnatomicLiteral('山野间一个安静的剪影，晨光洒下')).toBe(false);
  });
});

describe('containsSchematicLiteral', () => {
  it('解剖词命中', () => {
    expect(containsSchematicLiteral('彩色解剖管道剖面')).toBe(true);
  });

  it('示意 / 图解词命中（箭头 / 标注 / 示意图）', () => {
    expect(containsSchematicLiteral('胸前红色解剖示意图，红色箭头标注')).toBe(true);
  });

  it('自然画面不误伤', () => {
    expect(containsSchematicLiteral('橘猫蜷在窗台午睡，阳光洒满皮毛')).toBe(false);
  });
});

describe('buildDistillSystemPrompt', () => {
  it('非冥想图像蒸馏 = 基础 system + 通用画面纪律（CR-59 全题材生效）', () => {
    const prompt = buildDistillSystemPrompt('image', false);
    expect(prompt).toContain('文生图提示词工程师');
    expect(prompt).toContain('禁止解剖式呈现');
    expect(prompt).toContain('不得出现任何文字');
    expect(prompt).not.toContain('意境化');
  });

  it('冥想图像蒸馏 = 通用纪律 + 意境化纪律', () => {
    const prompt = buildDistillSystemPrompt('image', true);
    expect(prompt).toContain('禁止解剖式呈现');
    expect(prompt).toContain('意境化自然意象');
    expect(prompt).toContain('禁止人体解剖');
  });

  it('冥想视频蒸馏 = 通用纪律 + 意境化纪律', () => {
    const prompt = buildDistillSystemPrompt('video', true);
    expect(prompt).toContain('文生视频提示词工程师');
    expect(prompt).toContain('禁止解剖式呈现');
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

  it('非冥想 + 解剖示意词 → 拒绝（CR-59 泛化为通用，科普「机制」类同等拦截）', () => {
    expect(shouldRejectDistilled('心脏血管结构科普示意图', false)).toBe(true);
  });

  it('非冥想 + 部位特写词 → 拒绝（猫呼噜「喉部特写」跑偏面）', () => {
    expect(shouldRejectDistilled('微距特写，熟睡橘猫颈部喉部特写', false)).toBe(true);
  });

  it('非冥想 + 温馨场景 → 通过（不误伤正常画面词）', () => {
    expect(shouldRejectDistilled('橘猫蜷在暖光窗台午睡，阳光洒满皮毛，氛围安静', false)).toBe(false);
  });
});

describe('safeVisualFallback', () => {
  it('机制问句 → 主题温馨场景（不再原样下发问句）', () => {
    const out = safeVisualFallback('猫的呼噜声是怎么发出来的？');
    expect(out).toContain('温馨自然的生活场景');
    expect(out).toContain('猫');
    expect(out).not.toContain('怎么');
  });

  it('无解剖词的设计文本优先（有画面信息）', () => {
    const out = safeVisualFallback('猫的呼噜声是怎么发出来的？', '阳光透过纱帘，橘猫蜷在靠垫上午睡，呼吸平稳，暖色氛围');
    expect(out).toBe('阳光透过纱帘，橘猫蜷在靠垫上午睡，呼吸平稳，暖色氛围');
  });

  it('含解剖词的设计文本被剔除 → 走问句场景化兜底', () => {
    const out = safeVisualFallback('猫的呼噜声是怎么发出来的？', '喉部肌肉快速伸缩，声带振动，每秒25次开合');
    expect(out).toContain('温馨自然的生活场景');
    expect(out).not.toContain('喉部');
  });

  it('深海主题问句 → 主体保留', () => {
    const out = safeVisualFallback('深海生物为什么要发光？');
    expect(out).toContain('深海生物');
    expect(out).toContain('温馨自然的生活场景');
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
