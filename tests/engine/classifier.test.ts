/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { classifyInput } from '../../src/lib/experience/classifier';
import type { SemanticAction } from '../../src/lib/experience/classifier';

/**
 * 意图分类器（classifier.ts）——确定性规则分类 + 优先级链。
 * 锁：STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME
 *     > WHY = WHAT_IF > DIRECT_ANSWER（含通用提问标记）> CONTINUE / REPEAT > UNKNOWN。
 * 契约依据：P-01（STOP 永远优先）、P-03（显式方向变更优先）、PD-12（WHY 先于 WHAT_IF）、
 * GS-01 负向（模型异常不得改写用户意图——分类器不调用任何模型，确定性可复跑）。
 *
 * 注意：每条断言均从现有实现的实际词表出发（先读代码后写测试），不发明期望契约。
 */

function expectAction(input: string, expected: SemanticAction): void {
  const result = classifyInput(input);
  expect(result).toEqual({ semanticAction: expected });
}

describe('classifier：STOP 永远优先（P-01）', () => {
  it('现有 STOP 词表全部命中 STOP', () => {
    const stopInputs = [
      '好了',
      '先这样',
      '就这些',
      '到此为止',
      '不用了',
      '停止',
      '不想继续了',
      '不想玩了',
      '不想听了',
      '结束',
      '就到这里',
    ];
    for (const input of stopInputs) {
      expectAction(input, 'STOP');
    }
  });

  it('缺口修复回归锁：新增停止表达命中 STOP（此前落入 UNKNOWN）', () => {
    const fixedInputs = [
      '算了',
      '停',
      '停一下',
      '停下来',
      '别说了',
      '别讲了',
      '不聊了',
      '不玩了',
      '别继续了',
      '退出',
      '我想退出了',
    ];
    for (const input of fixedInputs) {
      expectAction(input, 'STOP');
    }
  });

  it('行首锚定 ^停：不误伤非行首的“停”字（避免把提问/继续错杀为停止）', () => {
    expectAction('如果地球停转会怎样', 'WHAT_IF');
    expectAction('别停下来，继续', 'CONTINUE'); // “停”非行首、且不含“别继续了”
    expectAction('暂停一下再讲？', 'DIRECT_ANSWER'); // “暂停”的“停”非行首，且含提问标记
  });

  it('“停止 + 换方向”混合句：STOP 压倒 CHANGE_DIRECTION', () => {
    expectAction('好了，换个话题吧', 'STOP');
    expectAction('我不想看这个了，换一个', 'STOP'); // “不想看”属 STOP 词表，先于 CHANGE_DIRECTION 检查
    expectAction('结束吧，换个方向', 'STOP');
  });

  it('“停止 + 继续”混合句：STOP 压倒 CONTINUE', () => {
    expectAction('停止，继续', 'STOP');
  });

  it('“停止 + 创造”混合句：STOP 压倒 CREATE', () => {
    expectAction('结束吧，做一个游戏', 'STOP');
  });

  it('“停止 + 提问”混合句：STOP 压倒 WHY / WHAT_IF / DIRECT_ANSWER', () => {
    expectAction('先这样，为什么呢', 'STOP');
    expectAction('好了，如果地球停转会怎样', 'STOP');
    expectAction('到此为止，直接告诉我答案', 'STOP');
  });
});

describe('classifier：CHANGE_DIRECTION（P-03）', () => {
  it('现有 CHANGE_DIRECTION 词表全部命中', () => {
    const inputs = [
      '换个话题',
      '换一个',
      '换个方向',
      '换一个方向',
      '改变方向',
      '下一个',
      '不要这个',
      '不要了',
      '别这样',
    ];
    for (const input of inputs) {
      expectAction(input, 'CHANGE_DIRECTION');
    }
  });

  it('显式方向变更优先于纠正（CORRECTION）', () => {
    expectAction('换个话题，不对', 'CHANGE_DIRECTION');
  });

  it('显式方向变更优先于创造（CREATE）', () => {
    expectAction('换一个，做一个游戏', 'CHANGE_DIRECTION');
  });

  it('显式方向变更优先于探索提问（WHY / WHAT_IF）', () => {
    expectAction('换个方向，为什么会这样', 'CHANGE_DIRECTION');
    expectAction('换一个，如果下雨了会怎样', 'CHANGE_DIRECTION');
  });
});

describe('classifier：CORRECTION（G07 最小形态）', () => {
  it('现有 CORRECTION 词表全部命中', () => {
    const inputs = [
      '不是这个意思',
      '你理解错了',
      '误解了',
      '我说错了',
      '搞错了',
      '不是的',
      '不对',
      '你不是这么说的',
    ];
    for (const input of inputs) {
      expectAction(input, 'CORRECTION');
    }
  });

  it('纠正优先于创造（CREATE）', () => {
    expectAction('不是这个意思，做一个游戏', 'CORRECTION');
  });

  it('纠正优先于探索提问（WHY / WHAT_IF）与继续（CONTINUE）', () => {
    expectAction('不是这个意思，为什么', 'CORRECTION');
    expectAction('不对，如果这样会怎样', 'CORRECTION');
    expectAction('不是的，继续', 'CORRECTION');
  });
});

describe('classifier：CREATE > DEEPEN = SIMPLIFY = REFRAME 层', () => {
  it('CREATE 词表命中（识别即可——支持边界由 policy 层锁定，见 policy.test.ts）', () => {
    expectAction('做一个像素头像', 'CREATE');
    expectAction('把它做成一个小游戏', 'CREATE');
    expectAction('画一个太阳系', 'CREATE');
    expectAction('写一个故事', 'CREATE');
    expectAction('编一个程序', 'CREATE');
  });

  it('CREATE 优先于 DEEPEN / WHY', () => {
    expectAction('做一个游戏，深入一点', 'CREATE');
    expectAction('做出来吧，为什么', 'CREATE');
  });

  it('DEEPEN 词表命中', () => {
    expectAction('深入一点', 'DEEPEN');
    expectAction('深挖一下', 'DEEPEN');
    expectAction('展开讲讲', 'DEEPEN');
    expectAction('更丰富一些', 'DEEPEN');
  });

  it('DEEPEN 优先于 WHY（S2b 链：DEEPEN 层在 WHY 之前）', () => {
    expectAction('深入一点，为什么', 'DEEPEN');
  });

  it('SIMPLIFY 词表命中', () => {
    expectAction('简单一点', 'SIMPLIFY');
    expectAction('太复杂了', 'SIMPLIFY');
    expectAction('再简单点', 'SIMPLIFY');
    expectAction('简化一下', 'SIMPLIFY');
  });

  it('REFRAME 词表命中（注意：不含“个”字的方向词先被 CHANGE_DIRECTION 层认领）', () => {
    expectAction('换角度讲讲', 'REFRAME');
    expectAction('换视角说说', 'REFRAME');
    expectAction('重新表述一下', 'REFRAME');
    expectAction('另一种视角呢', 'REFRAME');
  });

  it('DEEPEN = SIMPLIFY = REFRAME 同层（实现内部按 DEEPEN → SIMPLIFY → REFRAME 顺序检查）', () => {
    expectAction('深入但太复杂了', 'DEEPEN');
    expectAction('简单一点，换角度', 'SIMPLIFY'); // 注意：不得用“换个角度”——“换个”属更高优先级的 CHANGE_DIRECTION 层
  });
});

describe('classifier：WHY = WHAT_IF 层（PD-12）', () => {
  it('WHY 词表命中', () => {
    expectAction('为什么会这样', 'WHY');
    expectAction('为啥', 'WHY');
    expectAction('怎么回事', 'WHY');
    expectAction('为何', 'WHY');
  });

  it('WHAT_IF 词表命中', () => {
    expectAction('如果地球停转会怎样', 'WHAT_IF');
    expectAction('假如人类消失会怎样', 'WHAT_IF');
    expectAction('假设光速变慢会怎样', 'WHAT_IF');
    expectAction('要是下雨了呢', 'WHAT_IF');
  });

  it('PD-12：WHY 先于 WHAT_IF（同句同时命中时 WHY 胜出）', () => {
    expectAction('如果会怎样，为什么', 'WHY');
  });
});

describe('classifier：DIRECT_ANSWER 兜底（GS-01）', () => {
  it('显式直接回答词表命中', () => {
    expectAction('直接告诉我答案', 'DIRECT_ANSWER');
    expectAction('别绕弯子', 'DIRECT_ANSWER');
  });

  it('通用提问标记兜底：普通问题 → DIRECT_ANSWER', () => {
    expectAction('蜂蜜是怎么酿出来的', 'DIRECT_ANSWER');
    expectAction('光是什么', 'DIRECT_ANSWER');
    expectAction('这是真的吗', 'DIRECT_ANSWER');
    expectAction('下雨了？', 'DIRECT_ANSWER');
  });

  it('无任何标记的普通陈述 → UNKNOWN（由运行时诚实升级，不假装理解）', () => {
    expectAction('今天天气不错', 'UNKNOWN');
    expectAction('好的', 'UNKNOWN');
    expectAction('', 'UNKNOWN');
  });
});

describe('classifier：CONTINUE / REPEAT 仅认领未被更高层命中的输入', () => {
  it('CONTINUE 词表命中；含提问标记“呢”的“然后呢/还有呢”实际先落 DIRECT_ANSWER（词表冗余如实记录）', () => {
    expectAction('继续', 'CONTINUE');
    expectAction('接着来', 'CONTINUE');
    expectAction('往下进行', 'CONTINUE');
    expectAction('继续当前体验', 'CONTINUE');
    // 词表冗余的如实记录（当前实现的真实输出，非期望契约的发明）：
    expectAction('然后呢', 'DIRECT_ANSWER');
    expectAction('还有呢', 'DIRECT_ANSWER');
  });

  it('REPEAT 词表命中', () => {
    expectAction('再说一遍', 'REPEAT');
    expectAction('重复上一条', 'REPEAT');
  });
});

describe('classifier：S1 范围外动作——分类器只负责如实识别（不假装支持）', () => {
  it('CREATE / DEEPEN / SIMPLIFY / REFRAME / REPEAT 被如实识别为其语义动作', () => {
    expectAction('做一个纸飞机', 'CREATE');
    expectAction('深入讲讲这件事', 'DEEPEN');
    expectAction('简单一点讲', 'SIMPLIFY');
    expectAction('换角度再讲一遍', 'REFRAME');
    expectAction('重复上一条', 'REPEAT');
  });

  it('无法分类的输入返回 UNKNOWN（运行时零版本零事件升级，不发明语义）', () => {
    expectAction('嗯嗯啊啊', 'UNKNOWN');
  });
});

describe('classifier：确定性（GS-01 负向的证据基础）', () => {
  it('同一输入重复分类结果恒定', () => {
    const inputs = [
      '好了',
      '换个话题',
      '不是这个意思',
      '如果下雨了会怎样',
      '为什么会这样',
      '继续',
      '今天天气不错',
    ];
    for (const input of inputs) {
      const first = classifyInput(input);
      const second = classifyInput(input);
      expect(first).toEqual(second);
    }
  });
});
