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

function metric(value, suffix, digits = 0) {
  return Number.isFinite(value) ? `${value.toLocaleString('ru-RU', { maximumFractionDigits: digits })} ${suffix}` : '—';
}

export function createTrackCard(track, documentRef = document) {
  const article = documentRef.createElement('article');
  article.className = 'track-card';

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
  metrics.textContent = `${formatTrackDuration(track.estimatedDurationMs)} · ${metric(track.distanceKm, 'км', 1)} · ↗ ${metric(track.ascentM, 'м')}`;
  const date = documentRef.createElement('time');
  date.className = 'track-card-date';
  date.dateTime = track.createdAt;
  date.textContent = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(track.createdAt));
  body.append(badge, title, metrics, date);

  const download = documentRef.createElement('a');
  download.className = 'track-card-download';
  download.href = track.downloadUrl;
  download.setAttribute('download', '');
  download.setAttribute('aria-label', `Скачать ${track.title}`);
  download.textContent = '↓';
  article.append(previewLink, body, download);
  return article;
}
