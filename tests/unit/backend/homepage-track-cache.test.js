import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHomepageTrackCache } from '../../../src/backend/homepage-track-cache.js';

afterEach(() => vi.useRealTimers());

describe('homepage track cache', () => {
  it('serves the startup payload and replaces it after an hourly refresh', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValueOnce([{ id: 'first' }]).mockResolvedValueOnce([{ id: 'next' }]);
    const log = { warn: vi.fn() };
    const cache = createHomepageTrackCache({ load, log });

    await cache.start();
    expect(await cache.getHomepageTracks()).toEqual([{ id: 'first' }]);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(await cache.getHomepageTracks()).toEqual([{ id: 'next' }]);
    expect(load).toHaveBeenCalledTimes(2);
    cache.stop();
  });

  it('retries an initial failure on request and caches even an empty result', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce([]);
    const log = { warn: vi.fn() };
    const cache = createHomepageTrackCache({ load, log });

    await cache.start();
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(await cache.getHomepageTracks()).toEqual([]);
    expect(await cache.getHomepageTracks()).toEqual([]);
    expect(load).toHaveBeenCalledTimes(2);
    cache.stop();
  });

  it('keeps the previous payload and logs a failed refresh before retrying an hour later', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValueOnce([{ id: 'first' }])
      .mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce([{ id: 'next' }]);
    const log = { warn: vi.fn() };
    const cache = createHomepageTrackCache({ load, log });

    await cache.start();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(await cache.getHomepageTracks()).toEqual([{ id: 'first' }]);
    expect(log.warn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(await cache.getHomepageTracks()).toEqual([{ id: 'next' }]);
    cache.stop();
  });

  it('shares an in-flight cache miss and stops scheduling after shutdown', async () => {
    vi.useFakeTimers();
    let resolveLoad;
    const load = vi.fn().mockRejectedValueOnce(new Error('startup failed'))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveLoad = resolve; }));
    const cache = createHomepageTrackCache({ load, log: { warn: vi.fn() } });

    await cache.start();
    const first = cache.getHomepageTracks();
    const second = cache.getHomepageTracks();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);
    resolveLoad([{ id: 'recovered' }]);
    expect(await Promise.all([first, second])).toEqual([[{ id: 'recovered' }], [{ id: 'recovered' }]]);
    cache.stop();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('serves the complete previous payload while a refresh is pending', async () => {
    vi.useFakeTimers();
    let resolveRefresh;
    const load = vi.fn().mockResolvedValueOnce([{ id: 'first' }])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    const cache = createHomepageTrackCache({ load, log: { warn: vi.fn() } });

    await cache.start();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000 - 1);
    vi.advanceTimersByTime(1);
    await Promise.resolve();
    expect(await cache.getHomepageTracks()).toEqual([{ id: 'first' }]);
    resolveRefresh([{ id: 'next' }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await cache.getHomepageTracks()).toEqual([{ id: 'next' }]);
    cache.stop();
  });

  it('leaves the cache empty after a failed request and retries on the next request', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('startup failed'))
      .mockRejectedValueOnce(new Error('request failed')).mockResolvedValueOnce([{ id: 'recovered' }]);
    const cache = createHomepageTrackCache({ load, log: { warn: vi.fn() } });

    await cache.start();
    await expect(cache.getHomepageTracks()).rejects.toThrow('request failed');
    await expect(cache.getHomepageTracks()).resolves.toEqual([{ id: 'recovered' }]);
    cache.stop();
  });
});
