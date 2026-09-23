import { beforeEach } from 'vitest';
import { preferences } from '../../../src/client/i18n.js';
beforeEach(() => { preferences.set('language', 'ru'); preferences.set('measurementSystem', 'metric'); });
import { describe, expect, it } from 'vitest';
import { renderHomePage, renderHomeRouteCard, renderPublicTracks } from '../../../src/client/home-page-ui.js';

const tracks = [
  { id: '111111111111111111111111', title: 'First route', distanceKm: 201.7, ascentM: 3810, pointsOfInterestCount: 25, url: '/tracks/111111111111111111111111' },
  { id: '222222222222222222222222', title: 'Second route', distanceKm: 120, ascentM: 900, pointsOfInterestCount: 3, url: '/tracks/222222222222222222222222' },
  { id: '333333333333333333333333', title: 'Third route', distanceKm: 148, ascentM: 1100, pointsOfInterestCount: 4, url: '/tracks/333333333333333333333333' },
];

describe('renderHomePage', () => {
  it('renders the page structure while example tracks are loading', () => {
    const markup = renderHomePage([], { loading: true });
    expect(markup).toContain('id="home-title"');
    expect(markup).toContain('id="home-example-map"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).not.toContain('home.noTracks');
    expect(renderHomeRouteCard(tracks[0])).toContain('First route');
    expect(renderPublicTracks(tracks)).toContain('Second route');
  });
  it('presents one independent track link without promising platform distribution', () => {
    const markup = renderHomePage(tracks);

    expect(markup).toContain('Один трек.');
    expect(markup).toContain('Одна ссылка.');
    expect(markup).toContain('без регистрации');
    expect(markup).toContain('First route');
    expect(markup).toContain('201,7 км');
    expect(markup).toContain('Ссылки добавляет автор');
    expect(markup).toContain('/tracks/111111111111111111111111');
    expect(markup).toContain('id="home-example-map"');
    expect(markup).not.toContain('автоматическая синхронизация');
  });

  it('uses the first configured track for the hero and preserves example order', () => {
    const markup = renderHomePage(tracks);

    expect(markup.indexOf('First route')).toBeLessThan(markup.indexOf('Second route'));
    expect(markup.indexOf('Second route')).toBeLessThan(markup.indexOf('Third route'));
    expect(markup.match(/\/tracks\/111111111111111111111111/g)).toHaveLength(4);
    expect(markup).not.toContain('6ab02471fb28fc3ae79e4d23');
  });

  it('renders separate publishing actions for guests and signed-in authors', () => {
    const markup = renderHomePage();

    expect(markup).toContain('data-home-guest');
    expect(markup).toContain('href="/api/auth/google"');
    expect(markup).toContain('data-home-author');
    expect(markup).toContain('data-auth-upload');
    expect(markup).toContain('type="button"');
  });

  it('provides section and preview navigation without scripting', () => {
    const markup = renderHomePage();

    expect(markup).toContain('aria-label="Разделы главной страницы"');
    expect(markup).toContain('href="#passport"');
    expect(markup).toContain('href="#preview-profile"');
    expect(markup).toContain('href="#preview-climbs"');
    expect(markup).toContain('aria-label="Следующий фрагмент"');
  });
});
