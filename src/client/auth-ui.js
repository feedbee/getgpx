import { htmlMessage, messageAttribute } from './i18n.js';
function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function renderAuthControl(user) {
  if (!user) return `<a class="login-button" href="/api/auth/google">${htmlMessage('common.login')}</a>`;
  const name = escapeHtml(user.displayName || user.email);
  const avatar = user.avatarUrl
    ? `<img src="${escapeHtml(user.avatarUrl)}" alt="" referrerpolicy="no-referrer" />`
    : `<span aria-hidden="true">${name.slice(0, 1).toUpperCase()}</span>`;
  return `
    <div class="user-menu">
      <button class="avatar-button" type="button" ${messageAttribute('aria-label', 'auth.userMenu', { name: user.displayName || user.email })} aria-expanded="false" aria-controls="user-menu-popover">${avatar}</button>
      <div class="user-menu-popover" id="user-menu-popover" hidden>
        <div class="user-summary"><strong>${name}</strong><small>${escapeHtml(user.email)}</small></div>
        <a class="user-menu-link" href="/my-tracks">${htmlMessage('common.myTracks')}</a>
        <a class="user-menu-link" href="/favorite-tracks">${htmlMessage('common.favorites')}</a>
        <button class="logout-button" type="button">${htmlMessage('common.logout')}</button>
      </div>
    </div>`;
}
