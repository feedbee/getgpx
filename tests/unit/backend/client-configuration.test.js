import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/backend/app.js';
import { createClientConfigurationMiddleware } from '../../../src/backend/site/client-configuration.js';
import { createSocialPageRouter } from '../../../src/backend/site/social-metadata.js';
import { request } from './api/http.js';

let staticDirectory;
let html;
beforeAll(async () => {
  staticDirectory = await mkdtemp(join(tmpdir(), 'getgpx-client-config-test-'));
  html = await readFile(new URL('../../../index.html', import.meta.url), 'utf8');
  await writeFile(join(staticDirectory, 'index.html'), html);
  await writeFile(join(staticDirectory, 'other.html'), html);
  await writeFile(join(staticDirectory, 'asset.css'), 'body { color: black; }');
});
afterAll(async () => rm(staticDirectory, { recursive: true, force: true }));
afterEach(() => vi.unstubAllEnvs());
const configurationFrom = (html) => JSON.parse(html.match(/id="getgpx-client-config"[^>]*>(.*?)<\/script>/s)[1]);

describe('runtime client configuration in HTML', () => {
  it('captures the production process environment at startup', async () => {
    vi.stubEnv('SORT_DISTRIBUTION_BARS_BY_SIZE', 'true');
    const app = createApp({ database: { ping: vi.fn() }, staticDirectory });
    vi.stubEnv('SORT_DISTRIBUTION_BARS_BY_SIZE', 'false');
    expect(configurationFrom((await request(app, { url: '/' })).text).sortDistributionBarsBySize).toBe(true);
  });
  it.each([
    [undefined, false], ['false', false], ['true', true], ['TRUE', false], ['1', false],
  ])('embeds sorting=%s as %s without a configuration request', async (value, expected) => {
    const database = { ping: vi.fn() };
    const app = createApp({ database, staticDirectory,
      clientConfigurationMiddleware: createClientConfigurationMiddleware({
        SORT_DISTRIBUTION_BARS_BY_SIZE: value, SESSION_SECRET: 'test-only-secret',
      }),
    });
    for (const url of ['/', '/tracks/example', '/missing-page', '/index.html', '/%69ndex.html', '/index%2ehtml', '//index.html', '/other%2ehtml']) {
      const result = await request(app, { url });
      expect(result.status).toBe(['/missing-page', '/other%2ehtml'].includes(url) ? 404 : 200);
      expect(result.headers['content-type']).toContain('text/html');
      expect(result.headers['cache-control']).toBe('private, no-store');
      expect(result.headers['content-security-policy']).toContain("script-src 'self'");
      expect(configurationFrom(result.text)).toEqual({ sortDistributionBarsBySize: expected });
      expect(result.text).not.toContain('/client-config.js');
      expect(result.text).not.toContain('test-only-secret');
    }
    expect(database.ping).not.toHaveBeenCalled();
  });
  it('preserves static asset delivery and caching', async () => {
    const app = createApp({ database: { ping: vi.fn() }, staticDirectory });
    const result = await request(app, { url: '/asset.css' });
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toContain('text/css');
    expect(result.headers['cache-control']).toBe('public, max-age=3600');
    expect(result.text).toBe('body { color: black; }');
  });
  it.each([false, true])('configures social pages, including metadata failure=%s', async (failure) => {
    const metadata = vi.fn(async () => {
      if (failure) throw new Error('unavailable');
      return { title: 'Example', language: 'en', status: 200 };
    });
    const app = createApp({ database: { ping: vi.fn() }, staticDirectory,
      clientConfigurationMiddleware: createClientConfigurationMiddleware({ SORT_DISTRIBUTION_BARS_BY_SIZE: 'true' }),
      socialPageRouter: createSocialPageRouter({ metadata, loadHtml: async () => html }),
    });
    const result = await request(app, { url: '/tracks/example' });
    expect(result.status).toBe(200);
    expect(configurationFrom(result.text).sortDistributionBarsBySize).toBe(true);
    expect(result.text).not.toContain('/client-config.js');
  });
});
