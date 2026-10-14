import { withButtonLoading } from './button-loading-ui.js';
import { t, htmlMessage, bindText } from './i18n.js';
export function closeOverflowMenuOnOutsideClick(menu, target) {
  if (!menu?.open || menu.contains(target)) return false;
  menu.open = false;
  return true;
}

export function favoriteButtonState(favorite) {
  return {
    pressed: String(favorite),
    label: favorite ? t('common.deleteFavorite') : t('common.addFavorite'),
  };
}

export function comparisonActionIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v16m8-16v16M5 7l3-3 3 3m2 10 3 3 3-3"/></svg>';
}

export function shareActionIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>';
}

export function copyPageLink({ path, origin, clipboard }) {
  return clipboard.writeText(new URL(path, origin).href);
}

export function copyPublicTrackLink({ trackId, ...options }) {
  return copyPageLink({ ...options, path: `/tracks/${trackId}` });
}

const toastTimers = new WeakMap();
export async function sharePageLink({ button, path, documentRef = document, windowRef = window }) {
  if (button.disabled) return;
  const toast = documentRef.querySelector('#toast');
  await withButtonLoading(button, async () => {
    let message;
    try {
      await copyPageLink({ path, origin: windowRef.location.origin, clipboard: windowRef.navigator.clipboard });
      message = 'notification.copied';
    } catch { message = 'notification.copyFailed'; }
    bindText(toast, () => t(message));
  });
  windowRef.clearTimeout(toastTimers.get(toast));
  toast.classList.add('visible');
  toastTimers.set(toast, windowRef.setTimeout(() => toast.classList.remove('visible'), 2500));
}

export function publicTrackIdFromPath(pathname) {
  return pathname.match(/^\/tracks\/([A-Za-z0-9_]{1,64})$/)?.[1] || null;
}

export function renderOwnerTrackActions() {
  return `<button id="edit-track" type="button"><svg data-action-icon="edit" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.3-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.3 16 4 20Z"/><path d="m14.8 6.2 3 3"/></svg><span>${htmlMessage('common.edit')}</span></button><button class="danger-button" id="delete-track" type="button"><svg data-action-icon="delete" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></svg><span>${htmlMessage('common.delete')}</span></button>`;
}
