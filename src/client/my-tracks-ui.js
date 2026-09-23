import { t, bindText, bindAttribute, formatMeasurement, date, messageAttribute } from './i18n.js';
import { renderExternalTrackLinks } from './external-track-links-ui.js';
import { routeTypeDefinition, routeTypeIcon } from './route-type-ui.js';

const STATUS_LABELS = {
  READY: 'status.ready',
  FAILED: 'status.failed',
  QUEUED: 'status.queued',
  PARSING: 'status.parsing',
  ENRICHING: 'status.enriching',
};

export function trackStatusLabel(track) {
  return track.status === 'PROCESSING' ? t(STATUS_LABELS[track.step] || 'status.processing') : t(STATUS_LABELS[track.status] || 'status.processing');
}

export function formatTrackDuration(ms) {
  if (!Number.isFinite(ms)) return '—';
  const totalMinutes = Math.round(ms / 60_000);
  return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

export function previewPolyline(preview) {
  if (!Array.isArray(preview?.points) || preview.points.length < 2) return '';
  return preview.points.map((point) => `${Number(point[0]).toFixed(2)},${Number(point[1]).toFixed(2)}`).join(' ');
}

export function cancelTrackSearch({ input, history, reload, pathname = '/my-tracks' }) {
  input.value = '';
  history.replaceState(null, '', pathname);
  reload({ reset: true });
}

export function bulkDeleteSummary(tracks) {
  return {
    count: tracks.length,
    titles: tracks.slice(0, 10).map((track) => track.title || t('common.unnamed')),
    remaining: Math.max(0, tracks.length - 10),
  };
}

export function bulkSelectionState({ total, selected, actionLabel = t('common.delete') }) {
  const allSelected = total > 0 && selected === total;
  return {
    allSelected,
    selectLabel: allSelected ? t('common.clearSelection') : t('common.selectAll'),
    deleteLabel: selected ? t('tracks.actionCount', { action: actionLabel, count: selected }) : actionLabel,
    deleteDisabled: selected === 0,
  };
}

export function formatTrackMetrics(track) {
  const routeType = routeTypeDefinition(track.routeType);
  return [
    routeType.shortLabel,
    formatMeasurement('distance', track.distanceKm),
    `↗ ${formatMeasurement('elevation', track.ascentM)}`,
    `↘ ${formatMeasurement('elevation', track.descentM)}`,
    formatTrackDuration(track.estimatedDurationMs),
    formatMeasurement('speed', track.speedKmh),
  ].join(' · ');
}

export function createTrackCard(track, documentRef = document, { ownerActions = true } = {}) {
  const article = documentRef.createElement('article');
  article.className = 'track-card';
  article.dataset.trackId = track.id;
  const displayTitle = track.title || t('common.unnamed');
  article.dataset.trackTitle = displayTitle;
  article.dataset.trackSpeed = track.speedKmh || 20;

  const previewLink = documentRef.createElement('a');
  previewLink.className = 'track-preview';
  previewLink.href = track.url;
  bindAttribute(previewLink, 'aria-label', () => t('tracks.open', { title: displayTitle }));
  const points = previewPolyline(track.preview);
  previewLink.innerHTML = points
    ? `<svg viewBox="-7 -7 114 114" role="img" ${messageAttribute('aria-label', 'tracks.preview')}><polyline points="${points}" /></svg>`
    : '<span aria-hidden="true">GPX</span>';

  const body = documentRef.createElement('div');
  body.className = 'track-card-body';
  const badge = documentRef.createElement('span');
  badge.className = `track-status track-status-${track.status.toLowerCase()}`;
  bindText(badge, () => trackStatusLabel(track));
  const title = documentRef.createElement('a');
  title.className = 'track-card-title';
  title.href = track.url;
  bindText(title, () => displayTitle);
  const metrics = documentRef.createElement('p');
  metrics.className = 'track-card-metrics';
  const routeType = routeTypeDefinition(track.routeType);
  metrics.innerHTML = routeTypeIcon(routeType.id);
  const metricsText = documentRef.createElement('span');
  bindText(metricsText, () => formatTrackMetrics(track));
  metrics.append(metricsText);
  const dateElement = documentRef.createElement('time');
  dateElement.className = 'track-card-date';
  dateElement.dateTime = track.createdAt;
  bindText(dateElement, () => date(track.createdAt));
  const dateRow = documentRef.createElement('div');
  dateRow.className = 'track-card-date-row';
  const externalLinks = documentRef.createElement('span');
  externalLinks.className = 'track-card-external-links';
  renderExternalTrackLinks(externalLinks, track.externalLinks, documentRef, { compact: true });
  if (!ownerActions && track.author?.displayName) {
    const author = documentRef.createElement('span');
    author.className = 'track-card-author';
    const avatar = documentRef.createElement(track.author.avatarUrl ? 'img' : 'span');
    avatar.className = 'track-card-author-avatar';
    if (track.author.avatarUrl) {
      avatar.src = track.author.avatarUrl;
      avatar.alt = '';
      avatar.referrerPolicy = 'no-referrer';
    } else {
      avatar.setAttribute('aria-hidden', 'true');
      avatar.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0"/></svg>';
    }
    const authorName = documentRef.createElement('span');
    bindText(authorName, () => track.author.displayName);
    author.append(avatar, authorName);
    const separator = documentRef.createElement('span');
    separator.className = 'track-card-meta-separator';
    bindText(separator, () => '·');
    dateRow.append(author, separator, dateElement, externalLinks);
  } else {
    dateRow.append(dateElement, externalLinks);
  }
  body.append(badge, title, metrics, dateRow);

  const actions = documentRef.createElement('div');
  actions.className = 'track-card-actions';
  const select = documentRef.createElement('input');
  select.className = 'track-card-select';
  select.type = 'checkbox';
  select.value = track.id;
  select.dataset.trackSelect = '';
  bindAttribute(select, 'aria-label', () => t('tracks.select', { title: displayTitle }));
  const favorite = documentRef.createElement('button');
  favorite.className = `track-card-action track-card-favorite${ownerActions && track.isFavorite ? ' is-favorite' : ''}`;
  favorite.type = 'button';
  favorite.dataset.trackAction = ownerActions ? 'favorite' : 'unsave';
  favorite.setAttribute('aria-pressed', String(ownerActions ? Boolean(track.isFavorite) : true));
  bindAttribute(favorite, 'aria-label', () => t(favorite.getAttribute?.('aria-pressed') === 'true' || favorite.attributes?.['aria-pressed'] === 'true' ? 'tracks.removeFavorite' : 'tracks.addFavorite', { title: displayTitle }));
  bindAttribute(favorite, 'title', () => t(favorite.getAttribute?.('aria-pressed') === 'true' || favorite.attributes?.['aria-pressed'] === 'true' ? 'common.removeFavorite' : 'common.addFavorite'));
  favorite.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>';
  const edit = documentRef.createElement('button');
  edit.className = 'track-card-action';
  edit.type = 'button';
  edit.dataset.trackAction = 'edit';
  bindAttribute(edit, 'aria-label', () => t('tracks.edit', { title: displayTitle }));
  bindAttribute(edit, 'title', () => t('common.edit'));
  edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.3-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.3 16 4 20Z"/><path d="m14.8 6.2 3 3"/></svg>';
  const remove = documentRef.createElement('button');
  remove.className = 'track-card-action track-card-delete';
  remove.type = 'button';
  remove.dataset.trackAction = 'delete';
  bindAttribute(remove, 'aria-label', () => t('tracks.delete', { title: displayTitle }));
  bindAttribute(remove, 'title', () => t('common.delete'));
  remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></svg>';
  const download = documentRef.createElement('a');
  download.className = 'track-card-download';
  download.href = track.downloadUrl;
  download.setAttribute('download', '');
  bindAttribute(download, 'aria-label', () => t('tracks.download', { title: displayTitle }));
  download.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-4-4 4 4 4-4M5 20h14"/></svg>';
  actions.append(select, favorite, ...(ownerActions ? [edit, remove] : []), download);
  article.append(previewLink, body, actions);
  return article;
}
