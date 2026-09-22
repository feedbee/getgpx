function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function renderAuthControl(user) {
  if (!user) return '<a class="login-button" href="/api/auth/google">Войти</a>';
  const name = escapeHtml(user.displayName || user.email);
  const avatar = user.avatarUrl
    ? `<img src="${escapeHtml(user.avatarUrl)}" alt="" referrerpolicy="no-referrer" />`
    : `<span aria-hidden="true">${name.slice(0, 1).toUpperCase()}</span>`;
  return `
    <div class="user-menu">
      <button class="avatar-button" type="button" aria-label="Меню пользователя ${name}" aria-expanded="false" aria-controls="user-menu-popover">${avatar}</button>
      <div class="user-menu-popover" id="user-menu-popover" hidden>
        <div class="user-summary"><strong>${name}</strong><small>${escapeHtml(user.email)}</small></div>
        <a class="user-menu-link" href="/my-tracks">Мои треки</a>
        <a class="user-menu-link" href="/favorite-tracks">Избранные треки</a>
        <button class="logout-button" type="button">Выйти</button>
      </div>
    </div>`;
}
