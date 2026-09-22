import { describe, expect, it } from 'vitest';
import { renderNotFoundPage } from '../../../src/client/not-found-ui.js';

describe('renderNotFoundPage', () => {
  it('explains the missing page and offers useful ways out', () => {
    const markup = renderNotFoundPage();

    expect(markup).toContain('404');
    expect(markup).toContain('Страница не найдена');
    expect(markup).toContain('href="/"');
    expect(markup).toContain('href="/my-tracks"');
    expect(markup).toContain('<main');
    expect(markup).toContain('<h1');
  });
});
