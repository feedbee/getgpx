import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('client runtime configuration', () => {
  it.each([[undefined, false], [false, false], [true, true]])('uses runtime sorting=%s as %s', async (value, expected) => {
    vi.resetModules();
    vi.stubGlobal('document', { getElementById: () => value === undefined ? null : {
      textContent: JSON.stringify({ sortDistributionBarsBySize: value }),
    } });
    const config = await import('../../../src/client/config.js');
    expect(config.SORT_DISTRIBUTION_BARS_BY_SIZE).toBe(expected);
  });
});
