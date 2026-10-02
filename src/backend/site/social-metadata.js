import { Router } from 'express';
import { IntlMessageFormat } from 'intl-messageformat';
import { readFileSync } from 'node:fs';
import { safeErrorDetails } from '../safe-error-details.js';
import { normalizeRouteType } from '../../route-types.js';

const languages = ['en', 'ru', 'uk', 'be', 'pl'];
const catalogs = Object.fromEntries(languages.map((language) => [language,
  JSON.parse(readFileSync(new URL(`../../client/locales/${language}.json`, import.meta.url), 'utf8'))]));
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const locales = { en: 'en_US', ru: 'ru_RU', uk: 'uk_UA', be: 'be_BY', pl: 'pl_PL' };

export function socialPreviewOrigin(environment = {}) {
  const origin = environment.SITE_URL || (environment.GOOGLE_REDIRECT_URI
    ? new URL(environment.GOOGLE_REDIRECT_URI).origin : 'https://getgpx.link');
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) throw new Error('SITE_URL must be an HTTP(S) origin.');
  return url.origin;
}

export function createSocialMetadata({ trackService, origin }) {
  return async (pathname, language = 'en') => {
    if (!languages.includes(language)) language = 'en';
    const catalog = catalogs[language];
    const t = (key, parameters) => String(new IntlMessageFormat(catalog[key], language).format(parameters));
    let title = t('app.title');
    let description = t('home.lede');
    let image = new URL('/getgpx-icon.png', origin).href;
    let width = 1254;
    let height = 1254;
    let status = 200;
    if (pathname === '/my-tracks' || pathname === '/favorite-tracks') {
      title = t(pathname === '/my-tracks' ? 'common.myTracks' : 'common.favorites');
      description = t(pathname === '/my-tracks' ? 'sharing.myTracks' : 'sharing.favorites');
    } else if (pathname.startsWith('/tracks/')) {
      const track = await trackService.getPublicTrack(pathname.slice('/tracks/'.length));
      if (!track) { status = 404; title = t('notFound.title'); }
      else {
        title = track.title || t('common.unnamed');
        const metrics = track.metrics || {};
        const number = (value, digits = 1) => new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);
        const measure = (value, unit, digits) => Number.isFinite(value) ? `${number(value, digits)} ${t(unit)}` : null;
        const minutes = Number.isFinite(metrics.estimatedDurationMs) ? Math.round(metrics.estimatedDurationMs / 60_000) : null;
        const duration = minutes === null ? null : t('sharing.duration', {
          hours: number(Math.floor(minutes / 60), 0), minutes: String(minutes % 60).padStart(2, '0'),
        });
        const speed = measure(metrics.speedKmh, 'units.kmh');
        const timing = [duration, speed].filter(Boolean).join(' / ');
        description = [t(`activity.${normalizeRouteType(track.routeType)}`),
          Number.isFinite(metrics.distanceKm) ? `↔︎ ${measure(metrics.distanceKm, 'units.km')}` : null,
          Number.isFinite(metrics.ascentM) ? `↗︎ ${measure(metrics.ascentM, 'units.m', 0)}` : null,
          Number.isFinite(metrics.descentM) ? `↘︎ ${measure(metrics.descentM, 'units.m', 0)}` : null,
          timing ? `◷ ${timing}` : null].filter(Boolean).join(' · ');
        if (track.revision && trackService.previewConfiguration().enabled) {
          image = new URL(`/share-images/tracks/${encodeURIComponent(track.id)}.png`, origin).href;
          width = 1200; height = 630;
        }
      }
    } else if (pathname !== '/') { status = 404; title = t('notFound.title'); }
    return { title, description, image, width, height, status, language, locale: locales[language],
      url: new URL(pathname, origin).href };
  };
}

export function injectSocialMetadata(html, metadata) {
  const values = { 'og:type': 'website', 'og:site_name': 'GetGPX', 'og:title': metadata.title,
    'og:description': metadata.description, 'og:url': metadata.url, 'og:locale': metadata.locale,
    'og:image': metadata.image, 'og:image:type': 'image/png', 'og:image:width': metadata.width,
    'og:image:height': metadata.height, 'og:image:alt': metadata.title };
  const tags = Object.entries(values).map(([property, content]) => `<meta property="${property}" content="${escape(content)}" />`);
  for (const [name, content] of Object.entries({ description: metadata.description,
    'twitter:card': metadata.width === 1200 ? 'summary_large_image' : 'summary',
    'twitter:title': metadata.title, 'twitter:description': metadata.description,
    'twitter:image': metadata.image, 'twitter:image:alt': metadata.title })) {
    tags.push(`<meta name="${name}" content="${escape(content)}" />`);
  }
  tags.push(`<link rel="canonical" href="${escape(metadata.url)}" />`);
  if (metadata.status === 404) tags.push('<meta name="robots" content="noindex" />');
  return html.replace(/<html\s+lang="[^"]*"/, () => `<html lang="${metadata.language}"`)
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escape(metadata.title)}</title>`)
    .replace('</head>', () => `${tags.join('\n')}\n</head>`);
}

export function createSocialPageRouter({ metadata, loadHtml }) {
  const router = Router();
  router.get(['/', '/my-tracks', '/favorite-tracks', '/tracks/:id'], async (request, response) => {
    const language = request.acceptsLanguages(...languages) || 'en';
    let value;
    try { value = await metadata(request.path, language); }
    catch (error) {
      request.log?.warn({ event: 'social_metadata_unavailable', ...safeErrorDetails(error) }, 'Social metadata unavailable');
      // Preserve the SPA shell when metadata dependencies are temporarily unavailable.
      const html = await loadHtml(request.originalUrl);
      response.setHeader('Cache-Control', 'private, no-store');
      return response.type('html').send(html);
    }
    response.setHeader('Cache-Control', 'private, no-store');
    response.vary('Accept-Language');
    response.status(value.status).type('html').send(injectSocialMetadata(await loadHtml(request.originalUrl), value));
  });
  return router;
}
