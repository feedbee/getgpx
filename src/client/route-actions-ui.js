export function closeOverflowMenuOnOutsideClick(menu, target) {
  if (!menu?.open || menu.contains(target)) return false;
  menu.open = false;
  return true;
}

export function copyPublicTrackLink({ trackId, origin, clipboard }) {
  return clipboard.writeText(new URL(`/tracks/${trackId}`, origin).href);
}

export function publicTrackIdFromPath(pathname) {
  return pathname.match(/^\/tracks\/([A-Za-z0-9_]{1,64})$/)?.[1] || null;
}

export function renderOwnerTrackActions() {
  return `<button id="edit-track" type="button"><svg data-action-icon="edit" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.3-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.3 16 4 20Z"/><path d="m14.8 6.2 3 3"/></svg><span>Редактировать</span></button><button class="danger-button" id="delete-track" type="button"><svg data-action-icon="delete" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></svg><span>Удалить</span></button>`;
}
