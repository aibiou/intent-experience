/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  EmptyContentError,
  MAX_ATTEMPTS,
  RETRY_DELAY_MS,
  UpstreamHttpError,
  UpstreamNetworkError,
  extractUpstreamStatus,
  isNetworkFailure,
  isRetryableStatus,
  isTransientFailure,
  withRetry,
} from '../src/retry';

/** 瞬态失败分类与有界重试（retry.ts）——等待函数可注入，单测不发真实网络请求。 */

function namedError(name: string, message = 'x'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe('瞬态分类', () => {
  it('isRetryableStatus：408/429/500/502/503/504 可重试', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(isRetryableStatus(status)).toBe(true);
    }
  });

  it('isRetryableStatus：其它状态码不重试', () => {
    for (const status of [200, 201, 400, 401, 403, 404, 418, 422]) {
      expect(isRetryableStatus(status)).toBe(false);
    }
  });

  it('extractUpstreamStatus：从 z-ai-web-dev-sdk 消息提取状态码', () => {
    expect(
      extractUpstreamStatus('API request failed with status 502: bad gateway'),
    ).toBe(502);
    expect(extractUpstreamStatus('没有状态码的消息')).toBeNull();
  });

  it('isNetworkFailure：包装类/超时名/TypeError/网络消息模式 → 瞬态', () => {
    expect(isNetworkFailure(new UpstreamNetworkError('x'))).toBe(true);
    expect(isNetworkFailure(namedError('TimeoutError'))).toBe(true);
    expect(isNetworkFailure(namedError('AbortError'))).toBe(true);
    expect(isNetworkFailure(new TypeError('fetch failed'))).toBe(true);
    expect(isNetworkFailure(new Error('connection refused'))).toBe(true);
    expect(isNetworkFailure(new Error('socket hang up'))).toBe(true);
  });

  it('isNetworkFailure：普通错误/非 Error → 非瞬态', () => {
    expect(isNetworkFailure(new Error('普通业务错误'))).toBe(false);
    expect(isNetworkFailure('字符串')).toBe(false);
    expect(isNetworkFailure(null)).toBe(false);
  });

  it('isTransientFailure：HTTP 瞬态状态码 → 重试', () => {
    expect(isTransientFailure(new UpstreamHttpError(503, 'x'))).toBe(true);
    expect(isTransientFailure(new UpstreamHttpError(400, 'x'))).toBe(false);
  });

  it('isTransientFailure：空内容 → 永不重试（重试无意义）', () => {
    expect(isTransientFailure(new EmptyContentError())).toBe(false);
  });

  it('isTransientFailure：网络异常 → 重试', () => {
    expect(isTransientFailure(new UpstreamNetworkError('x'))).toBe(true);
    expect(isTransientFailure(new TypeError('fetch failed'))).toBe(true);
  });

  it('isTransientFailure：z-ai-sdk 形态（普通 Error 带状态码）→ 按状态分类', () => {
    expect(
      isTransientFailure(
        new Error('API request failed with status 502: bad gateway'),
      ),
    ).toBe(true);
    expect(
      isTransientFailure(new Error('API request failed with status 400: bad')),
    ).toBe(false);
  });

  it('isTransientFailure：其余错误 → 不重试', () => {
    expect(isTransientFailure(new Error('普通错误'))).toBe(false);
    expect(isTransientFailure('非 Error')).toBe(false);
  });
});

describe('withRetry 有界重试', () => {
  it('首次成功 → 只调用 1 次，不等待', async () => {
    let calls = 0;
    let sleeps = 0;
    const result = await withRetry(
      async () => {
        calls++;
        return 'ok';
      },
      { sleep: async () => { sleeps++; } },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(1);
    expect(sleeps).toBe(0);
  });

  it('瞬态失败 → 等待后重试成功（共 2 次尝试）', async () => {
    let calls = 0;
    const slept: number[] = [];
    const result = await withRetry(
      async () => {
        calls++;
        if (calls === 1) throw new UpstreamHttpError(503, 'queue full');
        return 'ok';
      },
      {
        delayMs: 123,
        sleep: async (ms) => {
          slept.push(ms);
        },
      },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(2);
    expect(slept).toEqual([123]);
  });

  it('非瞬态失败 → 立即抛出，不等待不重试', async () => {
    let calls = 0;
    let sleeps = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new UpstreamHttpError(400, 'bad request');
        },
        { sleep: async () => { sleeps++; } },
      ),
    ).rejects.toThrow('bad request');
    expect(calls).toBe(1);
    expect(sleeps).toBe(0);
  });

  it('两次瞬态失败 → 抛出第二次错误（等待恰好 1 次）', async () => {
    let calls = 0;
    let sleeps = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new UpstreamNetworkError(`第 ${calls} 次网络失败`);
        },
        { sleep: async () => { sleeps++; } },
      ),
    ).rejects.toThrow('第 2 次网络失败');
    expect(calls).toBe(MAX_ATTEMPTS);
    expect(sleeps).toBe(1);
  });

  it('默认等待时长 = RETRY_DELAY_MS（未注入 sleep 时不真实等待——用注入验证默认值逻辑）', () => {
    // withRetry 默认 delayMs 即 RETRY_DELAY_MS 常量（2s）；
    // 这里锁常量契约，避免有人悄悄改策略而不被发现。
    expect(RETRY_DELAY_MS).toBe(2000);
    expect(MAX_ATTEMPTS).toBe(2);
  });
});
