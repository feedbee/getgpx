import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { renderAuthControl } from './auth-ui.js';
import { analyzeTrack, parseGpx } from './domain/gpx.js';
import { createDemoTrack } from './domain/demo.js';
import { detectClimbs, detectDescents } from './domain/climbs.js';
import { calculateSegmentGrades, gradientColor, groupGradientRuns } from './domain/gradient.js';
import { elevationGainLoss, pointIndexAtRatio, pointerRatioInPlot } from './domain/profile-math.js';
import { isClosedRoute } from './domain/route-shape.js';
import { applyValhallaMatches, classifySurface, classifyWayType, fetchValhallaMatches, groupQualityRuns, groupSurfaceRuns, groupWayTypeRuns, roadTypeLabel, summarizeRoadQuality, summarizeSurfaces, summarizeWayTypes, surfaceCategories, surfaceEmphasis, wayTypeCategories } from './domain/surface.js';

const app = document.querySelector('#app');
let map;
let routeLine;
let activeMarker;
let focusLayers = [];
let currentTrack;
let activePointIndex = 0;
let viewRange = [0, 1];
let zoomHistory = [];
let selectionStart = null;
let currentViewMetrics = null;
let mapColorMode = 'gradient';
let profileColorMode = 'gradient';
let enrichmentRun = 0;
let hoveredSurfaceId = null;
let pinnedSurfaceId = null;
let hoveredWayTypeId = null;
let pinnedWayTypeId = null;
let hoveredQualityId = null;
let pinnedQualityId = null;
let hoveredRange = null;
let pinnedRange = null;

app.innerHTML = `
  <header class="topbar">
    <div class="topbar-inner"><a class="brand" href="#" aria-label="Trace, главная"><span class="brand-mark">T</span><span>TRACE</span></a>
    <div class="topbar-actions"><label class="upload-button" for="gpx-file"><span aria-hidden="true">↗</span> Загрузить GPX</label><div id="auth-control">${renderAuthControl(null)}</div></div></div>
    <input id="gpx-file" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden />
  </header>
  <main class="page" id="route">
    <header class="route-header">
      <p class="route-kicker">GPX ROUTE ANALYSIS</p>
      <h1 id="track-name">Загрузка маршрута…</h1>
      <div class="route-metrics" aria-label="Показатели маршрута">
        <span aria-label="Расстояние маршрута"><span aria-hidden="true">↔</span> <b id="distance">—</b> км</span>
        <span aria-label="Набор высоты"><span aria-hidden="true">↗</span> <b id="ascent">—</b> м <small>набор</small></span>
        <span aria-label="Спуск по высоте"><span aria-hidden="true">↘</span> <b id="descent">—</b> м <small>спуск</small></span>
        <span class="moving-metric">◷ <b id="duration">—</b> <i id="duration-unit"></i> <small>при скорости</small> <abbr id="average-speed-badge" title="Средняя скорость движения по данным GPX">— км/ч</abbr></span>
      </div>
      <div class="route-actions"><button type="button">♡ Сохранить</button><button type="button">↗ Поделиться</button><label for="gpx-file">Заменить GPX</label></div>
    </header>
    <div class="route-workspace">
      <div class="route-content">
        <nav class="section-nav" aria-label="Разделы маршрута">
          <a href="#way-types">Информация о трассе</a><a href="#details">Профиль высот</a><a href="#climbs">Подъёмы и спуски</a>
        </nav>
        <section class="content-section surface-section" id="way-types" aria-labelledby="surface-title">
          <div class="compact-heading"><h2 id="surface-title">Информация о трассе</h2><p id="surface-status" role="status">Определяем типы дорог…</p></div>
          <div class="analysis-card">
            <section class="distribution-group"><h3>Типы дорог</h3><div class="distribution-bar" id="way-type-bar" aria-label="Распределение типов дорог"></div><div class="distribution-list" id="way-type-stats"></div></section>
            <section class="distribution-group"><h3>Покрытия</h3><div class="distribution-bar surface-bar" id="surface-bar" aria-label="Распределение покрытия"></div><div class="distribution-list surface-stats" id="surface-stats"></div></section>
            <section class="distribution-group quality-compact"><h3>Качество проезда</h3><div class="distribution-bar" id="quality-bar" aria-label="Распределение качества проезда"></div><div class="distribution-list quality-stats" id="quality-stats"></div></section>
          </div>
          <p class="surface-note">Материалы — из OpenStreetMap; отсутствующий surface оценивается по Valhalla.</p>
        </section>
        <section class="content-section profile-section" id="details">
          <div class="compact-heading"><h2>Профиль высот</h2></div>
          <div class="analysis-card profile-card">
            <div class="profile-toolbar"><div class="profile-mode segmented-control" aria-label="Цвет профиля"><button class="active" type="button" data-color-scope="profile" data-color-mode="gradient">Градиент</button><button type="button" data-color-scope="profile" data-color-mode="surface">Покрытие</button><button type="button" data-color-scope="profile" data-color-mode="waytype">Тип дороги</button></div><div class="profile-actions segmented-control"><button id="zoom-back" type="button" disabled>← Назад</button><button id="zoom-reset" type="button" disabled>Reset</button></div></div>
            <div class="profile-wrap" id="profile-wrap" tabindex="0" role="slider" aria-label="Положение на профиле высоты" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
              <svg id="profile" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ebc35" stop-opacity=".24"/><stop offset="1" stop-color="#7ebc35" stop-opacity=".02"/></linearGradient></defs><g id="grid"></g><g id="climb-bands"></g><path id="profile-area" class="profile-area"></path><g id="gradient-line"></g><g id="surface-ribbon"></g><rect id="profile-selection" class="profile-selection" x="0" y="18" width="0" height="246"></rect><line id="profile-cursor" class="profile-cursor" y1="18" y2="264"></line><circle id="profile-dot" class="profile-dot" r="6"></circle></svg>
              <div class="axis" id="axis"></div>
            </div>
            <div class="gradient-legend route-legend" id="gradient-legend"><span><i class="grade-down"></i>спуск</span><span><i class="grade-easy"></i>0–3%</span><span><i class="grade-mid"></i>3–6%</span><span><i class="grade-hard"></i>6–9%</span><span><i class="grade-steep"></i>9–12%</span><span><i class="grade-max"></i>12%+</span></div>
            <div class="surface-legend route-legend" id="surface-legend" hidden></div><div class="waytype-legend route-legend" id="waytype-legend" hidden></div>
            <div class="profile-summary"><span><b id="profile-ascent">—</b> м<small>Набор</small></span><span><b id="profile-descent">—</b> м<small>Спуск</small></span><span><b id="max-label">—</b><small>Максимум</small></span><span><b id="min-label">—</b><small>Минимум</small></span></div>
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
      <aside class="map-column"><section class="map-shell" aria-label="Карта маршрута"><div id="map"></div><div class="map-mode segmented-control" aria-label="Цвет маршрута на карте"><button class="active" type="button" data-color-scope="map" data-color-mode="gradient">Градиент</button><button type="button" data-color-scope="map" data-color-mode="surface">Покрытие</button><button type="button" data-color-scope="map" data-color-mode="waytype">Тип дороги</button></div><div class="map-note" id="map-note"></div><div class="hover-readout" id="hover-readout" aria-live="polite"><b>Наведите на маршрут</b></div></section></aside>
    </div>
  </main>
  <div class="drop-overlay" id="drop-overlay"><strong>Отпустите GPX здесь</strong><span>Маршрут откроется прямо в браузере</span></div>
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

function setAuthUser(user) {
  authControl.innerHTML = renderAuthControl(user);
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
  let bestIndex = 0;
  let bestDistance = Infinity;
  currentTrack.points.forEach((point, index) => {
    const distance = (point.lat - latlng.lat) ** 2 + (point.lon - latlng.lng) ** 2;
    if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
  });
  return bestIndex;
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

function drawMap(track, { fit = true } = {}) {
  if (routeLine) map.eachLayer((layer) => { if (layer.options?.trackLayer && !layer.options?.rangeFocus) map.removeLayer(layer); });
  const coordinates = track.points.map((point) => [point.lat, point.lon]);
  L.polyline(coordinates, { color: '#ffffff', weight: 8, opacity: 0.92, trackLayer: true, interactive: false }).addTo(map);
  const focusedSurface = selectedSurfaceId();
  const focusedWayType = selectedWayTypeId();
  const focusedQuality = selectedQualityId();
  const usesWayTypes = mapColorMode === 'waytype' || focusedWayType;
  const usesQuality = Boolean(focusedQuality);
  const runs = usesQuality
    ? groupQualityRuns(track.points).map((run) => ({ ...run, color: run.quality.color, filterId: run.quality.id }))
    : usesWayTypes
    ? groupWayTypeRuns(track.points).map((run) => ({ ...run, color: run.wayType.color, filterId: run.wayType.id }))
    : mapColorMode === 'surface' || focusedSurface
      ? groupSurfaceRuns(track.points).map((run) => ({ ...run, color: run.surface.color, filterId: run.surface.id }))
      : groupGradientRuns(track.points);
  runs.forEach((run) => {
    const selectedFilter = focusedQuality || focusedWayType || focusedSurface;
    const emphasis = surfaceEmphasis(run.filterId, selectedFilter);
    L.polyline(coordinates.slice(run.startIndex, run.endIndex + 1), {
      color: run.color,
      weight: emphasis.highlighted ? 7 : 5,
      opacity: emphasis.dimmed ? 0.38 : 1,
      trackLayer: true, interactive: false,
    }).addTo(map);
    if (emphasis.highlighted) {
      L.polyline(coordinates.slice(run.startIndex, run.endIndex + 1), {
        color: '#12251e', weight: 11, opacity: 0.72, trackLayer: true, interactive: false,
      }).addTo(map).bringToBack();
    }
  });
  routeLine = L.polyline(coordinates, { color: '#000000', weight: 14, opacity: 0, trackLayer: true }).addTo(map);
  routeLine.on('mousemove', (event) => setActivePoint(nearestPoint(event.latlng), { showContext: true }));
  routeLine.on('mouseout', () => setPointContext(null));
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

function drawProfile(track) {
  currentViewMetrics = visibleMetrics();
  const { startIndex, endIndex, startKm, endKm, min, max } = currentViewMetrics;
  const { ascentM, descentM } = elevationGainLoss(track.points, startIndex, endIndex);
  document.querySelector('#profile-ascent').textContent = ascentM.toLocaleString('ru-RU');
  document.querySelector('#profile-descent').textContent = descentM.toLocaleString('ru-RU');
  const visiblePoints = track.points.slice(startIndex, endIndex + 1).filter((point) => Number.isFinite(point.ele));
  const coords = visiblePoints.map(chartCoordinates);
  const line = coords.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  document.querySelector('#profile-area').setAttribute('d', `${line} L1200,264 L0,264 Z`);
  document.querySelector('#gradient-line').innerHTML = coords.slice(1).map((point, index) => {
    const previous = coords[index];
    const sourcePoint = visiblePoints[index + 1];
    const focusedSurface = selectedSurfaceId();
    const focusedWayType = selectedWayTypeId();
    const focusedQuality = selectedQualityId();
    const wayType = classifyWayType(sourcePoint.surface.highway);
    const filterId = focusedQuality ? sourcePoint.surface.quality.id : focusedWayType ? wayType.id : sourcePoint.surface.id;
    const emphasis = surfaceEmphasis(filterId, focusedQuality || focusedWayType || focusedSurface);
    const color = focusedQuality ? sourcePoint.surface.quality.color : profileColorMode === 'waytype' || focusedWayType ? wayType.color : profileColorMode === 'surface' || focusedSurface ? sourcePoint.surface.color : gradientColor(sourcePoint.grade);
    const title = focusedQuality ? sourcePoint.surface.quality.label : profileColorMode === 'waytype' || focusedWayType ? wayType.label : profileColorMode === 'surface' || focusedSurface ? sourcePoint.surface.label : `${sourcePoint.grade.toFixed(1)}%`;
    return `<line x1="${previous.x}" y1="${previous.y}" x2="${point.x}" y2="${point.y}" stroke="${color}" opacity="${emphasis.dimmed ? 0.3 : 1}" stroke-width="${emphasis.highlighted ? 7 : 4}"><title>${title}</title></line>`;
  }).join('');
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
  const ribbonRuns = profileColorMode === 'waytype'
    ? groupWayTypeRuns(track.points).map((run) => ({ ...run, item: run.wayType }))
    : groupSurfaceRuns(track.points).map((run) => ({ ...run, item: run.surface }));
  document.querySelector('#surface-ribbon').innerHTML = ribbonRuns.map((run) => {
    const from = Math.max(track.points[run.startIndex].distanceKm, startKm);
    const to = Math.min(track.points[run.endIndex].distanceKm, endKm);
    if (from >= to) return '';
    const x = ((from - startKm) / Math.max(endKm - startKm, 0.001)) * 1200;
    const width = ((to - from) / Math.max(endKm - startKm, 0.001)) * 1200;
    const emphasis = surfaceEmphasis(run.item.id, profileColorMode === 'waytype' ? selectedWayTypeId() : selectedSurfaceId());
    return `<rect x="${x}" y="${emphasis.highlighted ? 267 : 269}" width="${Math.max(width, 1)}" height="${emphasis.highlighted ? 13 : 9}" fill="${emphasis.dimmed ? '#aeb2aa' : run.item.color}" opacity="${emphasis.dimmed ? 0.2 : 1}"><title>${run.item.label}</title></rect>`;
  }).join('');
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

function renderSurfaces(track, status = 'Данные покрытия загружены из OpenStreetMap') {
  const summary = summarizeSurfaces(track.points);
  const wayTypes = summarizeWayTypes(track.points);
  const quality = summarizeRoadQuality(track.points);
  document.querySelector('#surface-status').textContent = status;
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
  }
  if (!currentTrack) return;
  if (scope === 'map') drawMap(currentTrack, { fit: false });
  if (scope === 'profile' && currentTrack.hasElevation) drawProfile(currentTrack);
  setActivePoint(activePointIndex);
}

async function enrichTrackSurfaces(track, runId) {
  const refresh = (status) => {
    renderSurfaces(track, status);
    drawMap(track);
    if (track.hasElevation) drawProfile(track);
    setActivePoint(activePointIndex);
  };
  if (track.points.some((point) => point.surfaceTags)) {
    track.points = track.points.map((point) => ({ ...point, surface: classifySurface(point.surfaceTags) }));
    refresh('Демонстрационные данные покрытия');
    return;
  }
  const valhallaController = new AbortController();
  const valhallaTimeout = setTimeout(() => valhallaController.abort(), 35_000);
  try {
    const matches = await fetchValhallaMatches(track.points, { signal: valhallaController.signal });
    if (runId !== enrichmentRun) return;
    track.points = applyValhallaMatches(track.points, matches);
    const known = summarizeSurfaces(track.points).filter((item) => item.id !== 'unknown').reduce((sum, item) => sum + item.percent, 0);
    refresh(`Valhalla · сопоставлено ${Math.round(known)}% маршрута · материал оценочный`);
    return;
  } catch {
    if (runId !== enrichmentRun) return;
  } finally { clearTimeout(valhallaTimeout); }

  renderSurfaces(track, 'Не удалось получить данные дорог · маршрут доступен без покрытия');
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

function renderTrack(rawTrack) {
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
  currentTrack = analyzeTrack(rawTrack);
  const grades = calculateSegmentGrades(currentTrack.points);
  currentTrack.points = currentTrack.points.map((point, index) => ({ ...point, grade: grades[index], surface: classifySurface(point.surfaceTags) }));
  currentTrack.climbs = detectClimbs(currentTrack.points);
  currentTrack.descents = detectDescents(currentTrack.points);
  viewRange = [0, currentTrack.points.length - 1];
  zoomHistory = [];
  currentViewMetrics = null;
  document.querySelector('#track-name').textContent = currentTrack.name;
  document.querySelector('#distance').textContent = currentTrack.distanceKm.toFixed(1);
  document.querySelector('#ascent').textContent = currentTrack.hasElevation ? currentTrack.ascentM.toLocaleString('ru-RU') : '—';
  document.querySelector('#descent').textContent = currentTrack.hasElevation ? currentTrack.descentM.toLocaleString('ru-RU') : '—';
  const [duration, unit] = formatDuration(currentTrack.movingTimeMs);
  document.querySelector('#duration').textContent = duration;
  document.querySelector('#duration-unit').textContent = unit;
  document.querySelector('#profile-ascent').textContent = currentTrack.ascentM.toLocaleString('ru-RU');
  document.querySelector('#profile-descent').textContent = currentTrack.descentM.toLocaleString('ru-RU');
  const speedBadge = document.querySelector('#average-speed-badge');
  speedBadge.textContent = currentTrack.movingAverageSpeedKmh
    ? `${currentTrack.movingAverageSpeedKmh.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} км/ч` : '— км/ч';
  speedBadge.title = currentTrack.movingAverageSpeedKmh
    ? `Средняя скорость движения по данным GPX: ${currentTrack.movingAverageSpeedKmh.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км/ч`
    : 'В GPX недостаточно timestamps для расчёта средней скорости';
  drawMap(currentTrack);
  if (currentTrack.hasElevation) drawProfile(currentTrack);
  renderClimbs(currentTrack);
  renderSurfaces(currentTrack, 'Определяем типы дорог…');
  document.querySelector('#zoom-back').disabled = true;
  document.querySelector('#zoom-reset').disabled = true;
  setActivePoint(0);
  enrichTrackSurfaces(currentTrack, enrichmentRun);
}

async function loadFile(file) {
  try {
    renderTrack(parseGpx(await file.text()));
  } catch (error) {
    const toast = document.querySelector('#toast');
    toast.textContent = error.message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 4200);
  }
}

const profile = document.querySelector('#profile-wrap');
profile.addEventListener('pointermove', (event) => {
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
  if (!selectionStart) setPointContext(null);
});
profile.addEventListener('pointerdown', (event) => {
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
document.querySelector('#gpx-file').addEventListener('change', (event) => event.target.files[0] && loadFile(event.target.files[0]));
const overlay = document.querySelector('#drop-overlay');
window.addEventListener('dragover', (event) => { event.preventDefault(); overlay.classList.add('visible'); });
window.addEventListener('dragleave', (event) => { if (!event.relatedTarget) overlay.classList.remove('visible'); });
window.addEventListener('drop', (event) => { event.preventDefault(); overlay.classList.remove('visible'); if (event.dataTransfer.files[0]) loadFile(event.dataTransfer.files[0]); });

initMap();
renderTrack(createDemoTrack());
setColorMode('map', mapColorMode);
setColorMode('profile', profileColorMode);
restoreSession();
