import { describe, expect, it } from 'vitest';
import { renderHomePage } from '../../../src/client/home-page-ui.js';

describe('renderHomePage', () => {
  it('presents one independent track link without promising platform distribution', () => {
    const markup = renderHomePage();

    expect(markup).toContain('Один трек.');
    expect(markup).toContain('Одна ссылка.');
    expect(markup).toContain('без регистрации');
    expect(markup).toContain('THE TRAKA 200');
    expect(markup).toContain('201,7 км');
    expect(markup).toContain('Ссылки добавляет автор');
    expect(markup).toContain('/tracks/6ab02471fb28fc3ae79e4d23');
    expect(markup).toContain('id="home-example-map"');
    expect(markup).not.toContain('автоматическая синхронизация');
  });

  it('renders separate publishing actions for guests and signed-in authors', () => {
    const markup = renderHomePage();

    expect(markup).toContain('data-home-guest');
    expect(markup).toContain('href="/api/auth/google"');
    expect(markup).toContain('data-home-author');
    expect(markup).toContain('for="gpx-file"');
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
