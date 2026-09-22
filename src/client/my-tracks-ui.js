import { renderExternalTrackLinks } from './external-track-links-ui.js';
import { routeTypeDefinition, routeTypeIcon } from './route-type-ui.js';

const STATUS_LABELS = {
  READY: 'Готов',
  FAILED: 'Нужен повторный анализ',
  QUEUED: 'В очереди',
  PARSING: 'Разбираем GPX',
  ENRICHING: 'Анализируем покрытия',
};

export function trackStatusLabel(track) {
  return track.status === 'PROCESSING' ? (STATUS_LABELS[track.step] || 'Обрабатываем') : (STATUS_LABELS[track.status] || track.status);
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
    titles: tracks.slice(0, 10).map((track) => track.title),
    remaining: Math.max(0, tracks.length - 10),
  };
}

export function bulkSelectionState({ total, selected, actionLabel = 'Удалить' }) {
  const allSelected = total > 0 && selected === total;
  return {
    allSelected,
    selectLabel: allSelected ? 'Отменить выбор' : 'Выбрать всё',
    deleteLabel: selected ? `${actionLabel} (${selected})` : actionLabel,
    deleteDisabled: selected === 0,
  };
}

function metric(value, suffix, digits = 0) {
  return Number.isFinite(value) ? `${value.toLocaleString('ru-RU', { maximumFractionDigits: digits })} ${suffix}` : '—';
}

export function formatTrackMetrics(track) {
  const routeType = routeTypeDefinition(track.routeType);
  return [
    routeType.shortLabel,
    metric(track.distanceKm, 'км', 1),
    `↗ ${metric(track.ascentM, 'м')}`,
    `↘ ${metric(track.descentM, 'м')}`,
    formatTrackDuration(track.estimatedDurationMs),
    metric(track.speedKmh, 'км/ч', 1),
  ].join(' · ');
}

export function createTrackCard(track, documentRef = document, { ownerActions = true } = {}) {
  const article = documentRef.createElement('article');
  article.className = 'track-card';
  article.dataset.trackId = track.id;
  article.dataset.trackTitle = track.title;
  article.dataset.trackSpeed = track.speedKmh || 20;

  const previewLink = documentRef.createElement('a');
  previewLink.className = 'track-preview';
  previewLink.href = track.url;
  previewLink.setAttribute('aria-label', `Открыть трек ${track.title}`);
  const points = previewPolyline(track.preview);
  previewLink.innerHTML = points
    ? `<svg viewBox="-7 -7 114 114" role="img" aria-label="Превью маршрута"><polyline points="${points}" /></svg>`
    : '<span aria-hidden="true">GPX</span>';

  const body = documentRef.createElement('div');
  body.className = 'track-card-body';
  const badge = documentRef.createElement('span');
  badge.className = `track-status track-status-${track.status.toLowerCase()}`;
  badge.textContent = trackStatusLabel(track);
  const title = documentRef.createElement('a');
  title.className = 'track-card-title';
  title.href = track.url;
  title.textContent = track.title;
  const metrics = documentRef.createElement('p');
  metrics.className = 'track-card-metrics';
  const routeType = routeTypeDefinition(track.routeType);
  metrics.innerHTML = `${routeTypeIcon(routeType.id)}<span>${formatTrackMetrics(track)}</span>`;
  const date = documentRef.createElement('time');
  date.className = 'track-card-date';
  date.dateTime = track.createdAt;
  date.textContent = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(track.createdAt));
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
    authorName.textContent = track.author.displayName;
    author.append(avatar, authorName);
    const separator = documentRef.createElement('span');
    separator.className = 'track-card-meta-separator';
    separator.textContent = '·';
    dateRow.append(author, separator, date, externalLinks);
  } else {
    dateRow.append(date, externalLinks);
  }
  body.append(badge, title, metrics, dateRow);

  const actions = documentRef.createElement('div');
  actions.className = 'track-card-actions';
  const select = documentRef.createElement('input');
  select.className = 'track-card-select';
  select.type = 'checkbox';
  select.value = track.id;
  select.dataset.trackSelect = '';
  select.setAttribute('aria-label', `Выбрать ${track.title}`);
  const favorite = documentRef.createElement('button');
  favorite.className = `track-card-action track-card-favorite${ownerActions && track.isFavorite ? ' is-favorite' : ''}`;
  favorite.type = 'button';
  favorite.dataset.trackAction = ownerActions ? 'favorite' : 'unsave';
  favorite.setAttribute('aria-pressed', String(ownerActions ? Boolean(track.isFavorite) : true));
  favorite.setAttribute('aria-label', ownerActions
    ? (track.isFavorite ? `Убрать ${track.title} из избранного` : `Добавить ${track.title} в избранное`)
    : `Убрать ${track.title} из избранного`);
  favorite.title = ownerActions && !track.isFavorite ? 'Добавить в избранное' : 'Убрать из избранного';
  favorite.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>';
  const edit = documentRef.createElement('button');
  edit.className = 'track-card-action';
  edit.type = 'button';
  edit.dataset.trackAction = 'edit';
  edit.setAttribute('aria-label', `Редактировать ${track.title}`);
  edit.title = 'Редактировать';
  edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.3-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.3 16 4 20Z"/><path d="m14.8 6.2 3 3"/></svg>';
  const remove = documentRef.createElement('button');
  remove.className = 'track-card-action track-card-delete';
  remove.type = 'button';
  remove.dataset.trackAction = 'delete';
  remove.setAttribute('aria-label', `Удалить ${track.title}`);
  remove.title = 'Удалить';
  remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></svg>';
  const download = documentRef.createElement('a');
  download.className = 'track-card-download';
  download.href = track.downloadUrl;
  download.setAttribute('download', '');
  download.setAttribute('aria-label', `Скачать ${track.title}`);
  download.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-4-4 4 4 4-4M5 20h14"/></svg>';
  actions.append(select, favorite, ...(ownerActions ? [edit, remove] : []), download);
  article.append(previewLink, body, actions);
  return article;
}
