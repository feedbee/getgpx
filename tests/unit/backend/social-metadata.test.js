import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createSocialMetadata, injectSocialMetadata, createSocialPageRouter, socialPreviewOrigin } from '../../../src/backend/site/social-metadata.js';
import { request } from './api/http.js';

const fixture = () => ({ getPublicTrack: vi.fn(async () => ({ id: 'route', title: 'A "route" <script> & ride',
  revision: 'one', routeType: 'cycling', metrics: { distanceKm: 45.5, ascentM: 300, descentM: 290,
    estimatedDurationMs: 7_200_000, speedKmh: 22.75 } })), previewConfiguration: () => ({ enabled: true }) });
const template = '<html lang="ru"><head><title>Old</title></head><body>SPA</body></html>';

describe('server-rendered sharing metadata', () => {
  it('includes canonical URLs and all current route metrics while escaping user titles', async () => {
    const metadata = await createSocialMetadata({ trackService: fixture(), origin: 'https://getgpx.link' })('/tracks/route');
    expect(metadata.description).toBe('Cycling · 45.5 km · ↗ 300 m · ↘ 290 m · 2:00 · 22.8 km/h');
    expect(metadata).toMatchObject({ width: 1200, height: 630, image: 'https://getgpx.link/share-images/tracks/route.png' });
    const html = injectSocialMetadata(template, metadata);
    expect(html).toContain('A &quot;route&quot; &lt;script&gt; &amp; ride');
    expect(html).not.toContain('<script>');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });
  it('renders generic collection metadata without querying private lists', async () => {
    const service = fixture();
    for (const pathname of ['/', '/my-tracks', '/favorite-tracks']) {
      const metadata = await createSocialMetadata({ trackService: service, origin: 'https://getgpx.link' })(pathname, 'pl');
      expect(metadata).toMatchObject({ language: 'pl', status: 200, image: 'https://getgpx.link/getgpx-icon.png' });
    }
    expect(service.getPublicTrack).not.toHaveBeenCalled();
  });
  it('returns no track image for missing tracks or disabled providers', async () => {
    const service = fixture();
    service.getPublicTrack.mockResolvedValueOnce(null);
    const create = createSocialMetadata({ trackService: service, origin: 'https://getgpx.link' });
    expect(await create('/tracks/missing')).toMatchObject({ status: 404, image: 'https://getgpx.link/getgpx-icon.png' });
    service.previewConfiguration = () => ({ enabled: false });
    expect(await create('/tracks/route')).toMatchObject({ width: 1254 });
  });
  it('delivers metadata in the initial HTML to anonymous bots with no JavaScript', async () => {
    const app = express();
    app.use(createSocialPageRouter({ metadata: createSocialMetadata({ trackService: fixture(), origin: 'https://getgpx.link' }),
      loadHtml: async () => template }));
    const result = await request(app, { url: '/tracks/route?secret=hidden', headers: { 'accept-language': 'ru', host: 'attacker.invalid' } });
    expect(result.status).toBe(200);
    expect(result.text).toContain('property="og:title"');
    expect(result.text).toContain('https://getgpx.link/tracks/route');
    expect(result.text).not.toContain('secret=hidden');
    expect(result.text).not.toContain('attacker.invalid');
    expect(result.headers.vary).toBe('Accept-Language');
  });
  it('preserves the SPA shell when metadata lookup fails temporarily', async () => {
    const app = express();
    app.use(createSocialPageRouter({ metadata: async () => { throw new Error('database unavailable'); },
      loadHtml: async () => template }));
    const result = await request(app, { url: '/tracks/route' });
    expect(result.status).toBe(200);
    expect(result.text).toContain('<body>SPA</body>');
  });
  it('validates configured canonical origins without trusting request Host', () => {
    expect(socialPreviewOrigin({ GOOGLE_REDIRECT_URI: 'https://getgpx.link/auth/google/callback' })).toBe('https://getgpx.link');
    for (const SITE_URL of ['https://example.test/path', 'javascript:alert(1)', 'https://user:secret@example.test']) {
      expect(() => socialPreviewOrigin({ SITE_URL })).toThrow();
    }
  });
});
