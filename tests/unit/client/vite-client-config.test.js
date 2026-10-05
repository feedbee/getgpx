import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from 'vite';
import configuration from '../../../vite.config.js';

vi.mock('vite', () => ({ defineConfig: (config) => config, loadEnv: vi.fn() }));

describe('Vite client configuration', () => {
  it.each([
    [undefined, false], ['false', false], ['true', true], ['TRUE', false], ['1', false],
  ])('exposes sorting=%s as the boolean %s', (value, expected) => {
    vi.mocked(loadEnv).mockReturnValue({ SORT_DISTRIBUTION_BARS_BY_SIZE: value,
      SESSION_SECRET: 'test-only-secret-must-not-reach-client' });
    for (const command of ['build', 'serve']) {
      const config = configuration({ command, mode: 'test' });
      expect(config.define).toEqual({ 'import.meta.env.SORT_DISTRIBUTION_BARS_BY_SIZE': JSON.stringify(expected) });
    }
  });
});
