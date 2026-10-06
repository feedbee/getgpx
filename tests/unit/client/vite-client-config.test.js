import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from 'vite';
import configuration from '../../../vite.config.js';

vi.mock('vite', () => ({ defineConfig: (config) => config, loadEnv: vi.fn() }));

describe('Vite client configuration', () => {
  it.each([
    [undefined, false], ['false', false], ['true', true], ['TRUE', false], ['1', false],
  ])('serves runtime sorting=%s as %s', async (value, expected) => {
    vi.mocked(loadEnv).mockReturnValue({ SORT_DISTRIBUTION_BARS_BY_SIZE: value,
      SESSION_SECRET: 'test-only-secret-must-not-reach-client' });
    const config = configuration({ command: 'serve', mode: 'test' });
    const plugin = config.plugins.find((plugin) => plugin.name === 'client-configuration');
    const html = plugin.transformIndexHtml('<script id="getgpx-client-config" type="application/json">{}</script>');
    expect(html).toContain(`"sortDistributionBarsBySize":${expected}`);
    expect(html).not.toContain('test-only-secret-must-not-reach-client');
    expect(configuration({ command: 'build', mode: 'test' }).define).toBeUndefined();
  });
});
