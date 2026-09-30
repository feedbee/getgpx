import { t, bindText } from './i18n.js';
import { errorMessage } from './errors-ui.js';
import { bulkDeleteSummary } from './my-tracks-ui.js';
import { setButtonLoading } from './button-loading-ui.js';

export function createTrackDeletion({ trackApi, collection, isFavoriteTracksPage, isTrackCollectionPage,
  getPublicTrackId, getTrackTitle, documentRef = document, windowRef = window }) {
  let managedTrackId = null;
  let tracksPendingDeletion = [];

  function openOne({ id, title }) {
    openMany([{ id, title }], id);
  }

  function openMany(tracks, id = null) {
    managedTrackId = id;
    tracksPendingDeletion = tracks;
    const summary = bulkDeleteSummary(tracks);
    const favoriteRemoval = isFavoriteTracksPage;
    bindText(documentRef.querySelector('#delete-dialog-kicker'), () => favoriteRemoval ? t('tracks.favoritesKicker') : t('tracks.deleteKicker'));
    bindText(documentRef.querySelector('#delete-dialog-title'), () => summary.count === 1
      ? (favoriteRemoval ? t('tracks.unsaveOne') : t('tracks.deleteOne'))
      : t(favoriteRemoval ? 'tracks.unsaveMany' : 'tracks.deleteMany', { count: summary.count }));
    bindText(documentRef.querySelector('#delete-track-description'), () => favoriteRemoval
      ? (summary.count === 1 ? t('tracks.keepLink') : t('tracks.keepLinks'))
      : (summary.count === 1 ? t('tracks.deleteWarning')
        : t('tracks.deleteManyWarning', { count: summary.count })));
    bindText(documentRef.querySelector('#confirm-track-delete'), () => favoriteRemoval ? t('common.remove') : t('common.delete'));
    const list = documentRef.querySelector('#delete-track-list');
    list.replaceChildren(...summary.titles.map((trackTitle) => {
      const item = documentRef.createElement('li');
      bindText(item, () => trackTitle);
      return item;
    }));
    if (summary.remaining) {
      const item = documentRef.createElement('li');
      bindText(item, () => t('tracks.remaining', { count: summary.remaining }));
      list.append(item);
    }
    documentRef.querySelector('#delete-track-error').hidden = true;
    documentRef.querySelector('#confirm-track-delete').disabled = false;
    documentRef.querySelector('#confirm-delete-dialog').showModal();
  }

  documentRef.querySelector('#delete-track').addEventListener('click', () => openOne({
    id: getPublicTrackId(),
    title: getTrackTitle() || t('tracks.thisTrack'),
  }));
  documentRef.querySelector('#cancel-track-delete').addEventListener('click', () => documentRef.querySelector('#confirm-delete-dialog').close());
  documentRef.querySelector('#confirm-track-delete').addEventListener('click', async () => {
    const button = documentRef.querySelector('#confirm-track-delete');
    const error = documentRef.querySelector('#delete-track-error');
    setButtonLoading(button, true);
    error.hidden = true;
    const isBulkDelete = managedTrackId === null;
    try {
      const response = await trackApi.remove({ id: managedTrackId, ids: isBulkDelete || isFavoriteTracksPage ? tracksPendingDeletion.map((track) => track.id) : null, saved: isFavoriteTracksPage });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        bindText(error, () => errorMessage(payload?.error));
        error.hidden = false;
        return;
      }
      documentRef.querySelector('#confirm-delete-dialog').close();
      if (isTrackCollectionPage) await collection.load({ reset: true });
      else windowRef.location.assign('/my-tracks');
    } catch (deleteError) {
      bindText(error, () => errorMessage(deleteError));
      error.hidden = false;
    } finally {
      setButtonLoading(button, false);
    }
  });

  return { openOne, openMany };
}
