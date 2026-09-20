import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { renderAuthControl } from './auth-ui.js';
import { cancelTrackSearch, createTrackCard } from './my-tracks-ui.js';
import { closeOverflowMenuOnOutsideClick } from './route-actions-ui.js';
import { shouldShowCompactRouteHeader } from './sticky-route-header-ui.js';
import { formatTrackAttribution, resolveTrackUploader } from './track-meta-ui.js';
import { analyzeTrack } from './domain/gpx.js';
import { createDemoTrack } from './domain/demo.js';
import { detectClimbs, detectDescents } from './domain/climbs.js';
import { calculateSegmentGrades } from './domain/gradient.js';
import { emptyPoiSelection, updatePoiSelection } from './domain/poi-selection.js';
import { areaPathFromCoordinates, elevationGainLoss, nearestRoutePointIndex, pointIndexAtRatio, pointerRatioInPlot, profileFocusVisibility, profileRangePosition, visibleRangeIndices } from './domain/profile-math.js';
import { colorRunsForMode, highlightRunsForFilter, profileColorRuns } from './domain/route-color.js';
import { isClosedRoute } from './domain/route-shape.js';
import { applyValhallaMatches, classifySurface, classifyWayType, fetchValhallaMatches, roadQualityCategories, roadTypeLabel, summarizeRoadQuality, summarizeSurfaces, summarizeWayTypes, surfaceCategories, surfaceEmphasis, wayTypeCategories } from './domain/surface.js';

const app = document.querySelector('#app');
let map;
let routeLine;
let activeMarker;
let poiMarkers = [];
let poiSelection = { ...emptyPoiSelection };
let focusLayers = [];
let currentTrack;
let activePointIndex = 0;
let viewRange = [0, 1];
let zoomHistory = [];
let selectionStart = null;
let currentViewMetrics = null;
let mapColorMode = 'gradient';
let profileColorMode = 'gradient';
let profileFocusPlacement = 'ribbon';
let enrichmentRun = 0;
let hoveredSurfaceId = null;
let pinnedSurfaceId = null;
let hoveredWayTypeId = null;
let pinnedWayTypeId = null;
let hoveredQualityId = null;
let pinnedQualityId = null;
let hoveredRange = null;
let pinnedRange = null;
let currentUser = null;
let activeUploadTrackId = null;
const isMyTracksPage = window.location.pathname === '/my-tracks';
let myTracksCursor = null;
let myTracksLoading = false;
let publicTrackId = null;
let publicTrackData = null;
let publicTrackOwnershipVerified = false;

app.innerHTML = `
  <header class="topbar">
    <div class="topbar-inner"><a class="brand" href="/" aria-label="Trace, главная"><span class="brand-mark">T</span><span>TRACE</span></a>
    <section class="compact-route-header" aria-label="Текущий маршрут" aria-hidden="true">
      <strong id="compact-track-name">Загрузка маршрута…</strong>
      <div class="compact-route-metrics" aria-label="Краткие показатели маршрута">
        <span aria-label="Расстояние маршрута"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M7 9l-3 3 3 3m10-6 3 3-3 3"/></svg><b id="compact-distance">—</b> км</span>
        <span aria-label="Набор высоты"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17 17 5m-7 0h7v7"/></svg><b id="compact-ascent">—</b> м <small>набор</small></span>
        <span aria-label="Спуск по высоте"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 7 12 12m0-7v7h-7"/></svg><b id="compact-descent">—</b> м <small>спуск</small></span>
        <span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><b id="compact-duration">—</b> <i id="compact-duration-unit"></i></span>
        <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.6 18a8 8 0 1 1 12.8 0M12 13l4-4"/><path d="M4 18h16"/></svg><b id="compact-speed">— км/ч</b></span>
      </div>
    </section>
    <div class="topbar-actions"><label class="upload-button" data-auth-upload for="gpx-file" hidden><span aria-hidden="true">↗</span> Загрузить GPX</label><div id="auth-control">${renderAuthControl(null)}</div></div></div>
    <input id="gpx-file" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden />
  </header>
  <main class="my-tracks-page" id="my-tracks" ${isMyTracksPage ? '' : 'hidden'}>
    <header class="my-tracks-header">
      <div><p class="route-kicker">ЛИЧНАЯ КОЛЛЕКЦИЯ</p><h1>Мои треки</h1><p>Ваши маршруты — от свежих загрузок к старым.</p></div>
      <label class="my-tracks-upload" data-auth-upload for="gpx-file" hidden><span aria-hidden="true">＋</span> Загрузить GPX</label>
    </header>
    <form class="track-search" id="track-search" role="search"><label for="track-query">Поиск по названию</label><div class="track-search-controls"><span class="track-search-input"><input id="track-query" name="query" type="search" maxlength="100" placeholder="Например, вечерний гравий" autocomplete="off" /><button class="track-search-clear" id="track-search-clear" type="button" aria-label="Отменить поиск" title="Отменить поиск" hidden>×</button></span><button class="track-search-submit" type="submit">Найти</button></div></form>
    <p class="my-tracks-message" id="my-tracks-message" role="status">Войдите, чтобы увидеть свои треки.</p>
    <section class="track-list" id="track-list" aria-live="polite"></section>
    <button class="load-more-tracks" id="load-more-tracks" type="button" hidden>Показать ещё</button>
  </main>
  <main class="page" id="route" ${isMyTracksPage ? 'hidden' : ''}>
    <header class="route-header">
      <p class="route-state-note" id="route-state-note" hidden></p>
      <div class="route-heading">
        <div class="route-heading-copy">
          <h1 id="track-name">Загрузка маршрута…</h1>
        </div>
        <div class="track-attribution" id="track-attribution" hidden>
          <span class="track-attribution-avatar" aria-hidden="true"><img id="track-uploader-avatar" alt="" hidden /><svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0"/></svg></span>
          <span id="track-attribution-text"></span>
        </div>
      </div>
      <div class="route-summary-row">
        <div class="route-metrics" aria-label="Показатели маршрута">
          <span aria-label="Расстояние маршрута"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M7 9l-3 3 3 3m10-6 3 3-3 3"/></svg><b id="distance">—</b> км</span>
          <span aria-label="Набор высоты"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17 17 5m-7 0h7v7"/></svg><b id="ascent">—</b> м <small>набор</small></span>
          <span aria-label="Спуск по высоте"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 7 12 12m0-7v7h-7"/></svg><b id="descent">—</b> м <small>спуск</small></span>
          <span class="moving-metric"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><b id="duration">—</b> <i id="duration-unit"></i></span>
          <span class="moving-metric"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.6 18a8 8 0 1 1 12.8 0M12 13l4-4"/><path d="M4 18h16"/></svg><abbr id="average-speed-badge" title="Средняя скорость движения по данным GPX">— км/ч</abbr></span>
        </div>
        <div class="route-actions" aria-label="Действия с маршрутом">
          <button class="primary-action" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>Сохранить</button>
          <button type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>Поделиться</button>
          <a id="download-track" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/></svg>Скачать трек</a>
          <span class="owner-track-actions" id="owner-track-actions" hidden><details class="route-overflow"><summary aria-label="Дополнительные действия"><span aria-hidden="true">•••</span></summary><div><button id="edit-track" type="button">Редактировать</button><button class="danger-button" id="delete-track" type="button">Удалить</button></div></details></span>
        </div>
      </div>
    </header>
    <div class="route-workspace">
      <div class="route-content">
        <nav class="section-nav route-tabs" aria-label="Содержание страницы">
          <a href="#points-of-interest" id="poi-nav-link" hidden>Точки интереса</a><a href="#details">Профиль высот</a><a href="#way-types">Информация о трассе</a><a href="#climbs">Подъёмы и спуски</a>
        </nav>
        <section class="content-section poi-section" id="points-of-interest" aria-labelledby="poi-title" hidden>
          <div class="compact-heading"><h2 id="poi-title">Точки интереса</h2><p id="poi-count"></p></div>
          <div class="analysis-card poi-list" id="poi-list"></div>
        </section>
        <section class="content-section profile-section" id="details">
          <div class="compact-heading"><h2>Профиль высот</h2></div>
          <div class="analysis-card profile-card">
            <div class="profile-toolbar"><div class="profile-mode segmented-control" aria-label="Цвет профиля"><button class="active" type="button" data-color-scope="profile" data-color-mode="gradient">Градиент</button><button type="button" data-color-scope="profile" data-color-mode="surface">Покрытие</button><button type="button" data-color-scope="profile" data-color-mode="waytype">Тип дороги</button><button type="button" data-color-scope="profile" data-color-mode="quality">Качество</button></div><div class="profile-toolbar-actions"><div class="profile-overlay-settings"><button class="profile-settings-trigger" id="profile-settings-trigger" type="button" aria-label="Настройки наложения" aria-expanded="false" aria-controls="profile-settings-popover"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="M19 13.2v-2.4l-2-.7a7 7 0 0 0-.6-1.4l.9-1.9-1.7-1.7-1.9.9a7 7 0 0 0-1.4-.6l-.7-2H9.2l-.7 2a7 7 0 0 0-1.4.6l-1.9-.9-1.7 1.7.9 1.9a7 7 0 0 0-.6 1.4l-2 .7v2.4l2 .7a7 7 0 0 0 .6 1.4l-.9 1.9 1.7 1.7 1.9-.9a7 7 0 0 0 1.4.6l.7 2h2.4l.7-2a7 7 0 0 0 1.4-.6l1.9.9 1.7-1.7-.9-1.9a7 7 0 0 0 .6-1.4l2-.7Z"/></svg></button><div class="profile-settings-popover" id="profile-settings-popover" role="dialog" aria-labelledby="profile-settings-title" hidden><strong id="profile-settings-title">Отображать наложение</strong><div class="profile-focus-placement segmented-control" aria-label="Расположение подсветки"><button type="button" data-profile-focus-placement="profile" aria-pressed="false">На профиле</button><button class="active" type="button" data-profile-focus-placement="ribbon" aria-pressed="true">На полоске</button></div></div></div><div class="profile-actions segmented-control"><button id="zoom-back" type="button" disabled>← Назад</button><button id="zoom-reset" type="button" disabled>Отмена</button></div></div></div>
            <div class="profile-wrap" id="profile-wrap" tabindex="0" role="slider" aria-label="Положение на профиле высоты" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
              <svg id="profile" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ebc35" stop-opacity=".24"/><stop offset="1" stop-color="#7ebc35" stop-opacity=".02"/></linearGradient></defs><g id="grid"></g><g id="climb-bands"></g><path id="profile-area" class="profile-area"></path><g id="profile-gradient-area"></g><g id="gradient-line"></g><g id="profile-focus-profile"></g><g id="surface-ribbon"></g><g id="profile-focus-ribbon"></g><rect id="profile-selection" class="profile-selection" x="0" y="18" width="0" height="246"></rect><line id="profile-cursor" class="profile-cursor" y1="18" y2="264"></line><circle id="profile-dot" class="profile-dot" r="6"></circle></svg>
              <div class="profile-pois" id="profile-pois" aria-hidden="true"></div>
              <div class="axis" id="axis"></div>
            </div>
            <div class="gradient-legend route-legend" id="gradient-legend"><span><i class="grade-down"></i>спуск</span><span><i class="grade-easy"></i>0–3%</span><span><i class="grade-mid"></i>3–6%</span><span><i class="grade-hard"></i>6–9%</span><span><i class="grade-steep"></i>9–12%</span><span><i class="grade-max"></i>12%+</span></div>
            <div class="surface-legend route-legend" id="surface-legend" hidden></div><div class="waytype-legend route-legend" id="waytype-legend" hidden></div><div class="quality-legend route-legend" id="quality-legend" hidden></div>
            <div class="profile-summary"><span><b id="profile-ascent">—</b> м<small>Набор</small></span><span><b id="profile-descent">—</b> м<small>Спуск</small></span><span><b id="max-label">—</b><small>Максимум</small></span><span><b id="min-label">—</b><small>Минимум</small></span></div>
          </div>
        </section>
        <section class="content-section surface-section" id="way-types" aria-labelledby="surface-title">
          <div class="compact-heading"><div class="surface-title-row"><h2 id="surface-title">Информация о трассе</h2><div class="source-help"><button class="source-help-trigger" type="button" aria-label="Источники данных" aria-haspopup="dialog" aria-controls="source-popover">?</button><div class="source-popover" id="source-popover" role="dialog" aria-label="Источники данных"><strong>Источники данных</strong><ul><li data-analysis-source="gpx"><span class="source-state" aria-hidden="true">…</span><span><b>GPX</b><small>Маршрут, высоты и время</small></span></li><li data-analysis-source="valhalla"><span class="source-state" aria-hidden="true">…</span><span><b>Valhalla</b><small>Сопоставление с дорогами и оценка покрытий</small></span><button class="source-retry" data-retry-source="valhalla" type="button" aria-label="Повторить получение данных Valhalla" title="Повторить" hidden>↻</button></li><li data-analysis-source="openStreetMap"><span class="source-state" aria-hidden="true">…</span><span><b>OpenStreetMap</b><small>Детальные теги покрытий и качества дорог</small></span><button class="source-retry" data-retry-source="openStreetMap" type="button" aria-label="Повторить получение данных OpenStreetMap" title="Повторить" hidden>↻</button></li></ul></div></div></div></div>
          <div class="analysis-card">
            <section class="distribution-group"><h3>Типы дорог</h3><div class="distribution-bar" id="way-type-bar" aria-label="Распределение типов дорог"></div><div class="distribution-list" id="way-type-stats"></div></section>
            <section class="distribution-group"><h3>Покрытия</h3><div class="distribution-bar surface-bar" id="surface-bar" aria-label="Распределение покрытия"></div><div class="distribution-list surface-stats" id="surface-stats"></div></section>
            <section class="distribution-group quality-compact"><h3>Качество проезда</h3><div class="distribution-bar" id="quality-bar" aria-label="Распределение качества проезда"></div><div class="distribution-list quality-stats" id="quality-stats"></div></section>
          </div>
        </section>
        <section class="content-section climbs-section" id="climbs" aria-labelledby="climbs-title">
          <div class="compact-heading"><h2 id="climbs-title">Подъёмы и спуски</h2><p>Автоматическое определение</p></div>
          <div class="analysis-card terrain-card">
            <div class="terrain-tabs" role="tablist"><button class="active" type="button" data-terrain-tab="climbs">Подъёмы <b id="climbs-count">0</b></button><button type="button" data-terrain-tab="descents">Спуски <b id="descents-count">0</b></button></div>
            <div class="climbs-list terrain-list" id="climbs-list"></div><div class="descents-list terrain-list" id="descents-list" hidden></div>
          </div>
        </section>
      </div>
      <aside class="map-column"><section class="map-shell" aria-label="Карта маршрута"><div id="map"></div><div class="map-mode segmented-control" aria-label="Цвет маршрута на карте"><button class="active" type="button" data-color-scope="map" data-color-mode="gradient">Градиент</button><button type="button" data-color-scope="map" data-color-mode="surface">Покрытие</button><button type="button" data-color-scope="map" data-color-mode="waytype">Тип дороги</button><button type="button" data-color-scope="map" data-color-mode="quality">Качество</button></div><div class="map-note" id="map-note"></div><div class="hover-readout" id="hover-readout" aria-live="polite"><b>Наведите на маршрут</b></div></section></aside>
    </div>
  </main>
  <div class="drop-overlay" id="drop-overlay"><strong>Отпустите GPX здесь</strong><span>Маршрут будет загружен и обработан</span></div>
  <div class="processing-overlay" id="processing-overlay" hidden>
    <section class="processing-card" role="dialog" aria-modal="true" aria-labelledby="processing-title">
      <p class="route-kicker">GPX PROCESSING</p><h2 id="processing-title">Создаём трек</h2>
      <ol class="processing-steps" aria-live="polite">
        <li data-processing-step="UPLOADING">Загружаем файл</li><li data-processing-step="QUEUED">Ставим в обработку</li>
        <li data-processing-step="PARSING">Разбираем GPX и считаем маршрут</li><li data-processing-step="ENRICHING">Определяем дороги и покрытия</li>
        <li data-processing-step="COMPLETE">Трек готов</li>
      </ol>
      <p class="processing-error" id="processing-error" hidden></p>
      <details class="processing-details" id="processing-details" hidden><summary>Техническая информация</summary><code id="processing-code"></code></details>
      <div class="processing-actions"><button id="retry-processing" type="button" hidden>Повторить анализ</button><button id="close-processing" type="button">Закрыть</button></div>
    </section>
  </div>
  <input id="replacement-gpx" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden />
  <dialog class="edit-track-dialog" id="edit-track-dialog">
    <form id="edit-track-form">
      <p class="route-kicker">РЕДАКТИРОВАНИЕ</p><h2>Параметры трека</h2>
      <label>Название<input id="edit-track-title" name="title" required maxlength="200" /></label>
      <label>Расчётная скорость, км/ч<input id="edit-track-speed" name="speedKmh" type="number" min="1" max="50" step="0.1" required /></label>
      <label class="replace-gpx-control" for="replacement-gpx">Заменить исходный GPX…</label>
      <p class="form-error" id="edit-track-error" hidden></p>
      <div><button type="button" id="cancel-track-edit">Отмена</button><button type="submit">Сохранить</button></div>
    </form>
  </dialog>
  <div class="toast" id="toast" role="alert"></div>
`;

const authControl = document.querySelector('#auth-control');

function closeUserMenu() {
  const button = authControl.querySelector('.avatar-button');
  const menu = authControl.querySelector('.user-menu-popover');
  if (!button || !menu) return;
  button.setAttribute('aria-expanded', 'false');
  menu.hidden = true;
}

function renderTrackAttribution() {
  if (!publicTrackData) return;
  const uploader = resolveTrackUploader(publicTrackData, currentUser, publicTrackOwnershipVerified);
  const attributionText = formatTrackAttribution({ ...publicTrackData, uploader });
  const attribution = document.querySelector('#track-attribution');
  attribution.hidden = !attributionText;
  document.querySelector('#track-attribution-text').textContent = attributionText;
  const uploaderAvatar = document.querySelector('#track-uploader-avatar');
  uploaderAvatar.hidden = !uploader?.avatarUrl;
  if (uploader?.avatarUrl) uploaderAvatar.src = uploader.avatarUrl;
  else uploaderAvatar.removeAttribute('src');
}

function setAuthUser(user) {
  currentUser = user;
  authControl.innerHTML = renderAuthControl(user);
  document.querySelectorAll('[data-auth-upload]').forEach((control) => { control.hidden = !user; });
  if (isMyTracksPage) loadMyTracks({ reset: true });
  if (publicTrackId && user) loadTrackManagement(publicTrackId);
  if (!user) {
    publicTrackOwnershipVerified = false;
    renderTrackAttribution();
    document.querySelector('#owner-track-actions').hidden = true;
    document.querySelectorAll('.source-retry').forEach((button) => { button.hidden = true; });
  }
}

async function loadTrackManagement(trackId) {
  const response = await fetch(`/api/tracks/${trackId}/manage`, { headers: { accept: 'application/json' } });
  if (!response.ok) return;
  const { data } = await response.json();
  if (trackId !== publicTrackId) return;
  publicTrackOwnershipVerified = true;
  renderTrackAttribution();
  document.querySelector('#owner-track-actions').hidden = false;
  document.querySelector('#edit-track-title').value = data.title;
  document.querySelector('#edit-track-speed').value = data.speedKmh || 20;
  document.querySelectorAll('.source-retry').forEach((button) => {
    button.hidden = !data.canRetry || button.dataset.retrySource !== data.retrySource;
  });
}

async function loadMyTracks({ reset = false } = {}) {
  if (!isMyTracksPage || myTracksLoading) return;
  const list = document.querySelector('#track-list');
  const message = document.querySelector('#my-tracks-message');
  const more = document.querySelector('#load-more-tracks');
  if (!currentUser) {
    list.replaceChildren();
    message.innerHTML = 'Войдите, чтобы увидеть свои треки. <a href="/api/auth/google">Войти</a>';
    message.hidden = false;
    more.hidden = true;
    return;
  }
  if (reset) {
    myTracksCursor = null;
    list.replaceChildren();
  }
  myTracksLoading = true;
  message.textContent = 'Загружаем треки…';
  message.hidden = false;
  more.disabled = true;
  const query = document.querySelector('#track-query').value.trim();
  const parameters = new URLSearchParams();
  if (query) parameters.set('query', query);
  if (myTracksCursor) parameters.set('cursor', myTracksCursor);
  try {
    const response = await fetch(`/api/tracks/mine?${parameters}`, { headers: { accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || 'Не удалось загрузить список треков.');
    payload.data.items.forEach((track) => list.append(createTrackCard(track)));
    myTracksCursor = payload.data.nextCursor;
    message.textContent = list.children.length ? '' : (query ? 'По вашему запросу ничего не найдено.' : 'Здесь пока нет треков. Загрузите первый GPX.');
    message.hidden = Boolean(list.children.length);
    more.hidden = !myTracksCursor;
  } catch (listError) {
    message.textContent = listError.message;
    message.hidden = false;
    more.hidden = true;
  } finally {
    myTracksLoading = false;
    more.disabled = false;
  }
}

async function restoreSession() {
  try {
    const response = await fetch('/api/auth/session', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('Session request failed.');
    const payload = await response.json();
    setAuthUser(payload.user || null);
  } catch {
    setAuthUser(null);
  }
}

authControl.addEventListener('click', async (event) => {
  const avatarButton = event.target.closest('.avatar-button');
  if (avatarButton) {
    const menu = authControl.querySelector('.user-menu-popover');
    const expanded = avatarButton.getAttribute('aria-expanded') === 'true';
    avatarButton.setAttribute('aria-expanded', String(!expanded));
    menu.hidden = expanded;
    return;
  }
  if (!event.target.closest('.logout-button')) return;
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', headers: { accept: 'application/json' } });
    if (response.ok) setAuthUser(null);
  } catch {
    closeUserMenu();
  }
});

document.addEventListener('click', (event) => {
  if (!authControl.contains(event.target)) closeUserMenu();
  closeOverflowMenuOnOutsideClick(document.querySelector('.route-overflow'), event.target);
});

function formatDuration(ms) {
  if (!ms) return ['—', ''];
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);
  return [`${hours}:${String(minutes).padStart(2, '0')}`, 'часа'];
}

function makeEndpointIcon(label, type) {
  return L.divIcon({ className: '', html: `<div class="endpoint endpoint-${type}">${label}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
}

function makePoiIcon(index) {
  return L.divIcon({ className: '', html: `<div class="poi-marker"><span>${index + 1}</span></div>`, iconSize: [28, 32], iconAnchor: [14, 30] });
}

function selectedPoiIndex() {
  return poiSelection.pinnedIndex ?? poiSelection.hoveredIndex;
}

function renderPoiSelection() {
  const index = selectedPoiIndex();
  document.querySelectorAll('[data-poi-index]').forEach((row) => {
    row.classList.toggle('is-active', Number(row.dataset.poiIndex) === index);
    row.setAttribute('aria-pressed', String(Number(row.dataset.poiIndex) === poiSelection.pinnedIndex));
  });
  document.querySelectorAll('[data-profile-poi-index]').forEach((marker) => {
    marker.classList.toggle('is-active', Number(marker.dataset.profilePoiIndex) === index);
  });
  poiMarkers.forEach((marker, markerIndex) => {
    marker.getElement()?.querySelector('.poi-marker')?.classList.toggle('is-active', markerIndex === index);
    marker.setZIndexOffset(markerIndex === index ? 1200 : 700);
    if (markerIndex === index) marker.openTooltip();
    else marker.closeTooltip();
  });
}

function applyPoiSelection(nextSelection, { restorePointIndex = null } = {}) {
  poiSelection = nextSelection;
  renderPoiSelection();
  const index = selectedPoiIndex();
  const routePointIndex = currentTrack?.pointsOfInterest?.[index]?.routePointIndex;
  if (Number.isInteger(routePointIndex) && routePointIndex >= 0) {
    setActivePoint(routePointIndex, { showContext: true });
  } else if (Number.isInteger(restorePointIndex)) {
    setActivePoint(restorePointIndex);
  }
}

function hoverPoi(index) {
  applyPoiSelection(updatePoiSelection(poiSelection, {
    type: 'hover', index, currentPointIndex: activePointIndex,
  }));
}

function leavePoi() {
  const restorePointIndex = poiSelection.returnPointIndex;
  applyPoiSelection(updatePoiSelection(poiSelection, { type: 'leave' }), { restorePointIndex });
}

function togglePoi(index) {
  const restorePointIndex = poiSelection.returnPointIndex;
  applyPoiSelection(updatePoiSelection(poiSelection, {
    type: 'toggle', index, currentPointIndex: activePointIndex,
  }), { restorePointIndex });
}

function renderPointsOfInterest(pointsOfInterest = []) {
  const section = document.querySelector('#points-of-interest');
  const navLink = document.querySelector('#poi-nav-link');
  const list = document.querySelector('#poi-list');
  section.hidden = pointsOfInterest.length === 0;
  navLink.hidden = pointsOfInterest.length === 0;
  list.replaceChildren();
  if (!pointsOfInterest.length) return;

  const lastTwoDigits = pointsOfInterest.length % 100;
  const lastDigit = pointsOfInterest.length % 10;
  const countLabel = lastTwoDigits >= 11 && lastTwoDigits <= 14
    ? 'точек' : lastDigit === 1 ? 'точка' : lastDigit >= 2 && lastDigit <= 4 ? 'точки' : 'точек';
  document.querySelector('#poi-count').textContent = `${pointsOfInterest.length.toLocaleString('ru-RU')} ${countLabel}`;
  pointsOfInterest.forEach((point, index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'poi-row';
    row.dataset.poiIndex = String(index);
    row.setAttribute('aria-pressed', 'false');
    const number = document.createElement('b');
    number.textContent = String(index + 1);
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = point.name;
    copy.append(name);
    const detail = point.type || point.symbol;
    if (detail) {
      const meta = document.createElement('small');
      meta.textContent = detail;
      copy.append(meta);
    }
    row.append(number, copy);
    list.append(row);
  });
}

function initMap() {
  map = L.map('map', { zoomControl: false, attributionControl: true });
  map.createPane('startMarkerPane');
  map.getPane('startMarkerPane').style.zIndex = '675';
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);
}

function nearestPoint(latlng) {
  return nearestRoutePointIndex(currentTrack.points, { lat: latlng.lat, lon: latlng.lng });
}

function selectedSurfaceId() {
  return pinnedSurfaceId || hoveredSurfaceId;
}

function selectedWayTypeId() {
  return pinnedWayTypeId || hoveredWayTypeId;
}

function selectedQualityId() {
  return pinnedQualityId || hoveredQualityId;
}

function selectedTerrainRange() {
  return pinnedRange || hoveredRange;
}

function selectedRouteFilter() {
  if (selectedQualityId()) return { kind: 'quality', id: selectedQualityId() };
  if (selectedWayTypeId()) return { kind: 'waytype', id: selectedWayTypeId() };
  if (selectedSurfaceId()) return { kind: 'surface', id: selectedSurfaceId() };
  return null;
}

function drawMap(track, { fit = true } = {}) {
  if (routeLine) map.eachLayer((layer) => { if (layer.options?.trackLayer && !layer.options?.rangeFocus) map.removeLayer(layer); });
  poiMarkers = [];
  const coordinates = track.points.map((point) => [point.lat, point.lon]);
  L.polyline(coordinates, { color: '#ffffff', weight: 8, opacity: 0.92, trackLayer: true, interactive: false }).addTo(map);
  colorRunsForMode(track.points, mapColorMode).forEach((run) => {
    L.polyline(coordinates.slice(run.startIndex, run.endIndex + 1), {
      color: run.color,
      weight: 5,
      opacity: 1,
      trackLayer: true, interactive: false,
    }).addTo(map);
  });
  highlightRunsForFilter(track.points, selectedRouteFilter()).forEach((run) => {
    const highlightedCoordinates = coordinates.slice(run.startIndex, run.endIndex + 1);
    L.polyline(highlightedCoordinates, {
      color: '#ffffff', weight: 11, opacity: 0.94, trackLayer: true, interactive: false,
    }).addTo(map);
    L.polyline(highlightedCoordinates, {
      color: run.color, weight: 7, opacity: 1, trackLayer: true, interactive: false,
    }).addTo(map);
  });
  routeLine = L.polyline(coordinates, { color: '#000000', weight: 14, opacity: 0, trackLayer: true }).addTo(map);
  routeLine.on('mousemove', (event) => {
    if (poiSelection.pinnedIndex === null) setActivePoint(nearestPoint(event.latlng), { showContext: true });
  });
  routeLine.on('mouseout', () => { if (poiSelection.pinnedIndex === null) setPointContext(null); });
  const closedRoute = isClosedRoute(track.points);
  L.marker(coordinates[0], {
    icon: makeEndpointIcon('A', 'start'), trackLayer: true, pane: 'startMarkerPane', interactive: false, zIndexOffset: 1000,
    title: closedRoute ? 'Старт и финиш маршрута' : 'Старт маршрута',
  }).addTo(map);
  if (!closedRoute) {
    L.marker(coordinates.at(-1), {
      icon: makeEndpointIcon('B', 'finish'), trackLayer: true, interactive: false, zIndexOffset: 900, title: 'Финиш маршрута',
    }).addTo(map);
  }
  poiMarkers = (track.pointsOfInterest || []).map((point, index) => {
    const tooltip = document.createElement('span');
    tooltip.textContent = point.name;
    const marker = L.marker([point.lat, point.lon], {
      icon: makePoiIcon(index), trackLayer: true, zIndexOffset: 700, title: point.name,
    }).addTo(map).bindTooltip(tooltip, { direction: 'top', offset: [0, -26] });
    marker.on('mouseover', () => hoverPoi(index));
    marker.on('mouseout', () => leavePoi());
    marker.on('click', () => togglePoi(index));
    return marker;
  });
  renderPoiSelection();
  document.querySelector('#map-note').innerHTML = closedRoute
    ? '<span class="start-dot"></span><b>СТАРТ / ФИНИШ</b>'
    : '<span class="start-dot"></span><b>СТАРТ</b><i class="finish-dot"></i><b>ФИНИШ</b>';
  activeMarker = L.circleMarker(coordinates[0], { radius: 8, color: '#fff', weight: 3, fillColor: '#131712', fillOpacity: 1, trackLayer: true, interactive: false }).addTo(map);
  const terrainRange = selectedTerrainRange();
  if (terrainRange) {
    L.polyline(coordinates.slice(terrainRange.startIndex, terrainRange.endIndex + 1), {
      color: '#12251e', weight: 12, opacity: 0.8, trackLayer: true, interactive: false,
    }).addTo(map);
    L.polyline(coordinates.slice(terrainRange.startIndex, terrainRange.endIndex + 1), {
      color: terrainRange.color, weight: 6, opacity: 1, trackLayer: true, interactive: false,
    }).addTo(map);
  }
  focusLayers[0]?.bringToBack?.();
  focusLayers.slice(1).forEach((layer) => layer.bringToFront?.());
  if (fit) map.fitBounds(routeLine.getBounds(), { padding: [48, 48] });
}

function visibleMetrics() {
  const [startIndex, endIndex] = viewRange;
  const points = currentTrack.points.slice(startIndex, endIndex + 1);
  const elevations = points.map((point) => point.ele).filter(Number.isFinite);
  const rawMin = Math.min(...elevations);
  const rawMax = Math.max(...elevations);
  const padding = Math.max(10, (rawMax - rawMin) * 0.08);
  return { startIndex, endIndex, startKm: points[0].distanceKm, endKm: points.at(-1).distanceKm, min: rawMin - padding, max: rawMax + padding };
}

function chartCoordinates(point) {
  const { min, max, startKm, endKm } = currentViewMetrics ?? visibleMetrics();
  const x = ((point.distanceKm - startKm) / Math.max(endKm - startKm, 0.001)) * 1200;
  const y = 260 - ((point.ele - min) / Math.max(max - min, 1)) * 220;
  return { x, y };
}

function renderProfilePointsOfInterest(track, startKm, endKm) {
  const group = document.querySelector('#profile-pois');
  group.replaceChildren();
  (track.pointsOfInterest || []).forEach((point, index) => {
    const routePoint = track.points[point.routePointIndex];
    if (!routePoint || routePoint.distanceKm < startKm || routePoint.distanceKm > endKm) return;
    const ratio = (routePoint.distanceKm - startKm) / Math.max(endKm - startKm, 0.001);
    const marker = document.createElement('span');
    marker.className = 'profile-poi';
    marker.dataset.profilePoiIndex = String(index);
    marker.style.left = `${ratio * 100}%`;
    marker.title = point.name;
    marker.textContent = String(index + 1);
    group.append(marker);
  });
}

function drawProfile(track) {
  currentViewMetrics = visibleMetrics();
  const { startIndex, endIndex, startKm, endKm, min, max } = currentViewMetrics;
  const { ascentM, descentM } = elevationGainLoss(track.points, startIndex, endIndex);
  document.querySelector('#profile-ascent').textContent = ascentM.toLocaleString('ru-RU');
  document.querySelector('#profile-descent').textContent = descentM.toLocaleString('ru-RU');
  const visiblePoints = track.points.slice(startIndex, endIndex + 1).filter((point) => Number.isFinite(point.ele));
  const coords = visiblePoints.map(chartCoordinates);
  renderProfilePointsOfInterest(track, startKm, endKm);
  const line = coords.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  document.querySelector('#profile-area').setAttribute('d', `${line} L1200,264 L0,264 Z`);
  const profileCoordinates = (run) => {
    const visibleIndices = visibleRangeIndices(run, startIndex, endIndex);
    if (!visibleIndices) return [];
    const [visibleRunStart, visibleRunEnd] = visibleIndices;
    return track.points.slice(visibleRunStart, visibleRunEnd + 1)
      .filter((point) => Number.isFinite(point.ele))
      .map(chartCoordinates);
  };
  const profilePath = (run) => {
    const runPoints = profileCoordinates(run);
    if (runPoints.length < 2) return '';
    return runPoints.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  };
  const profileRuns = profileColorRuns(track.points, profileColorMode);
  const gradientAreaPaths = profileRuns.area.map((run) => {
    const path = areaPathFromCoordinates(profileCoordinates(run), 264);
    return path ? `<path d="${path}" fill="${run.color}"></path>` : '';
  }).join('');
  document.querySelector('#profile-gradient-area').innerHTML = gradientAreaPaths;
  const baseProfilePaths = profileRuns.line.map((run) => {
    const path = profilePath(run);
    return path ? `<path d="${path}" stroke="${run.color}"><title>${run.label}</title></path>` : '';
  }).join('');
  document.querySelector('#gradient-line').innerHTML = baseProfilePaths;
  const focusedRuns = highlightRunsForFilter(track.points, selectedRouteFilter());
  const terrainRange = selectedTerrainRange();
  if (terrainRange) focusedRuns.push(terrainRange);
  const focusVisibility = profileFocusVisibility(profileFocusPlacement);
  document.querySelector('#profile-focus-profile').innerHTML = focusVisibility.profile ? focusedRuns.map((run) => {
    const path = profilePath(run);
    return path ? `<path class="profile-focus-path-outline" d="${path}"></path><path class="profile-focus-path-line" d="${path}" stroke="${run.color}"><title>${run.label}</title></path>` : '';
  }).join('') : '';
  document.querySelector('#grid').innerHTML = [40, 95, 150, 205, 260].map((y) => `<line x1="0" y1="${y}" x2="1200" y2="${y}" />`).join('');
  document.querySelector('#axis').innerHTML = Array.from({ length: 6 }, (_, index) => `<span>${(startKm + (endKm - startKm) * index / 5).toFixed(1)} км</span>`).join('');
  document.querySelector('#min-label').textContent = `${Math.round(min)} м`;
  document.querySelector('#max-label').textContent = `${Math.round(max)} м`;
  document.querySelector('#climb-bands').innerHTML = track.climbs.map((climb) => {
    const from = Math.max(climb.startKm, startKm);
    const to = Math.min(climb.endKm, endKm);
    if (from >= to) return '';
    const x = ((from - startKm) / Math.max(endKm - startKm, 0.001)) * 1200;
    const width = ((to - from) / Math.max(endKm - startKm, 0.001)) * 1200;
    return `<rect class="climb-band" x="${x}" y="18" width="${width}" height="246" fill="${climb.color}"><title>Подъём: ${(climb.lengthM / 1000).toFixed(1)} км, ${climb.averageGrade.toFixed(1)}%</title></rect>`;
  }).join('');
  const ribbonRuns = colorRunsForMode(track.points, profileColorMode);
  const ribbonRect = (run) => {
    const position = profileRangePosition(track.points, run, startKm, endKm);
    if (!position) return '';
    const { x, width } = position;
    return `<rect x="${x}" y="269" width="${Math.max(width, 1)}" height="9" fill="${run.color}"><title>${run.label}</title></rect>`;
  };
  document.querySelector('#surface-ribbon').innerHTML = ribbonRuns.map(ribbonRect).join('');
  const focusRect = (run) => {
    const position = profileRangePosition(track.points, run, startKm, endKm);
    if (!position) return '';
    const { x, width } = position;
    return `<rect class="profile-focus-outline" x="${x}" y="265" width="${Math.max(width, 1)}" height="17" rx="2"></rect><rect class="profile-focus-line" x="${x}" y="268" width="${Math.max(width, 1)}" height="11" rx="1" fill="${run.color}"><title>${run.label}</title></rect>`;
  };
  document.querySelector('#profile-focus-ribbon').innerHTML = focusVisibility.ribbon ? focusedRuns.map(focusRect).join('') : '';
}

function refreshRouteFocus() {
  if (!currentTrack) return;
  drawMap(currentTrack, { fit: false });
  if (currentTrack.hasElevation) drawProfile(currentTrack);
  setActivePoint(activePointIndex);
  const focusedSurface = selectedSurfaceId();
  document.querySelectorAll('[data-surface-filter]').forEach((control) => {
    const emphasis = surfaceEmphasis(control.dataset.surfaceFilter, focusedSurface);
    control.classList.toggle('is-active', emphasis.highlighted);
    control.classList.remove('is-dimmed');
    control.setAttribute('aria-pressed', String(pinnedSurfaceId === control.dataset.surfaceFilter));
  });
  const focusedWayType = selectedWayTypeId();
  document.querySelectorAll('[data-waytype-filter]').forEach((control) => {
    const emphasis = surfaceEmphasis(control.dataset.waytypeFilter, focusedWayType);
    control.classList.toggle('is-active', emphasis.highlighted);
    control.classList.remove('is-dimmed');
    control.setAttribute('aria-pressed', String(pinnedWayTypeId === control.dataset.waytypeFilter));
  });
  const focusedQuality = selectedQualityId();
  document.querySelectorAll('[data-quality-filter]').forEach((control) => {
    const emphasis = surfaceEmphasis(control.dataset.qualityFilter, focusedQuality);
    control.classList.toggle('is-active', emphasis.highlighted);
    control.classList.remove('is-dimmed');
    control.setAttribute('aria-pressed', String(pinnedQualityId === control.dataset.qualityFilter));
  });
  document.querySelectorAll('[data-terrain-range]').forEach((control) => {
    const range = control.dataset.terrainRange;
    control.classList.toggle('is-active', Boolean(selectedTerrainRange() && range === selectedTerrainRange().key));
    control.setAttribute('aria-pressed', String(Boolean(pinnedRange && range === pinnedRange.key)));
  });
  document.querySelector('.surface-section').classList.toggle('has-pinned-surface', Boolean(pinnedSurfaceId || pinnedWayTypeId || pinnedQualityId));
}

function clearRangeFocus() {
  focusLayers.forEach((layer) => map.removeLayer(layer));
  focusLayers = [];
}

function fitMapToRange(range) {
  const points = currentTrack.points.slice(range[0], range[1] + 1);
  const coordinates = points.map((point) => [point.lat, point.lon]);
  clearRangeFocus();
  const outline = L.polyline(coordinates, {
    color: '#151a17', weight: 14, opacity: 0.9, dashArray: '10 8', lineCap: 'butt',
    rangeFocus: true, interactive: false,
  }).addTo(map).bringToBack();
  const boundaryStyle = { radius: 7, color: '#10251d', weight: 3, fillColor: '#f0b83f', fillOpacity: 1, rangeFocus: true, interactive: false };
  focusLayers = [outline, L.circleMarker(coordinates[0], boundaryStyle).addTo(map), L.circleMarker(coordinates.at(-1), boundaryStyle).addTo(map)];
  map.fitBounds(outline.getBounds(), { padding: [72, 72] });
}

function setViewRange(range, { remember = true } = {}) {
  const normalized = [Math.min(...range), Math.max(...range)];
  if (normalized[1] - normalized[0] < 2) return;
  if (remember) zoomHistory.push([...viewRange]);
  viewRange = normalized;
  currentViewMetrics = null;
  drawProfile(currentTrack);
  const isFullRange = viewRange[0] === 0 && viewRange[1] === currentTrack.points.length - 1;
  if (isFullRange) {
    clearRangeFocus();
    map.fitBounds(routeLine.getBounds(), { padding: [48, 48] });
  } else fitMapToRange(viewRange);
  document.querySelector('#zoom-back').disabled = zoomHistory.length === 0;
  document.querySelector('#zoom-reset').disabled = isFullRange;
  setActivePoint(viewRange[0]);
}

function renderClimbs(track) {
  document.querySelector('#climbs-count').textContent = track.climbs.length;
  document.querySelector('#descents-count').textContent = track.descents.length;
  const rows = (items, type) => items.length ? items.map((item, index) => {
    const key = `${type}-${index}`;
    return `<button class="terrain-row" type="button" data-terrain-range="${key}" data-terrain-type="${type}" data-terrain-index="${index}" aria-pressed="false" style="--terrain-color:${item.color}"><b>#${index + 1}</b><i></i><span>${item.label}</span><span>△ ${item.averageGrade.toFixed(1)}%</span><span>${type === 'climb' ? '↗' : '↘'} ${type === 'climb' ? item.gainM : item.dropM} м</span><span>↔ ${(item.lengthM / 1000).toFixed(2)} км</span></button>`;
  }).join('') : '<p class="empty-climbs">Подходящие участки не найдены.</p>';
  document.querySelector('#climbs-list').innerHTML = rows(track.climbs, 'climb');
  document.querySelector('#descents-list').innerHTML = rows(track.descents, 'descent');
}

function renderSurfaces(track) {
  const summary = summarizeSurfaces(track.points);
  const wayTypes = summarizeWayTypes(track.points);
  const quality = summarizeRoadQuality(track.points);
  document.querySelector('#surface-bar').innerHTML = summary.filter((item) => item.percent > 0).map((item) =>
    `<button type="button" data-surface-filter="${item.id}" style="--surface-color:${item.color};flex:${item.percent}" title="${item.label}: ${item.percent.toFixed(1)}%" aria-label="${item.label}: ${item.percent.toFixed(1)}% маршрута" aria-pressed="false"></button>`).join('');
  document.querySelector('#surface-stats').innerHTML = summary.map((item) => `
    <button class="surface-stat distribution-row" type="button" data-surface-filter="${item.id}" aria-pressed="false" ${item.distanceKm === 0 ? 'disabled' : ''}>
      <i style="--surface-color:${item.color}"></i><span>${item.label}</span>
      <strong>${item.distanceKm.toFixed(1)} км</strong><small>${Math.round(item.percent)}%</small></button>`).join('');
  document.querySelector('#way-type-bar').innerHTML = wayTypes.filter((item) => item.percent > 0).map((item) =>
    `<button type="button" data-waytype-filter="${item.id}" style="--surface-color:${item.color};flex:${item.percent}" title="${item.label}: ${item.percent.toFixed(1)}%" aria-label="${item.label}: ${item.percent.toFixed(1)}% маршрута" aria-pressed="false"></button>`).join('');
  document.querySelector('#way-type-stats').innerHTML = wayTypes.map((item) => `
    <button class="distribution-row" type="button" data-waytype-filter="${item.id}" aria-pressed="false" ${item.distanceKm === 0 ? 'disabled' : ''}><i style="--surface-color:${item.color}"></i><span>${item.label}</span><strong>${item.distanceKm.toFixed(1)} км</strong><small>${Math.round(item.percent)}%</small></button>`).join('');
  document.querySelector('#surface-legend').innerHTML = surfaceCategories.map((item) =>
    `<span><i style="--surface-color:${item.color}"></i>${item.label}</span>`).join('');
  document.querySelector('#waytype-legend').innerHTML = wayTypeCategories.map((item) =>
    `<span><i style="--surface-color:${item.color}"></i>${item.label}</span>`).join('');
  document.querySelector('#quality-legend').innerHTML = roadQualityCategories.map((item) =>
    `<span><i style="--surface-color:${item.color}"></i>${item.label}</span>`).join('');
  document.querySelector('#quality-bar').innerHTML = quality.filter((item) => item.percent > 0).map((item) =>
    `<button type="button" data-quality-filter="${item.id}" style="--surface-color:${item.color};flex:${item.percent}" title="${item.label}: ${item.percent.toFixed(1)}%" aria-label="${item.label}: ${item.percent.toFixed(1)}% маршрута" aria-pressed="false"></button>`).join('');
  document.querySelector('#quality-stats').innerHTML = quality.map((item) => `
    <button class="distribution-row" type="button" data-quality-filter="${item.id}" aria-pressed="false" ${item.distanceKm === 0 ? 'disabled' : ''}><i style="--surface-color:${item.color}"></i><span>${item.label}</span><strong>${item.distanceKm.toFixed(1)} км</strong><small>${Math.round(item.percent)}%</small></button>`).join('');
  refreshRouteFocus();
}

function setColorMode(scope, mode) {
  if (scope === 'map') mapColorMode = mode;
  else profileColorMode = mode;
  document.querySelectorAll(`[data-color-scope="${scope}"]`).forEach((button) => {
    const active = button.dataset.colorMode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (scope === 'profile') {
    document.querySelector('#gradient-legend').hidden = mode !== 'gradient';
    document.querySelector('#surface-legend').hidden = mode !== 'surface';
    document.querySelector('#waytype-legend').hidden = mode !== 'waytype';
    document.querySelector('#quality-legend').hidden = mode !== 'quality';
  }
  if (!currentTrack) return;
  if (scope === 'map') drawMap(currentTrack, { fit: false });
  if (scope === 'profile' && currentTrack.hasElevation) drawProfile(currentTrack);
  setActivePoint(activePointIndex);
}

function setProfileFocusPlacement(placement) {
  profileFocusPlacement = placement;
  document.querySelectorAll('[data-profile-focus-placement]').forEach((button) => {
    const active = button.dataset.profileFocusPlacement === placement;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (currentTrack?.hasElevation) drawProfile(currentTrack);
}

async function enrichTrackSurfaces(track, runId) {
  const refresh = (sources) => {
    renderSurfaces(track);
    renderSourceInfo(sources);
    drawMap(track);
    if (track.hasElevation) drawProfile(track);
    setActivePoint(activePointIndex);
  };
  if (track.points.some((point) => point.surfaceTags)) {
    track.points = track.points.map((point) => ({ ...point, surface: classifySurface(point.surfaceTags) }));
    refresh({ gpx: 'SUCCESS', valhalla: 'SUCCESS', openStreetMap: 'SUCCESS' });
    return;
  }
  const valhallaController = new AbortController();
  const valhallaTimeout = setTimeout(() => valhallaController.abort(), 35_000);
  try {
    const matches = await fetchValhallaMatches(track.points, { signal: valhallaController.signal });
    if (runId !== enrichmentRun) return;
    track.points = applyValhallaMatches(track.points, matches);
    refresh({ gpx: 'SUCCESS', valhalla: 'SUCCESS', openStreetMap: 'FAILED' });
    return;
  } catch {
    if (runId !== enrichmentRun) return;
  } finally { clearTimeout(valhallaTimeout); }

  renderSurfaces(track);
  renderSourceInfo({ gpx: 'SUCCESS', valhalla: 'FAILED', openStreetMap: 'FAILED' });
}

function renderSourceInfo(sources = {}) {
  const symbols = { SUCCESS: '✓', FAILED: '×', PENDING: '…' };
  const labels = { SUCCESS: 'доступен', FAILED: 'недоступен', PENDING: 'обрабатывается' };
  document.querySelectorAll('[data-analysis-source]').forEach((row) => {
    const status = sources[row.dataset.analysisSource] || 'PENDING';
    row.dataset.sourceStatus = status;
    row.querySelector('.source-state').textContent = symbols[status];
    row.querySelector('.source-state').setAttribute('aria-label', labels[status]);
  });
}

function setPointContext(point) {
  const currentIds = point ? {
    surface: point.surface.id,
    waytype: classifyWayType(point.surface.highway).id,
    quality: point.surface.quality.id,
  } : null;
  document.querySelectorAll('[data-surface-filter],[data-waytype-filter],[data-quality-filter]').forEach((control) => {
    const matchesPoint = currentIds && (control.dataset.surfaceFilter === currentIds.surface
      || control.dataset.waytypeFilter === currentIds.waytype
      || control.dataset.qualityFilter === currentIds.quality);
    control.classList.toggle('is-current', Boolean(matchesPoint));
  });
}

function setActivePoint(index, { showContext = false } = {}) {
  if (!currentTrack) return;
  activePointIndex = Math.max(0, Math.min(index, currentTrack.points.length - 1));
  const point = currentTrack.points[activePointIndex];
  const chart = chartCoordinates(point);
  activeMarker?.setLatLng([point.lat, point.lon]);
  document.querySelector('#profile-cursor').setAttribute('x1', chart.x);
  document.querySelector('#profile-cursor').setAttribute('x2', chart.x);
  document.querySelector('#profile-dot').setAttribute('cx', chart.x);
  document.querySelector('#profile-dot').setAttribute('cy', chart.y);
  const grade = Number.isFinite(point.grade) ? `${point.grade >= 0 ? '+' : ''}${point.grade.toFixed(1)}%` : '—';
  const surfaceLabel = `${point.surface.label}${point.surface.inferred ? ' (оценка)' : ''}`;
  document.querySelector('#hover-readout').innerHTML = `<b>${point.distanceKm.toFixed(1)} км · ${Math.round(point.ele)} м · ${grade}</b><span>${surfaceLabel} · ${roadTypeLabel(point.surface.highway)} · качество: ${point.surface.quality.label.toLowerCase()}</span><small>${Math.round((point.distanceKm / currentTrack.distanceKm) * 100)}% маршрута</small>`;
  const slider = document.querySelector('#profile-wrap');
  slider.setAttribute('aria-valuenow', Math.round((point.distanceKm / currentTrack.distanceKm) * 100));
  slider.setAttribute('aria-valuetext', `${point.distanceKm.toFixed(1)} км, высота ${Math.round(point.ele)} м`);
  setPointContext(showContext ? point : null);
}

function renderTrack(rawTrack, { persisted = false, analysisSources } = {}) {
  enrichmentRun += 1;
  clearRangeFocus();
  hoveredSurfaceId = null;
  pinnedSurfaceId = null;
  hoveredWayTypeId = null;
  pinnedWayTypeId = null;
  hoveredQualityId = null;
  pinnedQualityId = null;
  hoveredRange = null;
  pinnedRange = null;
  currentTrack = persisted ? rawTrack : analyzeTrack(rawTrack);
  poiSelection = { ...emptyPoiSelection };
  const grades = calculateSegmentGrades(currentTrack.points);
  currentTrack.points = currentTrack.points.map((point, index) => ({
    ...point,
    grade: Number.isFinite(point.grade) ? point.grade : grades[index],
    surface: point.surface || classifySurface(point.surfaceTags),
  }));
  currentTrack.pointsOfInterest = (currentTrack.pointsOfInterest || []).map((point) => ({
    ...point,
    routePointIndex: nearestRoutePointIndex(currentTrack.points, point),
  }));
  currentTrack.climbs ??= detectClimbs(currentTrack.points);
  currentTrack.descents ??= detectDescents(currentTrack.points);
  viewRange = [0, currentTrack.points.length - 1];
  zoomHistory = [];
  currentViewMetrics = null;
  document.querySelector('#track-name').textContent = currentTrack.name;
  document.querySelector('#compact-track-name').textContent = currentTrack.name;
  document.querySelector('#distance').textContent = currentTrack.distanceKm.toFixed(1);
  document.querySelector('#compact-distance').textContent = currentTrack.distanceKm.toFixed(1);
  document.querySelector('#ascent').textContent = currentTrack.hasElevation ? currentTrack.ascentM.toLocaleString('ru-RU') : '—';
  document.querySelector('#compact-ascent').textContent = currentTrack.hasElevation ? currentTrack.ascentM.toLocaleString('ru-RU') : '—';
  document.querySelector('#descent').textContent = currentTrack.hasElevation ? currentTrack.descentM.toLocaleString('ru-RU') : '—';
  document.querySelector('#compact-descent').textContent = currentTrack.hasElevation ? currentTrack.descentM.toLocaleString('ru-RU') : '—';
  const [duration, unit] = formatDuration(currentTrack.estimatedDurationMs || currentTrack.movingTimeMs);
  document.querySelector('#duration').textContent = duration;
  document.querySelector('#duration-unit').textContent = unit;
  document.querySelector('#compact-duration').textContent = duration;
  document.querySelector('#compact-duration-unit').textContent = unit;
  document.querySelector('#profile-ascent').textContent = currentTrack.ascentM.toLocaleString('ru-RU');
  document.querySelector('#profile-descent').textContent = currentTrack.descentM.toLocaleString('ru-RU');
  const speedBadge = document.querySelector('#average-speed-badge');
  const speed = currentTrack.effectiveSpeedKmh || currentTrack.movingAverageSpeedKmh;
  speedBadge.textContent = speed
    ? `${speed.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} км/ч` : '— км/ч';
  document.querySelector('#compact-speed').textContent = speed
    ? `${speed.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} км/ч` : '— км/ч';
  speedBadge.title = currentTrack.movingAverageSpeedKmh
    ? `Средняя скорость движения по данным GPX: ${speed.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км/ч`
    : speed ? `Расчётная скорость: ${speed.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км/ч`
      : 'В GPX недостаточно данных для расчёта скорости';
  drawMap(currentTrack);
  renderPointsOfInterest(currentTrack.pointsOfInterest);
  if (currentTrack.hasElevation) drawProfile(currentTrack);
  renderClimbs(currentTrack);
  renderSurfaces(currentTrack);
  renderSourceInfo(analysisSources || (persisted
    ? { gpx: 'SUCCESS', valhalla: 'PENDING', openStreetMap: 'PENDING' }
    : { gpx: 'SUCCESS', valhalla: 'PENDING', openStreetMap: 'PENDING' }));
  document.querySelector('#zoom-back').disabled = true;
  document.querySelector('#zoom-reset').disabled = true;
  setActivePoint(0);
  if (!persisted) enrichTrackSurfaces(currentTrack, enrichmentRun);
}

function renderUnavailableTrack(track) {
  document.querySelector('#track-name').textContent = track.title;
  document.querySelector('#compact-track-name').textContent = track.title;
  document.querySelector('#route-state-note').textContent = track.analysisNote;
  document.querySelector('#route-state-note').hidden = false;
  document.querySelector('.route-metrics').hidden = true;
  document.querySelector('.route-workspace').hidden = true;
}

async function loadPublicTrack(trackId) {
  publicTrackId = trackId;
  publicTrackData = null;
  publicTrackOwnershipVerified = false;
  const response = await fetch(`/api/tracks/${trackId}`, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    renderUnavailableTrack({ title: 'Трек не найден', analysisNote: 'Проверьте публичную ссылку.' });
    return;
  }
  const { data } = await response.json();
  publicTrackData = data;
  renderTrackAttribution();
  const download = document.querySelector('#download-track');
  download.href = data.downloadUrl;
  download.hidden = false;
  if (!data.analysis) {
    renderUnavailableTrack(data);
    return;
  }
  data.analysis.name = data.title;
  renderTrack(data.analysis, { persisted: true, analysisSources: data.analysisSources });
}

const processingOrder = ['UPLOADING', 'QUEUED', 'PARSING', 'ENRICHING', 'COMPLETE'];

function updateProcessing(step) {
  const activeIndex = processingOrder.indexOf(step);
  document.querySelectorAll('[data-processing-step]').forEach((item) => {
    const index = processingOrder.indexOf(item.dataset.processingStep);
    item.classList.toggle('is-complete', activeIndex >= 0 && index < activeIndex);
    item.classList.toggle('is-active', item.dataset.processingStep === step);
  });
}

function showProcessingError(error) {
  const failedStep = error.code === 'INVALID_GPX' ? 'PARSING' : error.code === 'ENRICHMENT_UNAVAILABLE' ? 'ENRICHING' : 'UPLOADING';
  updateProcessing(failedStep);
  const message = document.querySelector('#processing-error');
  message.textContent = error.message;
  message.hidden = false;
  const details = document.querySelector('#processing-details');
  details.hidden = false;
  document.querySelector('#processing-code').textContent = error.code;
  document.querySelector('#retry-processing').hidden = error.code !== 'ENRICHMENT_UNAVAILABLE';
}

function showTrackCreated(trackId) {
  const toast = document.querySelector('#toast');
  toast.replaceChildren('Трек успешно создан. ');
  const link = document.createElement('a');
  link.href = `/tracks/${trackId}`;
  link.textContent = 'Открыть трек';
  toast.append(link);
  toast.classList.add('visible');
  setTimeout(() => window.location.assign(`/tracks/${trackId}`), 900);
}

async function pollTrackStatus(trackId) {
  while (activeUploadTrackId === trackId) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    const response = await fetch(`/api/tracks/${trackId}/status`, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('Не удалось получить статус обработки.');
    const { data } = await response.json();
    updateProcessing(data.step);
    if (data.status === 'READY') {
      activeUploadTrackId = null;
      updateProcessing('COMPLETE');
      showTrackCreated(trackId);
      return;
    }
    if (data.status === 'FAILED') {
      activeUploadTrackId = trackId;
      showProcessingError(data.error);
      return;
    }
  }
}

async function uploadFile(file) {
  if (!currentUser) return;
  const processing = document.querySelector('#processing-overlay');
  const error = document.querySelector('#processing-error');
  const details = document.querySelector('#processing-details');
  error.hidden = true;
  details.hidden = true;
  document.querySelector('#retry-processing').hidden = true;
  processing.hidden = false;
  updateProcessing('UPLOADING');
  try {
    const response = await fetch('/api/tracks', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/gpx+xml',
        'x-gpx-filename': encodeURIComponent(file.name),
      },
      body: file,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || 'Не удалось загрузить GPX-файл.');
    activeUploadTrackId = payload.data.id;
    updateProcessing(payload.data.step);
    await pollTrackStatus(activeUploadTrackId);
  } catch (uploadError) {
    showProcessingError({ message: uploadError.message, code: 'UPLOAD_FAILED' });
  }
}

async function replaceTrackFile(file) {
  if (!currentUser || !publicTrackId) return;
  const processing = document.querySelector('#processing-overlay');
  document.querySelector('#processing-error').hidden = true;
  document.querySelector('#processing-details').hidden = true;
  processing.hidden = false;
  updateProcessing('UPLOADING');
  try {
    const response = await fetch(`/api/tracks/${publicTrackId}/file`, {
      method: 'PUT',
      headers: { accept: 'application/json', 'content-type': 'application/gpx+xml', 'x-gpx-filename': encodeURIComponent(file.name) },
      body: file,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || 'Не удалось заменить GPX-файл.');
    activeUploadTrackId = publicTrackId;
    updateProcessing(payload.data.step);
    await pollTrackStatus(publicTrackId);
  } catch (replaceError) {
    showProcessingError({ message: replaceError.message, code: 'REPLACEMENT_FAILED' });
  }
}

const profile = document.querySelector('#profile-wrap');
profile.addEventListener('pointermove', (event) => {
  const poiMarker = event.target.closest('[data-profile-poi-index]');
  if (poiMarker) {
    hoverPoi(Number(poiMarker.dataset.profilePoiIndex));
    return;
  }
  if (poiSelection.hoveredIndex !== null && poiSelection.pinnedIndex === null) leavePoi();
  if (poiSelection.pinnedIndex !== null) return;
  const rect = profile.getBoundingClientRect();
  const ratio = pointerRatioInPlot(event.clientX, rect.left, rect.width);
  const index = pointIndexAtRatio(currentTrack.points, viewRange[0], viewRange[1], ratio);
  if (selectionStart) {
    const startX = Math.max(0, Math.min(1200, selectionStart.x));
    const currentX = ratio * 1200;
    const selection = document.querySelector('#profile-selection');
    selection.setAttribute('x', Math.min(startX, currentX));
    selection.setAttribute('width', Math.abs(currentX - startX));
    selection.classList.add('visible');
  } else {
    setActivePoint(index, { showContext: true });
  }
});
profile.addEventListener('pointerleave', () => {
  leavePoi();
  if (!selectionStart && poiSelection.pinnedIndex === null) setPointContext(null);
});
profile.addEventListener('click', (event) => {
  const marker = event.target.closest('[data-profile-poi-index]');
  if (marker) togglePoi(Number(marker.dataset.profilePoiIndex));
});
profile.addEventListener('pointerdown', (event) => {
  if (event.target.closest('[data-profile-poi-index]')) return;
  if (poiSelection.pinnedIndex !== null) return;
  if (event.button !== 0) return;
  const rect = profile.getBoundingClientRect();
  const ratio = pointerRatioInPlot(event.clientX, rect.left, rect.width);
  selectionStart = { ratio, x: ratio * 1200, pointerId: event.pointerId };
  profile.setPointerCapture?.(event.pointerId);
});
profile.addEventListener('pointerup', (event) => {
  if (!selectionStart) return;
  const rect = profile.getBoundingClientRect();
  const endRatio = pointerRatioInPlot(event.clientX, rect.left, rect.width);
  const startRatio = selectionStart.ratio;
  selectionStart = null;
  document.querySelector('#profile-selection').classList.remove('visible');
  if (Math.abs(endRatio - startRatio) < 0.025) {
    setActivePoint(pointIndexAtRatio(currentTrack.points, viewRange[0], viewRange[1], endRatio));
    return;
  }
  const from = pointIndexAtRatio(currentTrack.points, viewRange[0], viewRange[1], Math.min(startRatio, endRatio));
  const to = pointIndexAtRatio(currentTrack.points, viewRange[0], viewRange[1], Math.max(startRatio, endRatio));
  setViewRange([from, to]);
});
profile.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  if (poiSelection.pinnedIndex !== null) return;
  event.preventDefault();
  setActivePoint(activePointIndex + (event.key === 'ArrowRight' ? 1 : -1));
});
document.querySelector('#zoom-back').addEventListener('click', () => {
  const previous = zoomHistory.pop();
  if (previous) setViewRange(previous, { remember: false });
});
document.querySelector('#zoom-reset').addEventListener('click', () => {
  zoomHistory = [];
  setViewRange([0, currentTrack.points.length - 1], { remember: false });
});
document.querySelectorAll('[data-color-mode]').forEach((button) => button.addEventListener('click', () => setColorMode(button.dataset.colorScope, button.dataset.colorMode)));
document.querySelectorAll('[data-profile-focus-placement]').forEach((button) => button.addEventListener('click', () => setProfileFocusPlacement(button.dataset.profileFocusPlacement)));
const profileSettings = document.querySelector('.profile-overlay-settings');
const profileSettingsTrigger = document.querySelector('#profile-settings-trigger');
const profileSettingsPopover = document.querySelector('#profile-settings-popover');
function setProfileSettingsOpen(open) {
  profileSettingsPopover.hidden = !open;
  profileSettingsTrigger.setAttribute('aria-expanded', String(open));
}
profileSettingsTrigger.addEventListener('click', () => setProfileSettingsOpen(profileSettingsPopover.hidden));
document.addEventListener('pointerdown', (event) => {
  if (!profileSettingsPopover.hidden && !profileSettings.contains(event.target)) setProfileSettingsOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || profileSettingsPopover.hidden) return;
  setProfileSettingsOpen(false);
  profileSettingsTrigger.focus();
});
const surfaceSection = document.querySelector('.surface-section');
surfaceSection.addEventListener('pointerover', (event) => {
  const control = event.target.closest('[data-surface-filter]:not(:disabled),[data-waytype-filter]:not(:disabled),[data-quality-filter]:not(:disabled)');
  if (!control || pinnedSurfaceId || pinnedWayTypeId || pinnedQualityId || pinnedRange) return;
  hoveredSurfaceId = control.dataset.surfaceFilter || null;
  hoveredWayTypeId = control.dataset.waytypeFilter || null;
  hoveredQualityId = control.dataset.qualityFilter || null;
  refreshRouteFocus();
});
surfaceSection.addEventListener('pointerout', (event) => {
  if (pinnedSurfaceId || pinnedWayTypeId || pinnedQualityId) return;
  const from = event.target.closest('[data-surface-filter]:not(:disabled),[data-waytype-filter]:not(:disabled),[data-quality-filter]:not(:disabled)');
  const to = event.relatedTarget?.closest?.('[data-surface-filter]:not(:disabled),[data-waytype-filter]:not(:disabled),[data-quality-filter]:not(:disabled)');
  if (!from || from === to) return;
  hoveredSurfaceId = null;
  hoveredWayTypeId = null;
  hoveredQualityId = null;
  refreshRouteFocus();
});
surfaceSection.addEventListener('pointerleave', () => {
  if (pinnedSurfaceId || pinnedWayTypeId || pinnedQualityId || (!hoveredSurfaceId && !hoveredWayTypeId && !hoveredQualityId)) return;
  hoveredSurfaceId = null;
  hoveredWayTypeId = null;
  hoveredQualityId = null;
  refreshRouteFocus();
});
surfaceSection.addEventListener('focusin', (event) => {
  const control = event.target.closest('[data-surface-filter]:not(:disabled),[data-waytype-filter]:not(:disabled),[data-quality-filter]:not(:disabled)');
  if (!control || pinnedSurfaceId || pinnedWayTypeId || pinnedQualityId) return;
  hoveredSurfaceId = control.dataset.surfaceFilter || null;
  hoveredWayTypeId = control.dataset.waytypeFilter || null;
  hoveredQualityId = control.dataset.qualityFilter || null;
  refreshRouteFocus();
});
surfaceSection.addEventListener('focusout', (event) => {
  if (pinnedSurfaceId || pinnedWayTypeId || pinnedQualityId || event.relatedTarget?.closest?.('[data-surface-filter],[data-waytype-filter],[data-quality-filter]')) return;
  hoveredSurfaceId = null;
  hoveredWayTypeId = null;
  hoveredQualityId = null;
  refreshRouteFocus();
});
surfaceSection.addEventListener('click', (event) => {
  const control = event.target.closest('[data-surface-filter]:not(:disabled),[data-waytype-filter]:not(:disabled),[data-quality-filter]:not(:disabled)');
  if (!control) return;
  const nextSurface = control.dataset.surfaceFilter || null;
  const nextWayType = control.dataset.waytypeFilter || null;
  const nextQuality = control.dataset.qualityFilter || null;
  const isSame = pinnedSurfaceId === nextSurface && pinnedWayTypeId === nextWayType && pinnedQualityId === nextQuality;
  pinnedSurfaceId = isSame ? null : nextSurface;
  pinnedWayTypeId = isSame ? null : nextWayType;
  pinnedQualityId = isSame ? null : nextQuality;
  pinnedRange = null;
  hoveredSurfaceId = null;
  hoveredWayTypeId = null;
  hoveredQualityId = null;
  refreshRouteFocus();
});
const terrainSection = document.querySelector('.climbs-section');
function terrainItem(control) {
  const items = control.dataset.terrainType === 'climb' ? currentTrack.climbs : currentTrack.descents;
  const item = items[Number(control.dataset.terrainIndex)];
  return item ? { ...item, key: control.dataset.terrainRange } : null;
}
terrainSection.addEventListener('pointerover', (event) => {
  const control = event.target.closest('[data-terrain-range]');
  if (!control || pinnedRange || pinnedSurfaceId || pinnedWayTypeId || pinnedQualityId) return;
  hoveredRange = terrainItem(control);
  refreshRouteFocus();
});
terrainSection.addEventListener('pointerout', (event) => {
  const control = event.target.closest('[data-terrain-range]');
  if (!control || pinnedRange || event.relatedTarget?.closest?.('[data-terrain-range]') === control) return;
  hoveredRange = null;
  refreshRouteFocus();
});
terrainSection.addEventListener('focusin', (event) => {
  const control = event.target.closest('[data-terrain-range]');
  if (!control || pinnedRange || pinnedSurfaceId || pinnedWayTypeId || pinnedQualityId) return;
  hoveredRange = terrainItem(control);
  refreshRouteFocus();
});
terrainSection.addEventListener('focusout', (event) => {
  if (pinnedRange || event.relatedTarget?.closest?.('[data-terrain-range]')) return;
  hoveredRange = null;
  refreshRouteFocus();
});
terrainSection.addEventListener('click', (event) => {
  const control = event.target.closest('[data-terrain-range]');
  if (!control) return;
  const nextRange = terrainItem(control);
  pinnedRange = pinnedRange?.key === nextRange?.key ? null : nextRange;
  hoveredRange = null;
  pinnedSurfaceId = null;
  pinnedWayTypeId = null;
  pinnedQualityId = null;
  refreshRouteFocus();
});
document.querySelectorAll('[data-terrain-tab]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-terrain-tab]').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelector('#climbs-list').hidden = button.dataset.terrainTab !== 'climbs';
  document.querySelector('#descents-list').hidden = button.dataset.terrainTab !== 'descents';
}));

const poiSection = document.querySelector('.poi-section');
poiSection.addEventListener('pointerover', (event) => {
  const row = event.target.closest('[data-poi-index]');
  if (row) hoverPoi(Number(row.dataset.poiIndex));
});
poiSection.addEventListener('pointerout', (event) => {
  const row = event.target.closest('[data-poi-index]');
  if (row && !row.contains(event.relatedTarget)) leavePoi();
});
poiSection.addEventListener('focusin', (event) => {
  const row = event.target.closest('[data-poi-index]');
  if (row) hoverPoi(Number(row.dataset.poiIndex));
});
poiSection.addEventListener('focusout', (event) => {
  if (!event.relatedTarget?.closest?.('[data-poi-index]')) leavePoi();
});
poiSection.addEventListener('click', (event) => {
  const row = event.target.closest('[data-poi-index]');
  if (row) togglePoi(Number(row.dataset.poiIndex));
});

const topbar = document.querySelector('.topbar');
const compactRouteHeader = document.querySelector('.compact-route-header');
let routeHeaderFrame;
function refreshStickyRouteHeader() {
  routeHeaderFrame = null;
  const visible = shouldShowCompactRouteHeader({
    routeHeaderBottom: document.querySelector('.route-header').getBoundingClientRect().bottom,
    topbarHeight: topbar.getBoundingClientRect().height,
    routePageHidden: document.querySelector('#route').hidden,
  });
  topbar.classList.toggle('has-compact-route', visible);
  compactRouteHeader.setAttribute('aria-hidden', String(!visible));
}
function scheduleStickyRouteHeaderRefresh() {
  if (!routeHeaderFrame) routeHeaderFrame = window.requestAnimationFrame(refreshStickyRouteHeader);
}
window.addEventListener('scroll', scheduleStickyRouteHeaderRefresh, { passive: true });
window.addEventListener('resize', scheduleStickyRouteHeaderRefresh);
refreshStickyRouteHeader();

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeUserMenu();
  if (event.key !== 'Escape' || (!pinnedSurfaceId && !pinnedWayTypeId && !pinnedQualityId && !pinnedRange)) return;
  pinnedSurfaceId = null;
  pinnedWayTypeId = null;
  pinnedQualityId = null;
  pinnedRange = null;
  hoveredSurfaceId = null;
  hoveredWayTypeId = null;
  hoveredQualityId = null;
  hoveredRange = null;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  refreshRouteFocus();
});
document.querySelector('#gpx-file').addEventListener('change', (event) => {
  if (event.target.files[0]) uploadFile(event.target.files[0]);
  event.target.value = '';
});
const overlay = document.querySelector('#drop-overlay');
window.addEventListener('dragover', (event) => { event.preventDefault(); if (currentUser) overlay.classList.add('visible'); });
window.addEventListener('dragleave', (event) => { if (!event.relatedTarget) overlay.classList.remove('visible'); });
window.addEventListener('drop', (event) => {
  event.preventDefault();
  overlay.classList.remove('visible');
  if (currentUser && event.dataTransfer.files[0]) uploadFile(event.dataTransfer.files[0]);
});
document.querySelector('#close-processing').addEventListener('click', () => {
  activeUploadTrackId = null;
  document.querySelector('#processing-overlay').hidden = true;
});
document.querySelector('#retry-processing').addEventListener('click', async () => {
  if (!activeUploadTrackId) return;
  const response = await fetch(`/api/tracks/${activeUploadTrackId}/retry-analysis`, { method: 'POST', headers: { accept: 'application/json' } });
  const payload = await response.json();
  if (!response.ok) {
    showProcessingError({ message: payload?.error?.message || 'Не удалось повторить анализ.', code: payload?.error?.code || 'RETRY_FAILED' });
    return;
  }
  document.querySelector('#processing-error').hidden = true;
  document.querySelector('#processing-details').hidden = true;
  document.querySelector('#retry-processing').hidden = true;
  updateProcessing(payload.data.step);
  await pollTrackStatus(activeUploadTrackId);
});

document.querySelector('#track-search').addEventListener('submit', (event) => {
  event.preventDefault();
  const query = document.querySelector('#track-query').value.trim();
  const nextUrl = query ? `/my-tracks?query=${encodeURIComponent(query)}` : '/my-tracks';
  window.history.replaceState(null, '', nextUrl);
  loadMyTracks({ reset: true });
});
const trackQueryInput = document.querySelector('#track-query');
const trackSearchClear = document.querySelector('#track-search-clear');
trackQueryInput.addEventListener('input', () => { trackSearchClear.hidden = !trackQueryInput.value; });
trackSearchClear.addEventListener('click', () => {
  cancelTrackSearch({ input: trackQueryInput, history: window.history, reload: loadMyTracks });
  trackSearchClear.hidden = true;
  trackQueryInput.focus();
});
document.querySelector('#load-more-tracks').addEventListener('click', () => loadMyTracks());
document.querySelector('#edit-track').addEventListener('click', () => document.querySelector('#edit-track-dialog').showModal());
document.querySelector('#cancel-track-edit').addEventListener('click', () => document.querySelector('#edit-track-dialog').close());
document.querySelector('#edit-track-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = document.querySelector('#edit-track-error');
  error.hidden = true;
  const response = await fetch(`/api/tracks/${publicTrackId}`, {
    method: 'PATCH',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ title: document.querySelector('#edit-track-title').value, speedKmh: Number(document.querySelector('#edit-track-speed').value) }),
  });
  const payload = await response.json();
  if (!response.ok) {
    error.textContent = payload?.error?.message || 'Не удалось сохранить изменения.';
    error.hidden = false;
    return;
  }
  document.querySelector('#edit-track-dialog').close();
  payload.data.analysis.name = payload.data.title;
  renderTrack(payload.data.analysis, { persisted: true, analysisSources: payload.data.analysisSources });
});
document.querySelector('#replacement-gpx').addEventListener('change', (event) => {
  if (event.target.files[0]) {
    document.querySelector('#edit-track-dialog').close();
    replaceTrackFile(event.target.files[0]);
  }
  event.target.value = '';
});
document.querySelector('.source-popover').addEventListener('click', async (event) => {
  if (!event.target.closest('.source-retry')) return;
  const response = await fetch(`/api/tracks/${publicTrackId}/retry-analysis`, { method: 'POST', headers: { accept: 'application/json' } });
  const payload = await response.json();
  if (!response.ok) return;
  activeUploadTrackId = publicTrackId;
  document.querySelector('#processing-overlay').hidden = false;
  updateProcessing(payload.data.step);
  await pollTrackStatus(publicTrackId);
});
document.querySelector('#delete-track').addEventListener('click', async () => {
  if (!window.confirm('Удалить этот трек и исходный GPX без возможности восстановления?')) return;
  const response = await fetch(`/api/tracks/${publicTrackId}`, { method: 'DELETE', headers: { accept: 'application/json' } });
  if (response.ok) window.location.assign('/my-tracks');
});

if (isMyTracksPage) {
  trackQueryInput.value = new URLSearchParams(window.location.search).get('query') || '';
  trackSearchClear.hidden = !trackQueryInput.value;
}
if (!isMyTracksPage) {
  initMap();
  setColorMode('map', mapColorMode);
  setColorMode('profile', profileColorMode);
}
restoreSession();
const publicTrackMatch = window.location.pathname.match(/^\/tracks\/([a-f\d]{24})$/i);
if (publicTrackMatch) loadPublicTrack(publicTrackMatch[1]);
else if (!isMyTracksPage) renderTrack(createDemoTrack());
