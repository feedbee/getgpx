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

export function cancelTrackSearch({ input, history, reload }) {
  input.value = '';
  history.replaceState(null, '', '/my-tracks');
  reload({ reset: true });
}

function metric(value, suffix, digits = 0) {
  return Number.isFinite(value) ? `${value.toLocaleString('ru-RU', { maximumFractionDigits: digits })} ${suffix}` : '—';
}

export function formatTrackMetrics(track) {
  return [
    metric(track.distanceKm, 'км', 1),
    `↗ ${metric(track.ascentM, 'м')}`,
    `↘ ${metric(track.descentM, 'м')}`,
    formatTrackDuration(track.estimatedDurationMs),
    metric(track.speedKmh, 'км/ч', 1),
  ].join(' · ');
}

export function createTrackCard(track, documentRef = document) {
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
  metrics.textContent = formatTrackMetrics(track);
  const date = documentRef.createElement('time');
  date.className = 'track-card-date';
  date.dateTime = track.createdAt;
  date.textContent = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(track.createdAt));
  body.append(badge, title, metrics, date);

  const actions = documentRef.createElement('div');
  actions.className = 'track-card-actions';
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
  actions.append(edit, remove, download);
  article.append(previewLink, body, actions);
  return article;
}
