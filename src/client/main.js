import { setupPreferencesControl } from './preferences-ui.js';
import { renderAppShell } from './app-shell.js';
import { createTrackApi } from './track-api.js';
import { createUploadFlow } from './track-upload-flow.js';
import { distanceValue, elevationValue, number, createSpeedDraft } from './measurements.js';
import { neutralAnalysis, poiName, poiType, roadLabel } from './analysis-presentation.js';
import { errorMessage, errorFromPayload } from './errors-ui.js';
import { t, bindText, bindAttribute, htmlMessage, preferences, formatMeasurement, currentUnit, percent, escapeHtml } from './i18n.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { renderAuthControl } from './auth-ui.js';
import { renderHomeRouteCard, renderPublicTracks } from './home-page-ui.js';
import { bulkDeleteSummary, bulkSelectionState, cancelTrackSearch, createTrackCard } from './my-tracks-ui.js';
import { closeOverflowMenuOnOutsideClick, copyPublicTrackLink, favoriteButtonState, publicTrackIdFromPath } from './route-actions-ui.js';
import { shouldShowCompactRouteHeader } from './sticky-route-header-ui.js';
import { formatTrackAttribution, resolveTrackUploader } from './track-meta-ui.js';
import { setButtonLoading, withButtonLoading } from './button-loading-ui.js';
import { closeRouteTypeDropdownOnEscape, closeRouteTypeDropdownsOutside, routeTypeDefinition, routeTypeIcon, selectedRouteType, setRouteTypeDropdown } from './route-type-ui.js';
import { availableExternalTrackLinks, renderExternalTrackLinks } from './external-track-links-ui.js';
import { detectClimbs, detectDescents } from './domain/climbs.js';
import { calculateSegmentGrades } from './domain/gradient.js';
import { emptyPoiSelection, updatePoiSelection } from './domain/poi-selection.js';
import { areaPathFromCoordinates, elevationGainLoss, nearestRoutePointIndex, pointIndexAtRatio, pointerRatioInPlot, profileFocusVisibility, profileRangePosition, visibleRangeIndices } from './domain/profile-math.js';
import { colorRunsForMode, highlightRunsForFilter, profileColorRuns } from './domain/route-color.js';
import { isClosedRoute } from './domain/route-shape.js';
import { classifySurface, classifyWayType, roadQualityCategories, surfaceCategories, surfaceEmphasis, wayTypeCategories } from './domain/surface.js';

const app = document.querySelector('#app');
const trackApi = createTrackApi();
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
let hoveredSurfaceId = null;
let pinnedSurfaceId = null;
let hoveredWayTypeId = null;
let pinnedWayTypeId = null;
let hoveredQualityId = null;
let pinnedQualityId = null;
let hoveredRange = null;
let pinnedRange = null;
let currentUser = null;
const isMyTracksPage = window.location.pathname === '/my-tracks';
const isFavoriteTracksPage = window.location.pathname === '/favorite-tracks';
const isTrackCollectionPage = isMyTracksPage || isFavoriteTracksPage;
const isHomePage = window.location.pathname === '/';
const pathPublicTrackId = publicTrackIdFromPath(window.location.pathname);
const isNotFoundPage = !isHomePage && !isTrackCollectionPage && !pathPublicTrackId;
let homepageTracks = [];
let myTracksCursor = null;
let myTracksLoading = false;
let publicTrackId = null;
const uploadFlow = createUploadFlow({ trackApi, isAuthenticated: () => Boolean(currentUser), getPublicTrackId: () => publicTrackId });
let publicTrackData = null;
let publicTrackOwnershipVerified = false;
let managedTrackId = null;
let managedTrackTitle = '';
let tracksPendingDeletion = [];

app.innerHTML = renderAppShell({ isHomePage, isNotFoundPage, isTrackCollectionPage, isFavoriteTracksPage });

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
  const attributionText = () => formatTrackAttribution({ ...publicTrackData, uploader });
  const attribution = document.querySelector('#track-attribution');
  attribution.hidden = !attributionText();
  bindText(document.querySelector('#track-attribution-text'), attributionText);
  const uploaderAvatar = document.querySelector('#track-uploader-avatar');
  uploaderAvatar.hidden = !uploader?.avatarUrl;
  if (uploader?.avatarUrl) uploaderAvatar.src = uploader.avatarUrl;
  else uploaderAvatar.removeAttribute('src');
}

function setAuthUser(user) {
  currentUser = user;
  authControl.innerHTML = renderAuthControl(user);
  document.querySelectorAll('[data-auth-upload]').forEach((control) => { control.hidden = !user; });
  document.querySelectorAll('[data-home-guest]').forEach((control) => { control.hidden = Boolean(user); });
  document.querySelectorAll('[data-home-author]').forEach((control) => { control.hidden = !user; });
  if (isTrackCollectionPage) loadMyTracks({ reset: true });
  if (publicTrackId && user) {
    loadTrackManagement(publicTrackId);
    loadSavedState(publicTrackId);
  }
  if (!user) {
    publicTrackOwnershipVerified = false;
    renderTrackAttribution();
    document.querySelector('#owner-track-actions').hidden = true;
    document.querySelectorAll('.source-retry').forEach((button) => { button.hidden = true; });
  }
}

async function loadTrackManagement(trackId) {
  const response = await trackApi.management(trackId);
  if (!response.ok) return;
  const { data } = await response.json();
  if (trackId !== publicTrackId) return;
  publicTrackOwnershipVerified = true;
  renderTrackAttribution();
  document.querySelector('#owner-track-actions').hidden = false;
  document.querySelector('#edit-track-title').value = data.title;
  setSpeedDraft(data.speedKmh || 20);
  setRouteTypeDropdown(document.querySelector('#edit-track-route-type'), data.routeType);
  setExternalLinkFields(data.externalLinks);
  document.querySelectorAll('.source-retry').forEach((button) => {
    button.hidden = !data.canRetry || button.dataset.retrySource !== data.retrySource;
  });
}

function setSavedButton(saved) {
  const button = document.querySelector('#save-track');
  const state = favoriteButtonState(saved);
  button.classList.toggle('is-saved', saved);
  button.setAttribute('aria-pressed', state.pressed);
  bindAttribute(button, 'aria-label', () => favoriteButtonState(saved).label);
  bindAttribute(button, 'title', () => favoriteButtonState(saved).label);
}

async function loadSavedState(trackId) {
  const response = await trackApi.savedState(trackId);
  if (!response.ok || trackId !== publicTrackId) return;
  const { data } = await response.json();
  setSavedButton(Boolean(data.saved));
}

async function loadMyTracks({ reset = false } = {}) {
  if (!isTrackCollectionPage || myTracksLoading) return;
  const list = document.querySelector('#track-list');
  const message = document.querySelector('#my-tracks-message');
  const more = document.querySelector('#load-more-tracks');
  if (!currentUser) {
    list.replaceChildren();
    message.innerHTML = `${htmlMessage(isFavoriteTracksPage ? 'tracks.loginFavorites' : 'tracks.loginOwn')} <a href="/api/auth/google">${htmlMessage('common.login')}</a>`;
    message.hidden = false;
    more.hidden = true;
    return;
  }
  if (reset) {
    myTracksCursor = null;
    list.replaceChildren();
    updateBulkDeleteButton();
  }
  myTracksLoading = true;
  bindText(message, () => t('tracks.loading'));
  message.hidden = false;
  more.disabled = true;
  const query = document.querySelector('#track-query').value.trim();
  const parameters = new URLSearchParams();
  if (query) parameters.set('query', query);
  if (myTracksCursor) parameters.set('cursor', myTracksCursor);
  try {
    const response = await trackApi.list({ saved: isFavoriteTracksPage, parameters });
    const payload = await response.json();
    if (!response.ok) throw errorFromPayload(payload);
    payload.data.items.forEach((track) => list.append(createTrackCard(track, document, { ownerActions: !isFavoriteTracksPage })));
    updateBulkDeleteButton();
    myTracksCursor = payload.data.nextCursor;
    bindText(message, () => list.children.length ? '' : (query ? t('tracks.noResults') : isFavoriteTracksPage ? t('tracks.noFavorites') : t('tracks.empty')));
    message.hidden = Boolean(list.children.length);
    more.hidden = !myTracksCursor;
  } catch (listError) {
    bindText(message, () => errorMessage(listError));
    message.hidden = false;
    more.hidden = true;
  } finally {
    myTracksLoading = false;
    more.disabled = false;
  }
}

function setExternalLinkFields(links = {}) {
  document.querySelector('#edit-track-komoot').value = links.komoot || '';
  document.querySelector('#edit-track-strava').value = links.strava || '';
  document.querySelector('#edit-track-garmin').value = links.garmin || '';
  document.querySelector('#edit-track-ride-with-gps').value = links.rideWithGps || '';
}

function externalLinksFromEditor() {
  return {
    komoot: document.querySelector('#edit-track-komoot').value,
    strava: document.querySelector('#edit-track-strava').value,
    garmin: document.querySelector('#edit-track-garmin').value,
    rideWithGps: document.querySelector('#edit-track-ride-with-gps').value,
  };
}

function openTrackEditor({ id, title, speedKmh, routeType, externalLinks }) {
  managedTrackId = id;
  managedTrackTitle = title;
  document.querySelector('#edit-track-title').value = title;
  setSpeedDraft(speedKmh || 20);
  setRouteTypeDropdown(document.querySelector('#edit-track-route-type'), routeType);
  setExternalLinkFields(externalLinks);
  document.querySelector('#edit-track-error').hidden = true;
  document.querySelector('#edit-track-dialog').showModal();
}

async function openTrackEditorFromList(track, button) {
  await withButtonLoading(button, async () => {
    const response = await trackApi.management(track.id);
    if (!response.ok) return;
    const { data } = await response.json();
    openTrackEditor(data);
  });
}

function openTrackDeleteConfirmation({ id, title }) {
  managedTrackId = id;
  managedTrackTitle = title;
  openTracksDeleteConfirmation([{ id, title }]);
}

function selectedTrackCards() {
  return [...document.querySelectorAll('[data-track-select]:checked')].map((checkbox) => {
    const card = checkbox.closest('.track-card');
    return { id: card.dataset.trackId, title: card.dataset.trackTitle };
  });
}

function updateBulkDeleteButton() {
  const checkboxes = [...document.querySelectorAll('[data-track-select]')];
  const selectedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
  const state = bulkSelectionState({ total: checkboxes.length, selected: selectedCount, actionLabel: isFavoriteTracksPage ? t('common.remove') : t('common.delete') });
  const selectAll = document.querySelector('#select-all-tracks');
  const remove = document.querySelector('#bulk-delete-tracks');
  selectAll.disabled = checkboxes.length === 0;
  bindText(selectAll, () => t(state.allSelected ? 'common.clearSelection' : 'common.selectAll'));
  selectAll.setAttribute('aria-pressed', String(state.allSelected));
  remove.disabled = state.deleteDisabled;
  bindText(remove.querySelector('span'), () => bulkSelectionState({ total: checkboxes.length, selected: selectedCount, actionLabel: t(isFavoriteTracksPage ? 'common.remove' : 'common.delete') }).deleteLabel);
  checkboxes.forEach((checkbox) => checkbox.closest('.track-card').classList.toggle('is-selected', checkbox.checked));
}

function openTracksDeleteConfirmation(tracks) {
  tracksPendingDeletion = tracks;
  const summary = bulkDeleteSummary(tracks);
  const favoriteRemoval = isFavoriteTracksPage;
  bindText(document.querySelector('#delete-dialog-kicker'), () => favoriteRemoval ? t('tracks.favoritesKicker') : t('tracks.deleteKicker'));
  bindText(document.querySelector('#delete-dialog-title'), () => summary.count === 1
    ? (favoriteRemoval ? t('tracks.unsaveOne') : t('tracks.deleteOne'))
    : t(favoriteRemoval ? 'tracks.unsaveMany' : 'tracks.deleteMany', { count: summary.count }));
  bindText(document.querySelector('#delete-track-description'), () => favoriteRemoval
    ? (summary.count === 1 ? t('tracks.keepLink') : t('tracks.keepLinks'))
    : (summary.count === 1 ? t('tracks.deleteWarning')
      : t('tracks.deleteManyWarning', { count: summary.count })));
  bindText(document.querySelector('#confirm-track-delete'), () => favoriteRemoval ? t('common.remove') : t('common.delete'));
  const list = document.querySelector('#delete-track-list');
  list.replaceChildren(...summary.titles.map((trackTitle) => {
    const item = document.createElement('li');
    bindText(item, () => trackTitle);
    return item;
  }));
  if (summary.remaining) {
    const item = document.createElement('li');
    bindText(item, () => t('tracks.remaining', { count: summary.remaining }));
    list.append(item);
  }
  document.querySelector('#delete-track-error').hidden = true;
  document.querySelector('#confirm-track-delete').disabled = false;
  document.querySelector('#confirm-delete-dialog').showModal();
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
  return [`${hours}:${String(minutes).padStart(2, '0')}`, t('common.hour')];
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

  bindText(document.querySelector('#poi-count'), () => t('poi.count', { count: pointsOfInterest.length }));
  pointsOfInterest.forEach((point, index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'poi-row';
    row.dataset.poiIndex = String(index);
    row.disabled = !currentTrack;
    row.setAttribute('aria-pressed', 'false');
    const number = document.createElement('b');
    bindText(number, () => String(index + 1));
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    bindText(name, () => poiName(point, index));
    copy.append(name);
    const detail = poiType(point);
    if (detail) {
      const meta = document.createElement('small');
      bindText(meta, () => poiType(point));
      copy.append(meta);
    }
    if (Number.isFinite(point.distanceKm)) {
      const distance = document.createElement('small');
      bindText(distance, () => formatMeasurement('distance', point.distanceKm));
      copy.append(distance);
    }
    row.append(number, copy);
    list.append(row);
  });
}

function initMap() {
  map = L.map('map', { zoomControl: false, attributionControl: true });
  map.createPane('startMarkerPane');
  map.getPane('startMarkerPane').style.zIndex = '675';
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  L.control.zoom({ position: 'topright', zoomInTitle: t('map.zoomIn'), zoomOutTitle: t('map.zoomOut') }).addTo(map);
  bindAttribute(document.querySelector('.leaflet-control-zoom-in'), 'title', () => t('map.zoomIn'));
  bindAttribute(document.querySelector('.leaflet-control-zoom-in'), 'aria-label', () => t('map.zoomIn'));
  bindAttribute(document.querySelector('.leaflet-control-zoom-out'), 'title', () => t('map.zoomOut'));
  bindAttribute(document.querySelector('.leaflet-control-zoom-out'), 'aria-label', () => t('map.zoomOut'));
}

async function initHomeExampleMap() {
  const container = document.querySelector('#home-example-map');
  const previewContainer = document.querySelector('#home-preview-example-map');
  const loading = document.querySelector('#home-map-loading');
  if (!container) return;
  try {
    const analysisUrl = homepageTracks[0]?.analysisUrl;
    if (!analysisUrl) throw new Error('Track unavailable');
    const response = await trackApi.analysis(analysisUrl);
    if (!response.ok) throw new Error('Track unavailable');
    const track = (await response.json()).analysis;
    if (!track?.points?.length) throw new Error('Track unavailable');
    const coordinates = track.points.map((point) => [point.lat, point.lon]);
    [container, previewContainer].filter(Boolean).forEach((mapContainer) => {
      const homeMap = L.map(mapContainer, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(homeMap);
      const outline = L.polyline(coordinates, { color: '#fafbf7', weight: 8, opacity: 0.92, interactive: false }).addTo(homeMap);
      L.polyline(coordinates, { color: '#173d31', weight: 4, opacity: 0.96, interactive: false }).addTo(homeMap);
      (track.pointsOfInterest || []).slice(0, 14).forEach((point) => {
        L.circleMarker([point.lat, point.lon], { radius: 4, weight: 2, color: '#fafbf7', fillColor: '#e36b32', fillOpacity: 1, interactive: false }).addTo(homeMap);
      });
      homeMap.fitBounds(outline.getBounds(), { padding: [28, 28] });
    });
    loading.hidden = true;
  } catch {
    bindText(loading, () => t('map.unavailable'));
  }
}

async function loadHomepageTracks() {
  try {
    const response = await trackApi.homepage();
    if (!response.ok) throw new Error('Homepage tracks unavailable');
    const payload = await response.json();
    homepageTracks = Array.isArray(payload.data) ? payload.data : [];
  } catch {
    homepageTracks = [];
  }
  document.querySelector('.home-route-card').outerHTML = renderHomeRouteCard(homepageTracks[0]);
  document.querySelector('.home-track-links').innerHTML = renderPublicTracks(homepageTracks);
  const realLink = document.querySelector('#home-open-real');
  realLink.href = homepageTracks[0]?.url || '#public-tracks';
  realLink.removeAttribute('aria-disabled');
  initHomeExampleMap();
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
    title: closedRoute ? t('map.startFinishTitle') : t('map.startTitle'),
  }).addTo(map);
  if (!closedRoute) {
    L.marker(coordinates.at(-1), {
      icon: makeEndpointIcon('B', 'finish'), trackLayer: true, interactive: false, zIndexOffset: 900, title: t('map.finishTitle'),
    }).addTo(map);
  }
  poiMarkers = (track.pointsOfInterest || []).map((point, index) => {
    const tooltip = document.createElement('span');
    bindText(tooltip, () => poiName(point, index));
    const marker = L.marker([point.lat, point.lon], {
      icon: makePoiIcon(index), trackLayer: true, zIndexOffset: 700, title: poiName(point, index),
    }).addTo(map).bindTooltip(tooltip, { direction: 'top', offset: [0, -26] });
    marker.on('mouseover', () => hoverPoi(index));
    marker.on('mouseout', () => leavePoi());
    marker.on('click', () => togglePoi(index));
    return marker;
  });
  renderPoiSelection();
  document.querySelector('#map-note').innerHTML = closedRoute
    ? `<span class="start-dot"></span><b>${htmlMessage('map.startFinish')}</b>`
    : `<span class="start-dot"></span><b>${htmlMessage('map.start')}</b><i class="finish-dot"></i><b>${htmlMessage('map.finish')}</b>`;
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
    marker.title = poiName(point, index);
    bindText(marker, () => String(index + 1));
    group.append(marker);
  });
}

function drawProfile(track) {
  currentViewMetrics = visibleMetrics();
  const { startIndex, endIndex, startKm, endKm, min, max } = currentViewMetrics;
  const isFullRange = startIndex === 0 && endIndex === track.points.length - 1;
  const summaryMetrics = isFullRange ? publicTrackData?.summary?.metrics : null;
  const { ascentM, descentM } = summaryMetrics || elevationGainLoss(track.points, startIndex, endIndex);
  bindText(document.querySelector('#profile-ascent'), () => number(elevationValue(ascentM, preferences.value), { ...preferences.value, digits: 0 }));
  bindText(document.querySelector('#profile-descent'), () => number(elevationValue(descentM, preferences.value), { ...preferences.value, digits: 0 }));
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
    return path ? `<path d="${path}" stroke="${run.color}"><title>${escapeHtml(t(run.label))}</title></path>` : '';
  }).join('');
  document.querySelector('#gradient-line').innerHTML = baseProfilePaths;
  const focusedRuns = highlightRunsForFilter(track.points, selectedRouteFilter());
  const terrainRange = selectedTerrainRange();
  if (terrainRange) focusedRuns.push(terrainRange);
  const focusVisibility = profileFocusVisibility(profileFocusPlacement);
  document.querySelector('#profile-focus-profile').innerHTML = focusVisibility.profile ? focusedRuns.map((run) => {
    const path = profilePath(run);
    return path ? `<path class="profile-focus-path-outline" d="${path}"></path><path class="profile-focus-path-line" d="${path}" stroke="${run.color}"><title>${escapeHtml(t(run.label))}</title></path>` : '';
  }).join('') : '';
  document.querySelector('#grid').innerHTML = [40, 95, 150, 205, 260].map((y) => `<line x1="0" y1="${y}" x2="1200" y2="${y}" />`).join('');
  document.querySelector('#axis').innerHTML = Array.from({ length: 6 }, (_, index) => `<span>${formatMeasurement('distance', startKm + (endKm - startKm) * index / 5)}</span>`).join('');
  bindText(document.querySelector('#min-label'), () => formatMeasurement('elevation', summaryMetrics?.minElevationM ?? min));
  bindText(document.querySelector('#max-label'), () => formatMeasurement('elevation', summaryMetrics?.maxElevationM ?? max));
  document.querySelector('#climb-bands').innerHTML = track.climbs.map((climb) => {
    const from = Math.max(climb.startKm, startKm);
    const to = Math.min(climb.endKm, endKm);
    if (from >= to) return '';
    const x = ((from - startKm) / Math.max(endKm - startKm, 0.001)) * 1200;
    const width = ((to - from) / Math.max(endKm - startKm, 0.001)) * 1200;
    return `<rect class="climb-band" x="${x}" y="18" width="${width}" height="246" fill="${climb.color}"><title>${escapeHtml(t('profile.climb', { distance: formatMeasurement('distance', climb.lengthM / 1000), grade: percent(climb.averageGrade) }))}</title></rect>`;
  }).join('');
  const ribbonRuns = colorRunsForMode(track.points, profileColorMode);
  const ribbonRect = (run) => {
    const position = profileRangePosition(track.points, run, startKm, endKm);
    if (!position) return '';
    const { x, width } = position;
    return `<rect x="${x}" y="269" width="${Math.max(width, 1)}" height="9" fill="${run.color}"><title>${escapeHtml(t(run.label))}</title></rect>`;
  };
  document.querySelector('#surface-ribbon').innerHTML = ribbonRuns.map(ribbonRect).join('');
  const focusRect = (run) => {
    const position = profileRangePosition(track.points, run, startKm, endKm);
    if (!position) return '';
    const { x, width } = position;
    return `<rect class="profile-focus-outline" x="${x}" y="265" width="${Math.max(width, 1)}" height="17" rx="2"></rect><rect class="profile-focus-line" x="${x}" y="268" width="${Math.max(width, 1)}" height="11" rx="1" fill="${run.color}"><title>${escapeHtml(t(run.label))}</title></rect>`;
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
  bindText(document.querySelector('#climbs-count'), () => track.climbs.length);
  bindText(document.querySelector('#descents-count'), () => track.descents.length);
  const rows = (items, type) => items.length ? items.map((item, index) => {
    const key = `${type}-${index}`;
    return `<button class="terrain-row" type="button" data-terrain-range="${key}" data-terrain-type="${type}" data-terrain-index="${index}" aria-pressed="false" style="--terrain-color:${item.color}"><b>#${index + 1}</b><i></i><span>${escapeHtml(t(item.label))}</span><span>△ ${percent(item.averageGrade)}</span><span>${type === 'climb' ? '↗' : '↘'} ${formatMeasurement('elevation', type === 'climb' ? item.gainM : item.dropM)}</span><span>↔ ${formatMeasurement('distance', item.lengthM / 1000, { digits: 2 })}</span></button>`;
  }).join('') : `<p class="empty-climbs">${htmlMessage('terrain.empty')}</p>`;
  document.querySelector('#climbs-list').innerHTML = rows(track.climbs, 'climb');
  document.querySelector('#descents-list').innerHTML = rows(track.descents, 'descent');
}

function renderSurfaces(trackSummary) {
  const categoryRows = (items, categories) => categories.map((category) => ({
    ...category, ...(items || []).find((item) => item.id === category.id),
    distanceKm: (items || []).find((item) => item.id === category.id)?.distanceKm ?? 0,
    percent: (items || []).find((item) => item.id === category.id)?.percent ?? 0,
  }));
  const summary = categoryRows(trackSummary.distributions.surfaces, surfaceCategories);
  const wayTypes = categoryRows(trackSummary.distributions.wayTypes, wayTypeCategories);
  const quality = categoryRows(trackSummary.distributions.roadQualities, roadQualityCategories);
  document.querySelector('#surface-bar').innerHTML = summary.filter((item) => item.percent > 0).map((item) =>
    `<button type="button" data-surface-filter="${item.id}" style="--surface-color:${item.color};flex:${item.percent}" title="${escapeHtml(t(item.label))}: ${percent(item.percent)}" aria-label="${escapeHtml(t(item.label))}: ${escapeHtml(t('profile.percentRoute', { percent: percent(item.percent) }))}" aria-pressed="false"></button>`).join('');
  document.querySelector('#surface-stats').innerHTML = summary.map((item) => `
    <button class="surface-stat distribution-row" type="button" data-surface-filter="${item.id}" data-selected-label="${escapeHtml(t('surface.selected'))}" data-map-label="${escapeHtml(t('surface.onMap'))}" aria-pressed="false" ${item.distanceKm === 0 ? 'disabled' : ''}>
      <i style="--surface-color:${item.color}"></i><span>${escapeHtml(t(item.label))}</span>
      <strong>${formatMeasurement('distance', item.distanceKm)}</strong><small>${percent(item.percent, 0)}</small></button>`).join('');
  document.querySelector('#way-type-bar').innerHTML = wayTypes.filter((item) => item.percent > 0).map((item) =>
    `<button type="button" data-waytype-filter="${item.id}" style="--surface-color:${item.color};flex:${item.percent}" title="${escapeHtml(t(item.label))}: ${percent(item.percent)}" aria-label="${escapeHtml(t(item.label))}: ${escapeHtml(t('profile.percentRoute', { percent: percent(item.percent) }))}" aria-pressed="false"></button>`).join('');
  document.querySelector('#way-type-stats').innerHTML = wayTypes.map((item) => `
    <button class="distribution-row" type="button" data-waytype-filter="${item.id}" aria-pressed="false" ${item.distanceKm === 0 ? 'disabled' : ''}><i style="--surface-color:${item.color}"></i><span>${escapeHtml(t(item.label))}</span><strong>${formatMeasurement('distance', item.distanceKm)}</strong><small>${percent(item.percent, 0)}</small></button>`).join('');
  document.querySelector('#surface-legend').innerHTML = surfaceCategories.map((item) =>
    `<span><i style="--surface-color:${item.color}"></i>${escapeHtml(t(item.label))}</span>`).join('');
  document.querySelector('#waytype-legend').innerHTML = wayTypeCategories.map((item) =>
    `<span><i style="--surface-color:${item.color}"></i>${escapeHtml(t(item.label))}</span>`).join('');
  document.querySelector('#quality-legend').innerHTML = roadQualityCategories.map((item) =>
    `<span><i style="--surface-color:${item.color}"></i>${escapeHtml(t(item.label))}</span>`).join('');
  document.querySelector('#quality-bar').innerHTML = quality.filter((item) => item.percent > 0).map((item) =>
    `<button type="button" data-quality-filter="${item.id}" style="--surface-color:${item.color};flex:${item.percent}" title="${escapeHtml(t(item.label))}: ${percent(item.percent)}" aria-label="${escapeHtml(t(item.label))}: ${escapeHtml(t('profile.percentRoute', { percent: percent(item.percent) }))}" aria-pressed="false"></button>`).join('');
  document.querySelector('#quality-stats').innerHTML = quality.map((item) => `
    <button class="distribution-row" type="button" data-quality-filter="${item.id}" aria-pressed="false" ${item.distanceKm === 0 ? 'disabled' : ''}><i style="--surface-color:${item.color}"></i><span>${escapeHtml(t(item.label))}</span><strong>${formatMeasurement('distance', item.distanceKm)}</strong><small>${percent(item.percent, 0)}</small></button>`).join('');
  document.querySelectorAll('[data-surface-filter],[data-waytype-filter],[data-quality-filter]')
    .forEach((control) => { control.dataset.summaryEmpty = String(control.disabled); });
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

function renderSourceInfo(sources = {}) {
  const symbols = { SUCCESS: '✓', FAILED: '×', PENDING: '…' };
  const labels = { SUCCESS: 'sources.available', FAILED: 'sources.unavailable', PENDING: 'sources.processing' };
  document.querySelectorAll('[data-analysis-source]').forEach((row) => {
    const status = sources[row.dataset.analysisSource] || 'PENDING';
    row.dataset.sourceStatus = status;
    bindText(row.querySelector('.source-state'), () => symbols[status]);
    bindAttribute(row.querySelector('.source-state'), 'aria-label', () => t(labels[status]));
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
  const grade = percent(point.grade);
  const surfaceLabel = point.surface.inferred ? t('profile.inferred', { surface: t(point.surface.label) }) : t(point.surface.label);
  document.querySelector('#hover-readout').innerHTML = `<b>${formatMeasurement('distance', point.distanceKm)} · ${formatMeasurement('elevation', point.ele)} · ${grade}</b><span>${escapeHtml(t('profile.surfaceDetail', { surface: surfaceLabel, road: roadLabel(point.surface.highway), quality: t(point.surface.quality.label) }))}</span><small>${escapeHtml(t('profile.percentRoute', { percent: percent(currentTrack.distanceKm ? point.distanceKm / currentTrack.distanceKm * 100 : 0, 0) }))}</small>`;
  const slider = document.querySelector('#profile-wrap');
  slider.setAttribute('aria-valuenow', currentTrack.distanceKm ? Math.round((point.distanceKm / currentTrack.distanceKm) * 100) : 0);
  slider.setAttribute('aria-valuetext', t('profile.positionValue', { distance: formatMeasurement('distance', point.distanceKm), elevation: formatMeasurement('elevation', point.ele) }));
  setPointContext(showContext ? point : null);
}

function renderTrack(rawTrack, { analysisSources, routeType = 'other' } = {}) {
  document.querySelector('#track-name').classList.remove('inline-loading', 'is-loading');
  document.querySelector('.route-metrics').hidden = false;
  document.querySelector('.route-workspace').hidden = false;
  document.querySelector('#route-state-note').hidden = true;
  setDetailedView('ready');
  clearRangeFocus();
  hoveredSurfaceId = null;
  pinnedSurfaceId = null;
  hoveredWayTypeId = null;
  pinnedWayTypeId = null;
  hoveredQualityId = null;
  pinnedQualityId = null;
  hoveredRange = null;
  pinnedRange = null;
  currentTrack = neutralAnalysis(rawTrack);
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
  bindText(document.querySelector('#track-name'), () => currentTrack.name || t('common.unnamed'));
  bindText(document.querySelector('#compact-track-name'), () => currentTrack.name || t('common.unnamed'));
  const type = routeTypeDefinition(routeType);
  const typeMetric = document.querySelector('#route-type-metric');
  typeMetric.innerHTML = `${routeTypeIcon(type.id)}<b>${htmlMessage(`activity.${type.id}`)}</b>`;
  bindAttribute(typeMetric, 'aria-label', () => t('route.typeValue', { type: routeTypeDefinition(type.id).label }));
  const compactTypeMetric = document.querySelector('#compact-route-type-metric');
  compactTypeMetric.innerHTML = `${routeTypeIcon(type.id)}<b>${htmlMessage(`activity.${type.id}`)}</b>`;
  bindAttribute(compactTypeMetric, 'aria-label', () => t('route.typeValue', { type: routeTypeDefinition(type.id).label }));
  bindText(document.querySelector('#distance'), () => number(distanceValue(currentTrack.distanceKm, preferences.value), preferences.value));
  bindText(document.querySelector('#compact-distance'), () => number(distanceValue(currentTrack.distanceKm, preferences.value), preferences.value));
  bindText(document.querySelector('#ascent'), () => currentTrack.hasElevation ? number(elevationValue(currentTrack.ascentM, preferences.value), { ...preferences.value, digits: 0 }) : '—');
  bindText(document.querySelector('#compact-ascent'), () => currentTrack.hasElevation ? number(elevationValue(currentTrack.ascentM, preferences.value), { ...preferences.value, digits: 0 }) : '—');
  bindText(document.querySelector('#descent'), () => currentTrack.hasElevation ? number(elevationValue(currentTrack.descentM, preferences.value), { ...preferences.value, digits: 0 }) : '—');
  bindText(document.querySelector('#compact-descent'), () => currentTrack.hasElevation ? number(elevationValue(currentTrack.descentM, preferences.value), { ...preferences.value, digits: 0 }) : '—');
  const [duration] = formatDuration(currentTrack.estimatedDurationMs || currentTrack.movingTimeMs);
  bindText(document.querySelector('#duration'), () => duration);
  bindText(document.querySelector('#duration-unit'), () => t('common.hour'));
  bindText(document.querySelector('#compact-duration'), () => duration);
  bindText(document.querySelector('#compact-duration-unit'), () => t('common.hour'));
  bindText(document.querySelector('#profile-ascent'), () => number(elevationValue(currentTrack.ascentM, preferences.value), { ...preferences.value, digits: 0 }));
  bindText(document.querySelector('#profile-descent'), () => number(elevationValue(currentTrack.descentM, preferences.value), { ...preferences.value, digits: 0 }));
  const speedBadge = document.querySelector('#average-speed-badge');
  const routeSpeed = currentTrack.effectiveSpeedKmh || currentTrack.movingAverageSpeedKmh;
  bindText(speedBadge, () => formatMeasurement('speed', routeSpeed));
  bindText(document.querySelector('#compact-speed'), () => formatMeasurement('speed', routeSpeed));
  bindAttribute(speedBadge, 'title', () => currentTrack.movingAverageSpeedKmh
    ? t('route.recordedSpeed', { speed: formatMeasurement('speed', routeSpeed) })
    : routeSpeed ? t('route.estimatedSpeed', { speed: formatMeasurement('speed', routeSpeed) }) : t('route.noSpeed'));
  updatePageLanguage();
  drawMap(currentTrack);
  if (currentTrack.hasElevation) drawProfile(currentTrack);
  renderSourceInfo(analysisSources || { gpx: 'SUCCESS', valhalla: 'PENDING', openStreetMap: 'PENDING' });
  document.querySelector('#zoom-back').disabled = true;
  document.querySelector('#zoom-reset').disabled = true;
  setActivePoint(0);
}

function renderUnavailableTrack(track) {
  document.querySelector('#track-name').classList.remove('inline-loading', 'is-loading');
  bindText(document.querySelector('#track-name'), () => track.title || t('common.unnamed'));
  bindText(document.querySelector('#compact-track-name'), () => track.title || t('common.unnamed'));
  bindText(document.querySelector('#route-state-note'), () => track.analysisNote || t(track.status === 'PROCESSING' ? 'sources.waiting' : 'sources.failed'));
  document.querySelector('#route-state-note').hidden = false;
  document.querySelector('#route-state-note').classList.toggle('is-processing', track.status === 'PROCESSING');
  const metrics = track.summary?.metrics || track.metrics;
  document.querySelector('.route-metrics').hidden = !metrics;
  if (metrics) {
    const type = routeTypeDefinition(track.routeType);
    document.querySelector('#route-type-metric').innerHTML = `${routeTypeIcon(type.id)}<b>${htmlMessage(`activity.${type.id}`)}</b>`;
    bindText(document.querySelector('#distance'), () => metrics.distanceKm == null ? '—'
      : number(distanceValue(metrics.distanceKm, preferences.value), preferences.value));
    bindText(document.querySelector('#ascent'), () => metrics.ascentM == null ? '—'
      : number(elevationValue(metrics.ascentM, preferences.value), { ...preferences.value, digits: 0 }));
    bindText(document.querySelector('#descent'), () => metrics.descentM == null ? '—'
      : number(elevationValue(metrics.descentM, preferences.value), { ...preferences.value, digits: 0 }));
    bindText(document.querySelector('#duration'), () => formatDuration(metrics.estimatedDurationMs)[0]);
    bindText(document.querySelector('#duration-unit'), () => t('common.hour'));
    bindText(document.querySelector('#average-speed-badge'), () => metrics.effectiveSpeedKmh == null ? '—'
      : formatMeasurement('speed', metrics.effectiveSpeedKmh));
  }
  document.querySelector('.route-workspace').hidden = !track.summary;
  if (track.summary) setDetailedView(track.status === 'PROCESSING' ? 'loading' : 'failed');
}

function renderBasicTrackHeader(track) {
  document.querySelector('#track-name').classList.remove('inline-loading', 'is-loading');
  bindText(document.querySelector('#track-name'), () => track.title || t('common.unnamed'));
  bindText(document.querySelector('#compact-track-name'), () => track.title || t('common.unnamed'));
  const type = routeTypeDefinition(track.routeType);
  for (const selector of ['#route-type-metric', '#compact-route-type-metric']) {
    const element = document.querySelector(selector);
    element.innerHTML = `${routeTypeIcon(type.id)}<b>${htmlMessage(`activity.${type.id}`)}</b>`;
    bindAttribute(element, 'aria-label', () => t('route.typeValue', { type: routeTypeDefinition(type.id).label }));
  }
  const metrics = track.summary?.metrics || track.metrics;
  document.querySelector('.route-metrics').hidden = !metrics;
  if (metrics) {
    const distance = () => metrics.distanceKm == null ? '—'
      : number(distanceValue(metrics.distanceKm, preferences.value), preferences.value);
    const elevation = (value) => value == null ? '—'
      : number(elevationValue(value, preferences.value), { ...preferences.value, digits: 0 });
    for (const selector of ['#distance', '#compact-distance']) bindText(document.querySelector(selector), distance);
    for (const selector of ['#ascent', '#compact-ascent']) bindText(document.querySelector(selector), () => elevation(metrics.ascentM));
    for (const selector of ['#descent', '#compact-descent']) bindText(document.querySelector(selector), () => elevation(metrics.descentM));
    const duration = () => metrics.estimatedDurationMs == null ? '—' : formatDuration(metrics.estimatedDurationMs)[0];
    for (const selector of ['#duration', '#compact-duration']) bindText(document.querySelector(selector), duration);
    for (const selector of ['#duration-unit', '#compact-duration-unit']) bindText(document.querySelector(selector), () => t('common.hour'));
    const speed = () => metrics.effectiveSpeedKmh == null ? '—' : formatMeasurement('speed', metrics.effectiveSpeedKmh);
    for (const selector of ['#average-speed-badge', '#compact-speed']) bindText(document.querySelector(selector), speed);
    bindAttribute(document.querySelector('#average-speed-badge'), 'title', () => metrics.effectiveSpeedKmh == null
      ? t('route.noSpeed') : t('route.estimatedSpeed', { speed: speed() }));
  }
  updatePageLanguage();
  document.querySelector('.route-workspace').hidden = !track.summary;
  document.querySelector('#route-state-note').hidden = true;
  if (track.summary) {
    const hasRoadSummary = Object.values(track.summary.distributions).some((items) => items.length);
    document.querySelector('.surface-section').hidden = !hasRoadSummary;
    document.querySelector('.route-tabs a[href="#way-types"]').hidden = !hasRoadSummary;
    const hasTerrainSummary = track.resultKind !== 'DIAGNOSTIC'
      || track.summary.climbs.length || track.summary.descents.length;
    document.querySelector('.climbs-section').hidden = !hasTerrainSummary;
    document.querySelector('.route-tabs a[href="#climbs"]').hidden = !hasTerrainSummary;
    renderClimbs(track.summary);
    renderPointsOfInterest(track.summary.pointsOfInterest);
    renderSurfaces(track.summary);
    renderSourceInfo(track.summary.analysisSources);
    bindText(document.querySelector('#profile-ascent'), () => metrics.ascentM == null ? '—' : formatMeasurement('elevation', metrics.ascentM, { digits: 0 }));
    bindText(document.querySelector('#profile-descent'), () => metrics.descentM == null ? '—' : formatMeasurement('elevation', metrics.descentM, { digits: 0 }));
    bindText(document.querySelector('#min-label'), () => metrics.minElevationM == null ? '—' : formatMeasurement('elevation', metrics.minElevationM));
    bindText(document.querySelector('#max-label'), () => metrics.maxElevationM == null ? '—' : formatMeasurement('elevation', metrics.maxElevationM));
    setDetailedView('loading');
  }
}

function setDetailedView(state) {
  const ready = state === 'ready';
  for (const selector of ['#map', '.map-mode', '#map-note', '#hover-readout', '.profile-toolbar', '#profile-wrap']) {
    document.querySelector(selector).hidden = !ready;
  }
  for (const legend of document.querySelectorAll('.profile-card .route-legend')) {
    legend.hidden = !ready || legend.id !== `${profileColorMode}-legend`;
  }
  for (const selector of ['#map-load-state', '#profile-load-state']) {
    const element = document.querySelector(selector);
    element.hidden = ready;
    element.classList.toggle('is-processing', state === 'loading');
    if (!ready) bindText(element, () => t(state === 'loading' ? 'common.loadingRoute' : 'errors.fileUnavailable'));
  }
  document.querySelectorAll('[data-surface-filter],[data-waytype-filter],[data-quality-filter],[data-terrain-range]')
    .forEach((control) => { control.disabled = !ready || control.dataset.summaryEmpty === 'true'; });
  document.querySelectorAll('[data-poi-index]').forEach((control) => { control.disabled = !ready; });
  if (ready) map.invalidateSize();
}

async function loadPublicTrack(trackId, retries = 0) {
  publicTrackId = trackId;
  publicTrackData = null;
  publicTrackOwnershipVerified = false;
  currentTrack = null;
  const response = await trackApi.publicTrack(trackId);
  if (!response.ok) {
    renderUnavailableTrack({ title: t('tracks.notFound'), analysisNote: t('tracks.checkLink') });
    return;
  }
  const { data } = await response.json();
  publicTrackData = data;
  renderBasicTrackHeader(data);
  renderExternalTrackLinks(document.querySelector('#external-track-links'), data.externalLinks);
  const linksSection = document.querySelector('#external-track-links-section');
  linksSection.hidden = availableExternalTrackLinks(data.externalLinks).length === 0;
  document.querySelector('#external-track-links-nav').hidden = linksSection.hidden;
  renderTrackAttribution();
  const download = document.querySelector('#download-track');
  download.href = data.downloadUrl || '#';
  download.hidden = !data.downloadUrl;
  if (!data.analysisUrl) {
    renderUnavailableTrack(data.status === 'READY' ? { ...data, analysisNote: t('errors.fileUnavailable') } : data);
    return;
  }
  try {
    const analysisResponse = await trackApi.analysis(data.analysisUrl);
    if (!analysisResponse.ok) throw new Error('Track analysis unavailable');
    const detail = await analysisResponse.json();
    if (detail.revision !== data.revision && retries < 2) return loadPublicTrack(trackId, retries + 1);
    if (detail.revision !== data.revision) throw new Error('Track revision changed');
    const analysis = { ...detail.analysis, ...data.metrics, name: data.title };
    renderTrack(analysis, { analysisSources: data.analysisSources, routeType: data.routeType });
  } catch {
    renderUnavailableTrack({ ...data, analysisNote: t('errors.fileUnavailable') });
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
  if (event.target.files[0]) {
    document.querySelector('#upload-dialog').hidden = true;
    uploadFlow.uploadFile(event.target.files[0]);
  }
  event.target.value = '';
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-auth-upload]') || !currentUser) return;
  document.querySelector('#upload-dialog').hidden = false;
  document.querySelector('#upload-dropzone').focus();
});
document.querySelector('#close-upload-dialog').addEventListener('click', () => {
  document.querySelector('#upload-dialog').hidden = true;
});
const uploadDropzone = document.querySelector('#upload-dropzone');
uploadDropzone.addEventListener('dragover', (event) => { event.preventDefault(); uploadDropzone.classList.add('is-dragging'); });
uploadDropzone.addEventListener('dragleave', () => uploadDropzone.classList.remove('is-dragging'));
uploadDropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  uploadDropzone.classList.remove('is-dragging');
  if (currentUser && event.dataTransfer.files[0]) {
    document.querySelector('#upload-dialog').hidden = true;
    uploadFlow.uploadFile(event.dataTransfer.files[0]);
  }
});
document.querySelector('#close-processing').addEventListener('click', () => {
  uploadFlow.stop();
  document.querySelector('#processing-overlay').hidden = true;
});
document.querySelector('#finish-processing').addEventListener('click', async () => {
  document.querySelector('#processing-overlay').hidden = true;
  if (isMyTracksPage) await loadMyTracks({ reset: true });
});
document.querySelector('#open-uploaded-track').addEventListener('click', (event) => {
  setButtonLoading(event.currentTarget, true);
  window.location.assign(`/tracks/${event.currentTarget.dataset.trackId}`);
});
document.querySelector('#edit-upload-title').addEventListener('click', () => {
  uploadFlow.setUploadMetadataEditing('#upload-title-row', true);
  document.querySelector('#upload-track-title').focus();
});
document.querySelector('#cancel-upload-title').addEventListener('click', () => {
  uploadFlow.setUploadMetadataEditing('#upload-title-row', false);
  uploadFlow.renderUploadMetadata();
});
document.querySelector('#edit-upload-links').addEventListener('click', () => {
  uploadFlow.setUploadMetadataEditing('#upload-links-row', true);
  document.querySelector('#upload-links-form input').focus();
});
document.querySelector('#cancel-upload-links').addEventListener('click', () => {
  uploadFlow.setUploadMetadataEditing('#upload-links-row', false);
  uploadFlow.renderUploadMetadata();
});

document.addEventListener('change', async (event) => {
  const input = event.target.closest('.route-type-dropdown input[type="radio"]');
  if (!input) return;
  const dropdown = input.closest('.route-type-dropdown');
  setRouteTypeDropdown(dropdown, input.value);
  dropdown.open = false;
  if (dropdown.id === 'upload-route-type') await uploadFlow.saveUploadMetadata({ routeType: input.value });
});

document.addEventListener('pointerdown', (event) => {
  closeRouteTypeDropdownsOutside(event.target);
});
document.addEventListener('keydown', (event) => {
  closeRouteTypeDropdownOnEscape(event);
}, true);

document.querySelector('#upload-title-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (await uploadFlow.saveUploadMetadata({ title: document.querySelector('#upload-track-title').value }, event.submitter)) uploadFlow.setUploadMetadataEditing('#upload-title-row', false);
});
document.querySelector('#upload-links-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const links = Object.fromEntries(['komoot', 'strava', 'garmin', 'rideWithGps'].map((service) => [service, formData.get(service)]));
  if (await uploadFlow.saveUploadMetadata({ links }, event.submitter)) uploadFlow.setUploadMetadataEditing('#upload-links-row', false);
});
document.querySelector('#retry-processing').addEventListener('click', (event) => uploadFlow.retryProcessing(event.currentTarget));

document.querySelector('#track-search').addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = document.querySelector('#track-query').value.trim();
  const pathname = isFavoriteTracksPage ? '/favorite-tracks' : '/my-tracks';
  const nextUrl = query ? `${pathname}?query=${encodeURIComponent(query)}` : pathname;
  window.history.replaceState(null, '', nextUrl);
  await withButtonLoading(event.submitter, () => loadMyTracks({ reset: true }));
});
const trackQueryInput = document.querySelector('#track-query');
const trackSearchClear = document.querySelector('#track-search-clear');
trackQueryInput.addEventListener('input', () => { trackSearchClear.hidden = !trackQueryInput.value; });
trackSearchClear.addEventListener('click', () => {
  cancelTrackSearch({ input: trackQueryInput, history: window.history, reload: loadMyTracks, pathname: isFavoriteTracksPage ? '/favorite-tracks' : '/my-tracks' });
  trackSearchClear.hidden = true;
  trackQueryInput.focus();
});
document.querySelector('#load-more-tracks').addEventListener('click', (event) => withButtonLoading(event.currentTarget, () => loadMyTracks()));
document.querySelector('#select-all-tracks').addEventListener('click', () => {
  const checkboxes = [...document.querySelectorAll('[data-track-select]')];
  const select = checkboxes.some((checkbox) => !checkbox.checked);
  checkboxes.forEach((checkbox) => { checkbox.checked = select; });
  updateBulkDeleteButton();
});
document.querySelector('#bulk-delete-tracks').addEventListener('click', () => {
  const tracks = selectedTrackCards();
  if (!tracks.length) return;
  managedTrackId = null;
  openTracksDeleteConfirmation(tracks);
});
document.querySelector('#edit-track').addEventListener('click', () => openTrackEditor({
  id: publicTrackId,
  title: document.querySelector('#edit-track-title').value,
  speedKmh: speedDraft.canonical,
  routeType: publicTrackData?.routeType,
  externalLinks: publicTrackData?.externalLinks,
}));
document.querySelector('#cancel-track-edit').addEventListener('click', () => document.querySelector('#edit-track-dialog').close());
document.querySelector('#edit-track-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  speedDraft.update(speedInput.value, preferences.value);
  if (!speedDraft.valid) {
    const validation = document.querySelector('#edit-track-error');
    bindText(validation, () => errorMessage({ code: 'INVALID_TRACK_SPEED' }));
    validation.hidden = false;
    return;
  }
  const error = document.querySelector('#edit-track-error');
  error.hidden = true;
  try {
    await withButtonLoading(event.submitter, async () => {
      const response = await trackApi.update({ id: managedTrackId, details: {
        title: document.querySelector('#edit-track-title').value,
        speedKmh: speedDraft.canonical,
        routeType: selectedRouteType(document.querySelector('#edit-track-route-type')),
        externalLinks: externalLinksFromEditor(),
      } });
      const payload = await response.json();
      if (!response.ok) {
        bindText(error, () => errorMessage(payload?.error));
        error.hidden = false;
        return;
      }
      document.querySelector('#edit-track-dialog').close();
      if (isMyTracksPage) {
        await loadMyTracks({ reset: true });
      } else {
        managedTrackTitle = payload.data.title;
        publicTrackData = payload.data;
        renderExternalTrackLinks(document.querySelector('#external-track-links'), payload.data.externalLinks);
        const linksSection = document.querySelector('#external-track-links-section');
        linksSection.hidden = availableExternalTrackLinks(payload.data.externalLinks).length === 0;
        document.querySelector('#external-track-links-nav').hidden = linksSection.hidden;
        await loadPublicTrack(publicTrackId);
      }
    });
  } catch (saveError) {
    bindText(error, () => errorMessage(saveError));
    error.hidden = false;
  }
});
document.querySelector('#replacement-gpx').addEventListener('change', (event) => {
  if (event.target.files[0]) {
    document.querySelector('#edit-track-dialog').close();
    uploadFlow.replaceTrackFile(event.target.files[0], managedTrackId);
  }
  event.target.value = '';
});
document.querySelector('.source-popover').addEventListener('click', async (event) => {
  if (!event.target.closest('.source-retry')) return;
  await uploadFlow.retryExisting(publicTrackId);
});
document.querySelector('#delete-track').addEventListener('click', () => openTrackDeleteConfirmation({
  id: publicTrackId,
  title: managedTrackTitle || currentTrack?.name || t('tracks.thisTrack'),
}));
document.querySelector('#cancel-track-delete').addEventListener('click', () => document.querySelector('#confirm-delete-dialog').close());
document.querySelector('#confirm-track-delete').addEventListener('click', async () => {
  const button = document.querySelector('#confirm-track-delete');
  const error = document.querySelector('#delete-track-error');
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
    document.querySelector('#confirm-delete-dialog').close();
    if (isTrackCollectionPage) await loadMyTracks({ reset: true });
    else window.location.assign('/my-tracks');
  } catch (deleteError) {
    bindText(error, () => errorMessage(deleteError));
    error.hidden = false;
  } finally {
    setButtonLoading(button, false);
  }
});

document.querySelector('#track-list').addEventListener('click', (event) => {
  const action = event.target.closest('[data-track-action]');
  if (!action) return;
  const card = action.closest('.track-card');
  const track = { id: card.dataset.trackId, title: card.dataset.trackTitle, speedKmh: Number(card.dataset.trackSpeed) };
  if (action.dataset.trackAction === 'edit') openTrackEditorFromList(track, action);
  if (action.dataset.trackAction === 'delete') openTrackDeleteConfirmation(track);
  if (action.dataset.trackAction === 'unsave' && isFavoriteTracksPage) {
    managedTrackId = null;
    openTracksDeleteConfirmation([track]);
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
    const toast = document.querySelector('#toast');
    bindText(toast, () => t('notification.favoriteFailed'));
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2500);
  } finally {
    setButtonLoading(button, false);
  }
}
document.querySelector('#track-list').addEventListener('change', (event) => {
  if (event.target.matches('[data-track-select]')) updateBulkDeleteButton();
});

document.querySelector('#share-track')?.addEventListener('click', async (event) => {
  if (!publicTrackId) return;
  const button = event.currentTarget;
  const toast = document.querySelector('#toast');
  setButtonLoading(button, true);
  try {
    await copyPublicTrackLink({ trackId: publicTrackId, origin: window.location.origin, clipboard: navigator.clipboard });
    bindText(toast, () => t('notification.copied'));
  } catch {
    bindText(toast, () => t('notification.copyFailed'));
  } finally {
    setButtonLoading(button, false);
  }
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
});

document.querySelector('#save-track')?.addEventListener('click', async () => {
  if (!currentUser) {
    window.location.assign('/api/auth/google');
    return;
  }
  if (!publicTrackId) return;
  const button = document.querySelector('#save-track');
  const saved = button.getAttribute('aria-pressed') === 'true';
  setButtonLoading(button, true);
  try {
    const response = await trackApi.setSaved({ id: publicTrackId, saved: !saved });
    if (!response.ok) throw new Error();
    setSavedButton(!saved);
  } catch {
    const toast = document.querySelector('#toast');
    bindText(toast, () => t('notification.favoriteFailed'));
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2500);
  } finally {
    setButtonLoading(button, false);
  }
});

if (isTrackCollectionPage) {
  trackQueryInput.value = new URLSearchParams(window.location.search).get('query') || '';
  trackSearchClear.hidden = !trackQueryInput.value;
}
if (pathPublicTrackId) {
  initMap();
  setColorMode('map', mapColorMode);
  setColorMode('profile', profileColorMode);
}
if (isHomePage) loadHomepageTracks();
restoreSession();
if (pathPublicTrackId) loadPublicTrack(pathPublicTrackId);

function updatePageLanguage() {
  document.documentElement.lang = preferences.value.language;
  document.title = currentTrack?.name ? `${currentTrack.name} — GetGPX` : t(isNotFoundPage ? 'notFound.title' : isMyTracksPage ? 'common.myTracks' : isFavoriteTracksPage ? 'common.favorites' : 'app.title');
}
const speedInput = document.querySelector('#edit-track-speed');
let speedDraft = createSpeedDraft(20);
function setSpeedDraft(value) {
  speedDraft = createSpeedDraft(value);
  speedInput.value = speedDraft.display(preferences.value);
}
function refreshSpeedInput(previous) {
  if (previous) speedDraft.update(speedInput.value, previous);
  speedInput.value = speedDraft.display(preferences.value);
  speedInput.dataset.min = String(distanceValue(1, preferences.value));
  speedInput.dataset.max = String(distanceValue(50, preferences.value));
  speedInput.dataset.step = String(distanceValue(0.1, preferences.value));
  bindAttribute(speedInput, 'aria-description', () => errorMessage({ code: 'INVALID_TRACK_SPEED' }));
}
speedInput.addEventListener('input', () => speedDraft.update(speedInput.value, preferences.value));
bindText(document.querySelector('#speed-input-label'), () => t('edit.speed', { unit: currentUnit('speed') }));
setupPreferencesControl(document, { blockedReason: () => {
  const processing = document.querySelector('#processing-overlay');
  if (!processing.hidden && document.querySelector('#close-processing').hidden) return 'preferences.blockedProcessing';
  const editDialog = document.querySelector('#edit-track-dialog');
  if (editDialog.open && editDialog.querySelector('form')?.dataset.dirty === 'true') return 'preferences.blockedEdits';
  if (document.querySelector('#upload-title-form:not([hidden])')?.dataset.dirty === 'true' ||
      document.querySelector('#upload-links-form:not([hidden])')?.dataset.dirty === 'true') return 'preferences.blockedEdits';
  return null;
} });
for (const form of document.querySelectorAll('#edit-track-form, #upload-title-form, #upload-links-form')) {
  form.addEventListener('input', () => { form.dataset.dirty = 'true'; });
  form.addEventListener('change', () => { form.dataset.dirty = 'true'; });
  form.addEventListener('reset', () => { delete form.dataset.dirty; });
}
document.querySelector('#edit-track-dialog').addEventListener('close', () => { delete document.querySelector('#edit-track-form').dataset.dirty; });
refreshSpeedInput();
updatePageLanguage();
if (new URLSearchParams(window.location.search).get('auth') === 'error') {
  const toast = document.querySelector('#toast');
  bindText(toast, () => t('errors.auth'));
  toast.classList.add('visible');
}
