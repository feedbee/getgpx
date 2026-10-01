import { t, bindText, bindAttribute, htmlMessage } from './i18n.js';
import { errorMessage, errorFromPayload } from './errors-ui.js';
import { bulkSelectionState, cancelTrackSearch, createTrackCard } from './my-tracks-ui.js';
import { setButtonLoading, withButtonLoading } from './button-loading-ui.js';

export function createTrackCollection({ trackApi, isMyTracksPage, isFavoriteTracksPage,
  getCurrentUser, loadPreviewConfiguration = async () => ({ enabled: false, attribution: [] }), onEdit, onDelete, onDeleteMany, documentRef = document, browserWindow = window }) {
  const isTrackCollectionPage = isMyTracksPage || isFavoriteTracksPage;
  let previewConfiguration;
  let cursor = null;
  let loading = false;
  async function load({ reset = false } = {}) {
    if (!isTrackCollectionPage || loading) return;
    const list = documentRef.querySelector('#track-list');
    const message = documentRef.querySelector('#my-tracks-message');
    const more = documentRef.querySelector('#load-more-tracks');
    if (!getCurrentUser()) {
      list.replaceChildren();
      message.innerHTML = `${htmlMessage(isFavoriteTracksPage ? 'tracks.loginFavorites' : 'tracks.loginOwn')} <a href="/auth/google">${htmlMessage('common.login')}</a>`;
      message.hidden = false;
      more.hidden = true;
      return;
    }
    if (reset) {
      cursor = null;
      list.replaceChildren();
      updateBulkDeleteButton();
    }
    loading = true;
    bindText(message, () => t('tracks.loading'));
    message.hidden = false;
    more.disabled = true;
    const query = documentRef.querySelector('#track-query').value.trim();
    const parameters = new URLSearchParams();
    if (query) parameters.set('query', query);
    if (cursor) parameters.set('cursor', cursor);
    try {
      const response = await trackApi.list({ saved: isFavoriteTracksPage, parameters });
      const payload = await response.json();
      if (!response.ok) throw errorFromPayload(payload);
      if (!previewConfiguration) {
        previewConfiguration = await loadPreviewConfiguration().catch(() => ({ enabled: false, attribution: [] }));
        const credits = documentRef.querySelector('#track-preview-attribution');
        if (credits && previewConfiguration.enabled) {
          credits.replaceChildren();
          for (const { label, url } of previewConfiguration.attribution) {
            const link = documentRef.createElement('a');
            link.textContent = label;
            link.href = url;
            link.rel = 'noopener noreferrer';
            link.target = '_blank';
            credits.append(link);
          }
          credits.hidden = false;
        }
      }
      payload.data.items.forEach((track) => list.append(createTrackCard(track, documentRef, { ownerActions: !isFavoriteTracksPage, mapPreview: previewConfiguration.enabled })));
      updateBulkDeleteButton();
      cursor = payload.data.nextCursor;
      bindText(message, () => list.children.length ? '' : (query ? t('tracks.noResults') : isFavoriteTracksPage ? t('tracks.noFavorites') : t('tracks.empty')));
      message.hidden = Boolean(list.children.length);
      more.hidden = !cursor;
    } catch (listError) {
      bindText(message, () => errorMessage(listError));
      message.hidden = false;
      more.hidden = true;
    } finally {
      loading = false;
      more.disabled = false;
    }
  }

  function selectedTrackCards() {
    return [...documentRef.querySelectorAll('[data-track-select]:checked')].map((checkbox) => {
      const card = checkbox.closest('.track-card');
      return { id: card.dataset.trackId, title: card.dataset.trackTitle };
    });
  }

  function updateBulkDeleteButton() {
    const checkboxes = [...documentRef.querySelectorAll('[data-track-select]')];
    const selectedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
    const state = bulkSelectionState({ total: checkboxes.length, selected: selectedCount, actionLabel: isFavoriteTracksPage ? t('common.remove') : t('common.delete') });
    const selectAll = documentRef.querySelector('#select-all-tracks');
    const remove = documentRef.querySelector('#bulk-delete-tracks');
    selectAll.disabled = checkboxes.length === 0;
    bindText(selectAll, () => t(state.allSelected ? 'common.clearSelection' : 'common.selectAll'));
    selectAll.setAttribute('aria-pressed', String(state.allSelected));
    remove.disabled = state.deleteDisabled;
    bindText(remove.querySelector('span'), () => bulkSelectionState({ total: checkboxes.length, selected: selectedCount, actionLabel: t(isFavoriteTracksPage ? 'common.remove' : 'common.delete') }).deleteLabel);
    checkboxes.forEach((checkbox) => checkbox.closest('.track-card').classList.toggle('is-selected', checkbox.checked));
  }

  documentRef.querySelector('#track-search').addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = documentRef.querySelector('#track-query').value.trim();
    const pathname = isFavoriteTracksPage ? '/favorite-tracks' : '/my-tracks';
    const nextUrl = query ? `${pathname}?query=${encodeURIComponent(query)}` : pathname;
    browserWindow.history.replaceState(null, '', nextUrl);
    await withButtonLoading(event.submitter, () => load({ reset: true }));
  });
  const trackQueryInput = documentRef.querySelector('#track-query');
  const trackSearchClear = documentRef.querySelector('#track-search-clear');
  if (isTrackCollectionPage) {
    trackQueryInput.value = new URLSearchParams(browserWindow.location.search).get('query') || '';
    trackSearchClear.hidden = !trackQueryInput.value;
  }
  trackQueryInput.addEventListener('input', () => { trackSearchClear.hidden = !trackQueryInput.value; });
  trackSearchClear.addEventListener('click', () => {
    cancelTrackSearch({ input: trackQueryInput, history: browserWindow.history, reload: load, pathname: isFavoriteTracksPage ? '/favorite-tracks' : '/my-tracks' });
    trackSearchClear.hidden = true;
    trackQueryInput.focus();
  });
  documentRef.querySelector('#load-more-tracks').addEventListener('click', (event) => withButtonLoading(event.currentTarget, () => load()));
  documentRef.querySelector('#select-all-tracks').addEventListener('click', () => {
    const checkboxes = [...documentRef.querySelectorAll('[data-track-select]')];
    const select = checkboxes.some((checkbox) => !checkbox.checked);
    checkboxes.forEach((checkbox) => { checkbox.checked = select; });
    updateBulkDeleteButton();
  });
  documentRef.querySelector('#bulk-delete-tracks').addEventListener('click', () => {
    const tracks = selectedTrackCards();
    if (!tracks.length) return;
    onDeleteMany(tracks);
  });
  documentRef.querySelector('#track-list').addEventListener('click', (event) => {
    const action = event.target.closest('[data-track-action]');
    if (!action) return;
    const card = action.closest('.track-card');
    const track = { id: card.dataset.trackId, title: card.dataset.trackTitle, speedKmh: Number(card.dataset.trackSpeed) };
    if (action.dataset.trackAction === 'edit') onEdit(track, action);
    if (action.dataset.trackAction === 'delete') onDelete(track);
    if (action.dataset.trackAction === 'unsave' && isFavoriteTracksPage) {
      onDeleteMany([track]);
    }
    if (action.dataset.trackAction === 'favorite' && isMyTracksPage) toggleCardFavorite(action, track);
  });

  async function toggleCardFavorite(button, track) {
    const wasFavorite = button.getAttribute('aria-pressed') === 'true';
    setButtonLoading(button, true);
    try {
      const response = await trackApi.setSaved({ id: track.id, saved: !wasFavorite });
      if (!response.ok) throw new Error();
      button.classList.toggle('is-favorite', !wasFavorite);
      button.setAttribute('aria-pressed', String(!wasFavorite));
      bindAttribute(button, 'aria-label', () => t(wasFavorite ? 'tracks.addFavorite' : 'tracks.removeFavorite', { title: track.title }));
      bindAttribute(button, 'title', () => t(wasFavorite ? 'common.addFavorite' : 'common.removeFavorite'));
    } catch {
      const toast = documentRef.querySelector('#toast');
      bindText(toast, () => t('notification.favoriteFailed'));
      toast.classList.add('visible');
      setTimeout(() => toast.classList.remove('visible'), 2500);
    } finally {
      setButtonLoading(button, false);
    }
  }
  documentRef.querySelector('#track-list').addEventListener('change', (event) => {
    if (event.target.matches('[data-track-select]')) updateBulkDeleteButton();
  });


  return { load };
}
