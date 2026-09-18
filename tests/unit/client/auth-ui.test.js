import { describe, expect, it } from 'vitest';
import { renderAuthControl } from '../../../src/client/auth-ui.js';

describe('authentication header control', () => {
  it('renders a Google login link for a guest', () => {
    expect(renderAuthControl(null)).toContain('Войти');
    expect(renderAuthControl(null)).toContain('/api/auth/google');
  });

  it('renders an avatar button and logout action for a user', () => {
    const markup = renderAuthControl({ displayName: 'Rider & Friend', email: 'rider@example.com', avatarUrl: 'https://example.com/avatar.jpg' });
    expect(markup).toContain('Rider &amp; Friend');
    expect(markup).toContain('https://example.com/avatar.jpg');
    expect(markup).toContain('/my-tracks');
    expect(markup).toContain('Мои треки');
    expect(markup).toContain('Выйти');
  });
});
