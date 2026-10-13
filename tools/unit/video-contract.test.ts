import { describe, expect, it } from 'vitest';
import {
  buildZhipuVideoCreate,
  parseZhipuCreateId,
  parseZhipuPoll,
  videoProviderOf,
  zhipuSizeOf,
} from '../../src/experience/video-contract';

/**
 * 视频契约（video-contract.ts，多提供方适配层）——纯函数单测。
 * 契约：① provider 判定（智谱 = cogvideox / vidu / bigmodel.cn，
 * 其余 = agnes）；② 智谱创建请求体（model/prompt 恒有，size/duration
 * 仅在显式给画幅/时长时透传）；③ 创建响应取 id；④ 轮询响应解析
 * （SUCCESS → data[0].url，video_result 兜底，FAIL / 进度）。
 */

describe('videoProviderOf', () => {
  it('智谱模型名 → zhipu', () => {
    expect(videoProviderOf({ provider: 'zhipu', model: 'cogvideox-3', endpoint: 'https://open.bigmodel.cn/api/paas/v4' })).toBe('zhipu');
    expect(videoProviderOf({ provider: 'zhipu', model: 'viduq1', endpoint: 'https://open.bigmodel.cn/api/paas/v4' })).toBe('zhipu');
  });
  it('智谱端点域名 → zhipu（即使模型名不匹配）', () => {
    expect(videoProviderOf({ provider: 'my', model: 'video-x', endpoint: 'https://open.bigmodel.cn/api/paas/v4' })).toBe('zhipu');
  });
  it('非智谱 → agnes（agnes 模型 / 未知）', () => {
    expect(videoProviderOf({ provider: 'agnes-com', model: 'agnes-video-2.5-flash', endpoint: 'https://apihub.agnes-ai.com/v1' })).toBe('agnes');
    expect(videoProviderOf({ provider: 'other', model: 'foo', endpoint: 'https://example.com/v1' })).toBe('agnes');
  });
});

describe('zhipuSizeOf', () => {
  it('画幅 → 像素 size', () => {
    expect(zhipuSizeOf('16:9')).toBe('1920x1080');
    expect(zhipuSizeOf('9:16')).toBe('1080x1920');
    expect(zhipuSizeOf('1:1')).toBe('1080x1080');
  });
});

describe('buildZhipuVideoCreate', () => {
  it('恒含 model 与 prompt', () => {
    expect(buildZhipuVideoCreate('cogvideox-3', '一只猫')).toEqual({ model: 'cogvideox-3', prompt: '一只猫' });
  });
  it('显式画幅/时长 → 透传 size/duration', () => {
    expect(buildZhipuVideoCreate('viduq1', '日出', { aspectRatio: '9:16', seconds: '6' })).toEqual({
      model: 'viduq1',
      prompt: '日出',
      size: '1080x1920',
      duration: 6,
    });
  });
  it('未给画幅/时长 → 不注入（保守，避免被拒参数）', () => {
    expect(buildZhipuVideoCreate('cogvideox-3', '猫', { seconds: '12' })).toEqual({ model: 'cogvideox-3', prompt: '猫', duration: 12 });
  });
});

describe('parseZhipuCreateId', () => {
  it('取 id', () => {
    expect(parseZhipuCreateId({ id: '12345', model: 'cogvideox-3' })).toBe('12345');
  });
  it('无 id / 非对象 → undefined', () => {
    expect(parseZhipuCreateId({ model: 'x' })).toBeUndefined();
    expect(parseZhipuCreateId(null)).toBeUndefined();
    expect(parseZhipuCreateId('x')).toBeUndefined();
  });
});

describe('parseZhipuPoll', () => {
  it('SUCCESS + data[0].url', () => {
    expect(parseZhipuPoll({ task_status: 'SUCCESS', data: [{ url: 'https://cdn/v.mp4' }] })).toEqual({
      status: 'SUCCESS',
      url: 'https://cdn/v.mp4',
      progress: undefined,
    });
  });
  it('video_result 兜底', () => {
    expect(parseZhipuPoll({ task_status: 'SUCCESS', data: [{ video_result: 'https://cdn/v.mp4' }] })).toEqual({
      status: 'SUCCESS',
      url: 'https://cdn/v.mp4',
    });
  });
  it('PROCESSING + progress 透传，无 url', () => {
    const s = parseZhipuPoll({ task_status: 'PROCESSING', progress: 40 });
    expect(s.status).toBe('PROCESSING');
    expect(s.progress).toBe(40);
    expect(s.url).toBeUndefined();
  });
  it('FAIL 无 url', () => {
    const s = parseZhipuPoll({ task_status: 'FAIL', data: [] });
    expect(s.status).toBe('FAIL');
    expect(s.url).toBeUndefined();
  });
  it('非对象 / 无 task_status → 空 status', () => {
    expect(parseZhipuPoll(null).status).toBe('');
    expect(parseZhipuPoll({ foo: 1 }).status).toBe('');
  });
});
