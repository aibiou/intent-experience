/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { recognizeGenerationIntent, shouldCompactReplay } from '../../src/lib/experience/generation-intent';
import type { GenerationIntent } from '../../src/lib/experience/generation-intent';
import { latestImageRecord } from '../../src/lib/experience/media-gateway';
import type { MediaArtifactRecord } from '../../src/lib/experience/media-gateway';

/**
 * 生成意图识别（generation-intent.ts）——确定性词表识别 + 优先级 video > image > voice。
 * 契约依据：产品负责人指令 2026-10-10（参考仓库注释原文：「问答过程中识别用户意图，
 * 自动调用相应文本 / 语音 / 图像 / 视频模型进行生成」）；GS-01 负向（不调用任何模型，
 * 确定性可复跑）；CR-56（shouldCompactReplay——呈现形式类视觉生成的 REPEAT 收敛）。
 * 识别层独立于策略语义动作域：只认领分类器的 UNKNOWN 输入（本模块不知道分类器，零依赖）。
 *
 * 词表来源：参考实现 src/experience/generation-intent.ts 逐条移植（VIDEO 14 / IMAGE 13+2 /
 * VOICE 10+4），扩展条目均标注「实测缺口」。每条断言先经临时差分脚本对真实实现跑通
 * （83 条语料 vs 参考实现逐字段一致 + 逐 pattern 覆盖矩阵），不发明期望契约。
 * 消费意图负样本（「给我看看视频 / 想看视频」）为参考刻意不识别的行为，如实锁定。
 */

function expectIntent(input: string, expected: GenerationIntent | null): void {
  expect(recognizeGenerationIntent(input)).toEqual(expected);
}

describe('generation-intent：VIDEO_PATTERNS 词表逐条（优先级最高层——video > image > voice）', () => {
  it('14 条词表逐条正样本（每条 pattern 至少一个真实输入样例）', () => {
    const videoSamples: ReadonlyArray<[string, string]> = [
      ['v1 生成动词+视频（宽间隔——「做一段清晨森林雾气的视频」中间隔 9 字）', '做一段星空视频'],
      ['v2 给我+生成动词+视频（⊆v1——给我后须跟生成动词）', '给我做一个视频'],
      ['v3 视频+生成/制作/创作', '把这段视频制作一下'],
      ['v4 生成动词+动画', '生成一个动画'],
      ['v5 给我+生成动词+动画（⊆v4）', '给我生成一个动画'],
      ['v6 动画+生成/制作/创作', '把这段动画创作出来'],
      ['v7 生成动词+短片', '制作一部短片'],
      ['v8 给我+生成动词+短片（⊆v7）', '给我制作一部短片'],
      ['v9 拍+短片（⊆v7——「拍」本身是生成动词）', '拍一部短片'],
      ['v10 名词短语「…的视频」', '一段森林的视频'],
      ['v11 换/再/来+视频（再生成——无逗号约束时按换介质呈现类处理）', '换一个视频'],
      ['v12 视频+方式/形式', '视频方式展现'],
      ['v13 视频+展现/呈现/展示', '短片展现这段旅程'],
      ['v14 以/用/改/换+视频', '改成视频吧'],
    ];
    for (const [, input] of videoSamples) {
      const intent = recognizeGenerationIntent(input);
      expect(intent).not.toBeNull();
      expect(intent?.modality).toBe('video');
    }
  });

  it('完整意图字段锁定：直接创作类视频请求不含 useContext / referential', () => {
    expectIntent('做一段清晨森林雾气的视频', { modality: 'video', prompt: '做一段清晨森林雾气的视频' });
    expectIntent('生成一个动画', { modality: 'video', prompt: '生成一个动画' });
    expectIntent('一段森林的视频', { modality: 'video', prompt: '一段森林的视频' });
    expectIntent('美女的视频', { modality: 'video', prompt: '美女的视频' });
  });

  it('优先级：视频模态词压倒图像层（不落 image）', () => {
    // 「动画」含「画」字（IMAGE 首条 /画.{0,30}/ 必命中），但 VIDEO 层先判——如实锁定优先级链。
    expect(recognizeGenerationIntent('把这段动画创作出来')?.modality).toBe('video');
    expect(recognizeGenerationIntent('做一段清晨森林雾气的视频')?.modality).toBe('video');
    expect(recognizeGenerationIntent('画一张赛博朋克城市插画')?.modality).toBe('image');
  });

  it('视频再生成：逗号后约束提取为提示词（无约束时换介质表达 → useContext）', () => {
    expectIntent('换一个视频，慢一点的', { modality: 'video', prompt: '慢一点的', regen: true });
    expectIntent('换一个视频', { modality: 'video', prompt: '换一个视频', useContext: true });
    // 「来一段视频」被 v11 认领（「来」在换/再/来再生成词表内）——与 MAKE_VERBS 注释
    // 「『来』不再单独作开头」存在张力，但词表行为为准（与参考实现逐字段一致）。
    expectIntent('来一段视频', { modality: 'video', prompt: '来一段视频' });
  });

  it('视频呈现形式类（v12/v13/v14 命中 → useContext）', () => {
    expectIntent('视频方式展现', { modality: 'video', prompt: '视频方式展现', useContext: true });
    expectIntent('短片展现这段旅程', { modality: 'video', prompt: '短片展现这段旅程', useContext: true });
    expectIntent('用视频展现刚才的内容', { modality: 'video', prompt: '用视频展现刚才的内容', useContext: true });
    expectIntent('改成视频吧', { modality: 'video', prompt: '改成视频吧', useContext: true });
  });
});

describe('generation-intent：IMAGE_PATTERNS 词表逐条（13 条移植 + 2 条实测缺口扩展）', () => {
  it('15 条词表逐条正样本（每条 pattern 至少一个真实输入样例）', () => {
    const imageSamples: ReadonlyArray<[string, string]> = [
      ['i1 /画.{0,30}/（宽松锚——参考实现原样移植，见下条如实锁定）', '画一个梦境'],
      ['i2 生成动词+图族', '生成一张星空图'],
      ['i3 图族+生成/制作/创作', '把这张图制作一下'],
      ['i4 设计/画+头像/像素', '设计一个像素头像'],
      ['i5 概念图（⊆i2——「概念图」含「图」字）', '做一张概念图'],
      ['i6 给我+生成动词+图族（⊆i2）', '给我画一张头像'],
      ['i7 名词短语「…的照片」', '一张夏天的照片'],
      ['i8 名词短语「…的展示/演示」（缺模态词按图像模态理解）', '美女的展示'],
      ['i9 换/再/来+图族（再生成——新约束经逗号提取）', '换一张图片，夏天的服装'],
      ['i10 裸「图像+展示动词」', '图像展示一下'],
      ['i11 图族+方式/形式', '插画形式就好'],
      ['i12 图族+展现/呈现/展示', '头像展现一下'],
      ['i13 以/用/改/换+图族', '改成图片吧'],
      ['i14（实测缺口）图片/图像+看看/看一下', '图片我看看'],
      ['i15（实测缺口）看看/看一下+图片/图像', '看看图片'],
    ];
    for (const [, input] of imageSamples) {
      const intent = recognizeGenerationIntent(input);
      expect(intent).not.toBeNull();
      expect(intent?.modality).toBe('image');
    }
  });

  it('完整意图字段锁定：直接创作类图像请求不含 useContext', () => {
    expectIntent('画一张赛博朋克城市插画', { modality: 'image', prompt: '画一张赛博朋克城市插画' });
    expectIntent('画一张风图', { modality: 'image', prompt: '画一张风图' });
    expectIntent('生成一张星空图', { modality: 'image', prompt: '生成一张星空图' });
    // 「生产」为参考实测缺口词（2026-10-11「生产一个图片猫」未命中后补入生成动词表）。
    expectIntent('生产一个图片猫', { modality: 'image', prompt: '生产一个图片猫' });
    expectIntent('设计一个像素头像', { modality: 'image', prompt: '设计一个像素头像' });
    expectIntent('一张夏天的照片', { modality: 'image', prompt: '一张夏天的照片' });
  });

  it('“生成一张…”即使省略图字也识别为图像创作', () => {
    const intent = recognizeGenerationIntent('生成一张清晨薄雾中的灯塔观鸟站，保留门口的蓝色信封和长草');
    expect(intent?.modality).toBe('image');
    expect(intent?.prompt).toBe('生成一张清晨薄雾中的灯塔观鸟站，保留门口的蓝色信封和长草');
    expect(intent?.useContext).toBeUndefined();
  });

  it('宽松锚 /画.{0,30}/ 如实锁定：任何含「画」字的输入都命中（消费语气「我想看动画片」→ image）', () => {
    // 参考实现 IMAGE_PATTERNS 首条即此宽松锚（无生成动词/模态词门槛）——按指令「如实移植，
    // 不修复」，行为与参考逐字段一致（差分脚本验证）。
    expectIntent('我想看动画片', { modality: 'image', prompt: '我想看动画片' });
  });

  it('IMAGE 呈现形式类：i10/i11/i13 命中 → useContext；i12 命中但 presentation 名词表不含「头像」→ 无 useContext（如实锁定）', () => {
    expectIntent('图像展示一下', { modality: 'image', prompt: '图像展示一下', useContext: true });
    expectIntent('插画形式就好', { modality: 'image', prompt: '插画形式就好', useContext: true });
    expectIntent('改成图片吧', { modality: 'image', prompt: '改成图片吧', useContext: true });
    expectIntent('用图片展现这个概念', { modality: 'image', prompt: '用图片展现这个概念', useContext: true });
    // presentation 判定的名词表（视频|动画|短片|图片|图像|照片|写真|画像|插画|插图|语音）
    // 不含头像/壁纸/背景/封面——i12「头像展现一下」命中图像词表却无 useContext。
    // 参考实现的真实不对称，如实锁定（不修复）。
    expectIntent('头像展现一下', { modality: 'image', prompt: '头像展现一下' });
  });
});

describe('generation-intent：VOICE_PATTERNS 词表逐条（10 条移植 + 4 条实测缺口扩展）', () => {
  it('14 条词表逐条正样本（每条 pattern 至少一个真实输入样例）', () => {
    const voiceSamples: ReadonlyArray<[string, string]> = [
      ['s1 读出来', '把这段读出来'],
      ['s2 朗读', '朗读这段'],
      ['s3 读成语音', '把回答读成语音'],
      ['s4 语音读', '语音读一遍'],
      ['s5 读给我听', '读给我听'],
      ['s6 用/发出+语音（「发出」须连续出现——「发一段语音」不命中，见负样本）', '发出一段语音'],
      ['s7 说+出来', '把答案说出来'],
      ['s8 发音', '这个字的发音'],
      ['s9 语音+方式/形式', '语音方式呈现'],
      ['s10 以/改/换+语音', '换成语音'],
      ['s11（实测缺口）声音/音频+听听/听一下', '声音我听听'],
      ['s12（实测缺口）听听/听一下+声音/音频', '听听声音'],
      ['s13（实测缺口）读+间隔+给我听（参考只有连续「读给我听」）', '读一段风的声音给我听'],
      ['s14（实测缺口）念+间隔+给我听', '念一段给我听'],
    ];
    for (const [, input] of voiceSamples) {
      const intent = recognizeGenerationIntent(input);
      expect(intent).not.toBeNull();
      expect(intent?.modality).toBe('voice');
    }
  });

  it('朗读请求 → useContext=true（读/朗读/念 且无引号——朗读对象是上一轮回答而非用户原话）', () => {
    expectIntent('把这段读出来', { modality: 'voice', prompt: '把这段读出来', useContext: true });
    expectIntent('朗读这段', { modality: 'voice', prompt: '朗读这段', useContext: true });
    expectIntent('读给我听', { modality: 'voice', prompt: '读给我听', useContext: true });
    expectIntent('读一段风的声音给我听', { modality: 'voice', prompt: '读一段风的声音给我听', useContext: true });
    expectIntent('念一段给我听', { modality: 'voice', prompt: '念一段给我听', useContext: true });
    expectIntent('把风声念给我听', { modality: 'voice', prompt: '把风声念给我听', useContext: true });
    expectIntent('读一小段风的独白给我听', { modality: 'voice', prompt: '读一小段风的独白给我听', useContext: true });
  });

  it('引号豁免：输入携带引号内容时朗读用户指定的文本，不走上下文（无 useContext）', () => {
    expectIntent('把「静夜思」读出来', { modality: 'voice', prompt: '把「静夜思」读出来' });
  });

  it('非朗读类语音请求（无读/念、无呈现形式标记）→ 无 useContext（如实锁定）', () => {
    expectIntent('发出一段语音', { modality: 'voice', prompt: '发出一段语音' });
    expectIntent('把答案说出来', { modality: 'voice', prompt: '把答案说出来' });
    expectIntent('这个字的发音', { modality: 'voice', prompt: '这个字的发音' });
  });

  it('语音呈现形式类（s9/s10/s6+展现 → useContext）', () => {
    expectIntent('语音方式呈现', { modality: 'voice', prompt: '语音方式呈现', useContext: true });
    expectIntent('换成语音', { modality: 'voice', prompt: '换成语音', useContext: true });
    expectIntent('用语音展现刚才的内容', { modality: 'voice', prompt: '用语音展现刚才的内容', useContext: true });
  });
});

describe('generation-intent：用户痛点四输入（2026-10「听风」体验——此前两连「这句话我还没能理解」）', () => {
  it('「声音我听听」→ voice + useContext（呈现形式类朗读请求）', () => {
    expectIntent('声音我听听', { modality: 'voice', prompt: '声音我听听', useContext: true });
  });

  it('「图片我看看」→ image + useContext（呈现形式类视觉请求）', () => {
    expectIntent('图片我看看', { modality: 'image', prompt: '图片我看看', useContext: true });
  });

  it('「读给我听」→ voice + useContext（朗读请求）', () => {
    expectIntent('读给我听', { modality: 'voice', prompt: '读给我听', useContext: true });
  });

  it('「用图片展现刚才的内容」→ image + useContext（提示词材料由上一轮回答构建）', () => {
    expectIntent('用图片展现刚才的内容', { modality: 'image', prompt: '用图片展现刚才的内容', useContext: true });
  });
});

describe('generation-intent：消费意图与无模态词负样本（参考刻意不识别——null，不发明意图）', () => {
  it('「看看 / 听听」无模态词 → null', () => {
    expectIntent('随便看看，现在有什么值得探索的？', null);
    expectIntent('我想听听你的看法', null);
  });

  it('视频消费意图 → null（给我后须跟生成动词；「想看」非生成动词）', () => {
    expectIntent('给我看看视频', null);
    expectIntent('想看视频', null);
  });

  it('VIDEO 词表不扩展（本环境无视频提供方）——「看看」类表达不含视频模态词表条目 → null（如实锁定不对称）', () => {
    expectIntent('视频我看看', null);
    expectIntent('看看视频', null);
    expectIntent('看看这个视频', null);
  });

  it('其他无生成意图输入 → null', () => {
    expectIntent('发一段语音', null); // 「发出」须连续出现
    expectIntent('再重复一遍这个内容', null); // 再+非模态词
    expectIntent('再说一遍', null); // 纯重放指令——REPEAT 层语义，非生成意图
    expectIntent('今天天气不错', null);
    expectIntent('嗯嗯啊啊', null);
  });

  it('空输入与纯空白输入 → null（输入 trim 后判定）', () => {
    expectIntent('', null);
    expectIntent('   ', null);
  });
});

describe('generation-intent：promptBase 三级回退（regen 逗号后约束 > stripped 剥「的展示」尾缀 > 原句）', () => {
  it('stripped：名词短语「…的展示/演示」剥尾缀为画面主题', () => {
    expectIntent('美女的展示', { modality: 'image', prompt: '美女' });
    expectIntent('美女的演示', { modality: 'image', prompt: '美女' });
  });

  it('stripped 锚定边界：16 字前缀可裁剪，17 字前缀保原句（模式匹配不锚定仍命中，如实锁定）', () => {
    expectIntent('一二三四五六七八九十一二三四五六的展示', {
      modality: 'image',
      prompt: '一二三四五六七八九十一二三四五六',
    });
    // i8 /.{0,16}的(?:展示|演示)/ 无 ^ 锚——17 字前缀经后缀匹配仍命中 image；
    // stripped /^(.{1,16})的(?:展示|演示)$/ 有 ^$ 锚——越界不裁剪，提示词保原句。
    expectIntent('一二三四五六七八九十一二三四五六七的展示', {
      modality: 'image',
      prompt: '一二三四五六七八九十一二三四五六七的展示',
    });
  });

  it('regen：逗号后即用户对下一张的要求，提取为提示词（且优先排除 presentation——自带主题非换介质）', () => {
    expectIntent('换一张图片，夏天的服装', { modality: 'image', prompt: '夏天的服装', regen: true });
    expectIntent('换一个视频，慢一点的', { modality: 'video', prompt: '慢一点的', regen: true });
    // trim + 分隔符类 [，,、\s]：全角逗号加空格同样提取。
    expectIntent(' 换一张图片， 夏天的服装 ', { modality: 'image', prompt: '夏天的服装', regen: true });
  });

  it('G2-5 创作闭环：regen 是图生图参考图的挂载信号（runtime 据此挂会话最新产物）', () => {
    // 再生成（带逗号约束）→ regen：对上一张产物的修改
    expectIntent('换一张图片，背景换成海边', { modality: 'image', prompt: '背景换成海边', regen: true });
    // 无逗号约束的换介质表达 → useContext 而非 regen（确定性区分，不挂参考图）
    expectIntent('换一张图片', { modality: 'image', prompt: '换一张图片', useContext: true });
    // 直接创作（「画一只在月光下的猫」）→ 无任何情境标记——从零文生图
    expectIntent('画一只在月光下的猫', { modality: 'image', prompt: '画一只在月光下的猫' });
  });

  it('regen 空约束回退：逗号后无内容 → 不提取（保原句），换介质 presentation 仍生效', () => {
    expectIntent('换一张图片，', { modality: 'image', prompt: '换一张图片，', useContext: true });
  });

  it('regen 自然形态：量词后直接逗号（模态词省略）→ 图像再生成（实测缺口 2026-10-15）', () => {
    // 「换一张，窗边加一只打盹的猫」——分类器 /换一/ 命中
    // CHANGE_DIRECTION，本层认领后由 runtime 再生成特例
    // （CHANGE_DIRECTION → CREATE）改道；约束经逗号提取。
    expectIntent('换一张，窗边加一只打盹的猫', {
      modality: 'image',
      prompt: '窗边加一只打盹的猫',
      regen: true,
    });
    expectIntent('再来一张，明亮点', { modality: 'image', prompt: '明亮点', regen: true });
    expectIntent('换一幅，油画风', { modality: 'image', prompt: '油画风', regen: true });
  });

  it('regen 自然形态边界：泛化量词「一个」与裸量词不误判（仍按换方向 / 不识别）', () => {
    // 「一个」为泛化量词——「换一个，更好的」语义偏换方向，
    // 不认领（分类器 CHANGE_DIRECTION 语义保持不变）。
    expectIntent('换一个，更好的', null);
    // 裸量词无逗号约束 → 不构成再生成表达。
    expectIntent('换一张', null);
  });

  it('无裁剪时保原句（直接创作类）', () => {
    expectIntent('画一张赛博朋克城市插画', { modality: 'image', prompt: '画一张赛博朋克城市插画' });
    expectIntent('做一段清晨森林雾气的视频', { modality: 'video', prompt: '做一段清晨森林雾气的视频' });
  });
});

describe('generation-intent：presentation / referential 判定', () => {
  it('指代类表达：主体在对话上文 → referential + useContext', () => {
    expectIntent('生成一个对应的猫图片', {
      modality: 'image',
      prompt: '生成一个对应的猫图片',
      useContext: true,
      referential: true,
    });
    // 参考实测缺口（2026-10-11）：「调用相应的图片模型生成图片」。
    expectIntent('调用相应的图片模型生成图片', {
      modality: 'image',
      prompt: '调用相应的图片模型生成图片',
      useContext: true,
      referential: true,
    });
    // 候选选择后的真实入口：用户点选产物，再说“根据选中的图…”。
    // 带明确“重新生成 + 新约束”时，这是选中产物的图生图：
    // 冒号后约束直达提供方，而不是把上一轮文字重新蒸馏。
    expectIntent('根据刚才选中的图片生成一张新图：加一只玻璃杯', {
      modality: 'image',
      prompt: '加一只玻璃杯',
      regen: true,
    });
    expectIntent('根据刚才选中的那张图重新生成一张：把邮局换成红砖小火车站，保留薄雾、水面反光和门口的蓝色信封', {
      modality: 'image',
      prompt: '把邮局换成红砖小火车站，保留薄雾、水面反光和门口的蓝色信封',
      regen: true,
    });
    expectIntent('基于刚才选中的那张图重新生成：换成红砖小火车站', {
      modality: 'image',
      prompt: '换成红砖小火车站',
      regen: true,
    });
  });

  it('呈现形式类：模态词 + 方式/形式/展现/呈现/展示 → useContext（video / image / voice 三模态）', () => {
    expectIntent('视频方式展现', { modality: 'video', prompt: '视频方式展现', useContext: true });
    expectIntent('图像展示一下', { modality: 'image', prompt: '图像展示一下', useContext: true });
    expectIntent('用语音展现刚才的内容', { modality: 'voice', prompt: '用语音展现刚才的内容', useContext: true });
  });

  it('看看子句跨模态：已命中词表的输入经「图片/图像+看看」子句补充 useContext（确定性规则的如实锁定）', () => {
    // 旧词表已识别（…的图片）+ 看看子句新增 useContext——扩展规则不区分输入是否自带主题。
    expectIntent('一张猫的图片看看', { modality: 'image', prompt: '一张猫的图片看看', useContext: true });
    // VIDEO 层先判（做成视频）+ 看看子句在共享 presentation 判定中生效。
    expectIntent('看看图片再做成视频', { modality: 'video', prompt: '看看图片再做成视频', useContext: true });
  });

  it('直接创作（「画一张风图」）无 useContext——呈现类标记不误加', () => {
    expectIntent('画一张风图', { modality: 'image', prompt: '画一张风图' });
  });
});

describe('generation-intent：多轮意图链（创作闭环——直接创作 → 再生成 → 再生成 → 直接创作）', () => {
  /** 运行时挂载条件（与 runtime.runGeneration 同一判据——
   * 情境意图才把会话最新图像挂为参考图）。 */
  const isContextual = (intent: GenerationIntent | null): boolean =>
    intent !== null &&
    intent.modality === 'image' &&
    Boolean(intent.useContext || intent.referential || intent.regen);

  it('四轮脚本：逐轮意图分类 + 参考图目标断言', () => {
    // 合成产物索引：同一会话第 1/2 轮各一张图像（追加序
    // 即时间序），含会话隔离与模态过滤负样本。
    const records: MediaArtifactRecord[] = [
      { id: 'g1', sessionId: 's1', turn: 1, modality: 'image', file: 'a.png', mime: 'image/png', promptUsed: '画一只在月光下的猫，画面温馨自然，细节丰富', at: '' },
      { id: 'g2', sessionId: 's1', turn: 2, modality: 'image', file: 'b.png', mime: 'image/png', promptUsed: '背景换成海边，画面温馨自然，细节丰富', at: '' },
      { id: 'g3', sessionId: 's2', turn: 1, modality: 'image', file: 'c.png', mime: 'image/png', promptUsed: '它会话的猫', at: '' },
      { id: 'g4', sessionId: 's1', turn: 3, modality: 'voice', file: 'd.mp3', mime: 'audio/mpeg', promptUsed: '读给我听', at: '' },
    ];

    // 第 1 轮：直接创作——无情境标记，从零文生图，不挂参考图
    const turn1 = recognizeGenerationIntent('画一只在月光下的猫');
    expect(turn1).toEqual({ modality: 'image', prompt: '画一只在月光下的猫' });
    expect(isContextual(turn1)).toBe(false);

    // 第 2 轮：再生成——regen 标记；挂会话最新产物（第 1 轮）
    const turn2 = recognizeGenerationIntent('换一张图片，背景换成海边');
    expect(turn2).toEqual({ modality: 'image', prompt: '背景换成海边', regen: true });
    expect(isContextual(turn2)).toBe(true);
    // 第 1 轮产物落盘后的索引末条 = 第 1 轮记录
    expect(latestImageRecord(records.slice(0, 1), 's1')?.turn).toBe(1);

    // 第 3 轮：再再生成——引用第 2 轮产物（多轮链核心：
    // 取末条而非首条——否则修改轨迹断裂回第一张）
    const turn3 = recognizeGenerationIntent('再换一张图，猫在打盹');
    expect(turn3).toEqual({ modality: 'image', prompt: '猫在打盹', regen: true });
    expect(isContextual(turn3)).toBe(true);
    // 第 2 轮产物落盘后：末条 = 第 2 轮记录（会话隔离 + 模态过滤下依然）
    expect(latestImageRecord(records, 's1')?.turn).toBe(2);

    // 第 4 轮：直接创作新主题——无情境标记，不携带陈旧引用
    const turn4 = recognizeGenerationIntent('画一只在樱花下的狗');
    expect(turn4).toEqual({ modality: 'image', prompt: '画一只在樱花下的狗' });
    expect(isContextual(turn4)).toBe(false);
  });
});

describe('generation-intent：把现有画面转换成其他模态（G1.1 图像→视频上下文接续）', () => {
  it('「把它做成视频 / 做成视频」携带上文标记（不把指令本身当画面提示词）', () => {
    expectIntent('把它做成视频', {
      modality: 'video',
      prompt: '把它做成视频',
      useContext: true,
    });
    expectIntent('做成视频', {
      modality: 'video',
      prompt: '做成视频',
      useContext: true,
    });
    expectIntent('把它做成图片', {
      modality: 'image',
      prompt: '把它做成图片',
      useContext: true,
    });
  });

  it('「把这张图做成视频」明确指向既有图像 → useContext + referential', () => {
    expectIntent('把这张图做成视频', {
      modality: 'video',
      prompt: '把这张图做成视频',
      useContext: true,
      referential: true,
    });
    expectIntent('把这张图片做成一段视频，镜头缓缓推进', {
      modality: 'video',
      prompt: '把这张图片做成一段视频，镜头缓缓推进',
      useContext: true,
      referential: true,
    });
  });

  it('非指代转换仍保持直接创作（不误伤「做一段星空视频」）', () => {
    expectIntent('做一段星空视频', {
      modality: 'video',
      prompt: '做一段星空视频',
    });
  });
});

describe('generation-intent：shouldCompactReplay（CR-56——REPEAT 呈现层收敛为简短引导）', () => {
  it('呈现形式类视觉生成触发 → true（用户要「画出来」而非「再读一遍」）', () => {
    expect(shouldCompactReplay('用图片展现刚才的内容')).toBe(true);
    expect(shouldCompactReplay('用视频展现刚才的内容')).toBe(true);
    expect(shouldCompactReplay('图片我看看')).toBe(true);
    expect(shouldCompactReplay('看看图片')).toBe(true);
    expect(shouldCompactReplay('视频方式展现')).toBe(true);
    expect(shouldCompactReplay('图像展示一下')).toBe(true);
    expect(shouldCompactReplay('一张猫的图片看看')).toBe(true);
    expect(shouldCompactReplay('看看图片再做成视频')).toBe(true);
  });

  it('语音朗读排除（用户要「听」完整内容——保留完整重放）', () => {
    expect(shouldCompactReplay('读给我听')).toBe(false);
    expect(shouldCompactReplay('声音我听听')).toBe(false);
    expect(shouldCompactReplay('用语音展现刚才的内容')).toBe(false);
    expect(shouldCompactReplay('换成语音')).toBe(false);
  });

  it('指代类排除（蒸馏链路独立——prompt 由上一轮助手首句解析）', () => {
    expect(shouldCompactReplay('生成一个对应的猫图片')).toBe(false);
    expect(shouldCompactReplay('调用相应的图片模型生成图片')).toBe(false);
  });

  it('非呈现形式类生成 / 纯重放指令 / 未识别输入 → false', () => {
    expect(shouldCompactReplay('画一张赛博朋克城市插画')).toBe(false); // 直接创作，无 useContext
    expect(shouldCompactReplay('画一张风图')).toBe(false);
    expect(shouldCompactReplay('换一个视频，慢一点的')).toBe(false); // regen 自带约束，非换介质
    expect(shouldCompactReplay('来一段视频')).toBe(false); // 再生成词表认领但无呈现标记
    expect(shouldCompactReplay('再说一遍')).toBe(false); // recognize 不命中 → 保持原文重放
    expect(shouldCompactReplay('今天天气不错')).toBe(false);
    expect(shouldCompactReplay('')).toBe(false);
  });
});

describe('generation-intent：确定性（GS-01 负向的证据基础——不调用任何模型）', () => {
  it('同一输入重复识别结果恒定', () => {
    const inputs = [
      '做一段清晨森林雾气的视频',
      '画一张赛博朋克城市插画',
      '声音我听听',
      '图片我看看',
      '换一张图片，夏天的服装',
      '生成一个对应的猫图片',
      '给我看看视频',
      '把「静夜思」读出来',
    ];
    for (const input of inputs) {
      const first = recognizeGenerationIntent(input);
      const second = recognizeGenerationIntent(input);
      expect(first).toEqual(second);
      expect(shouldCompactReplay(input)).toBe(shouldCompactReplay(input));
    }
  });
});
