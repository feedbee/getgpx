import { setupPreferencesControl } from './preferences-ui.js';
import { renderAppShell } from './app-shell.js';
import { createTrackApi } from './track-api.js';
import { createUploadFlow } from './track-upload-flow.js';
import { createTrackCollection } from './track-collection.js';
import { createRouteSummaryView, formatDuration } from './route-page-summary.js';
import { createElevationProfile } from './elevation-profile.js';
import { bindProfileInteractions } from './profile-interactions.js';
import { createRouteFilters } from './route-filters.js';
import { createPoiController } from './poi-controller.js';
import { createActiveRoutePoint } from './active-route-point.js';
import { createTrackDeletion } from './track-delete-ui.js';
import { createTrackEditor } from './track-editor-ui.js';
import { distanceValue, elevationValue, number } from './measurements.js';
import { neutralAnalysis } from './analysis-presentation.js';
import { t, bindText, bindAttribute, htmlMessage, preferences, formatMeasurement } from './i18n.js';
import L from 'leaflet';
import { createRouteMap } from './route-map.js';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { renderAuthControl } from './auth-ui.js';
import { renderHomeRouteCard, renderPublicTracks } from './home-page-ui.js';
import { closeOverflowMenuOnOutsideClick, copyPublicTrackLink, favoriteButtonState, publicTrackIdFromPath } from './route-actions-ui.js';
import { shouldShowCompactRouteHeader } from './sticky-route-header-ui.js';
import { formatTrackAttribution, resolveTrackUploader } from './track-meta-ui.js';
import { setButtonLoading } from './button-loading-ui.js';
import { closeRouteTypeDropdownOnEscape, closeRouteTypeDropdownsOutside, routeTypeDefinition, routeTypeIcon, setRouteTypeDropdown } from './route-type-ui.js';
import { availableExternalTrackLinks, renderExternalTrackLinks } from './external-track-links-ui.js';
import { detectClimbs, detectDescents } from './domain/climbs.js';
import { calculateSegmentGrades } from './domain/gradient.js';
import { nearestRoutePointIndex } from './domain/profile-math.js';
import { classifySurface } from './domain/surface.js';

const app = document.querySelector('#app');
const trackApi = createTrackApi();
let currentTrack;
let viewRange = [0, 1];
let zoomHistory = [];
let mapColorMode = 'gradient';
let profileColorMode = 'gradient';
let profileFocusPlacement = 'ribbon';
let currentUser = null;
const isMyTracksPage = window.location.pathname === '/my-tracks';
const isFavoriteTracksPage = window.location.pathname === '/favorite-tracks';
const isTrackCollectionPage = isMyTracksPage || isFavoriteTracksPage;
const isHomePage = window.location.pathname === '/';
const pathPublicTrackId = publicTrackIdFromPath(window.location.pathname);
const isNotFoundPage = !isHomePage && !isTrackCollectionPage && !pathPublicTrackId;
let homepageTracks = [];
let publicTrackId = null;
const uploadFlow = createUploadFlow({ trackApi, isAuthenticated: () => Boolean(currentUser), getPublicTrackId: () => publicTrackId });
let publicTrackData = null;
let publicTrackOwnershipVerified = false;

app.innerHTML = renderAppShell({ isHomePage, isNotFoundPage, isTrackCollectionPage, isFavoriteTracksPage });
const collection = createTrackCollection({ trackApi, isMyTracksPage, isFavoriteTracksPage,
  getCurrentUser: () => currentUser, onEdit: (track, button) => trackEditor.openFromList(track, button), onDelete: (track) => trackDeletion.openOne(track),
  onDeleteMany: (tracks) => trackDeletion.openMany(tracks) });
const trackDeletion = createTrackDeletion({ trackApi, collection, isFavoriteTracksPage, isTrackCollectionPage,
  getPublicTrackId: () => publicTrackId, getTrackTitle: () => trackEditor.managedTitle || currentTrack?.name,
  windowRef: window });
const trackEditor = createTrackEditor({ trackApi, uploadFlow, getPublicTrackId: () => publicTrackId,
  getPublicTrackData: () => publicTrackData, onUpdated: async (data) => {
    if (isMyTracksPage) return collection.load({ reset: true });
    publicTrackData = data;
    renderExternalTrackLinks(document.querySelector('#external-track-links'), data.externalLinks);
    const linksSection = document.querySelector('#external-track-links-section');
    linksSection.hidden = availableExternalTrackLinks(data.externalLinks).length === 0;
    document.querySelector('#external-track-links-nav').hidden = linksSection.hidden;
    await loadPublicTrack(publicTrackId);
  } });
const activePoint = createActiveRoutePoint({ getTrack: () => currentTrack,
  chartCoordinates: (point) => elevationProfile.chartCoordinates(point),
  onMapPoint: (point) => routeMap.setActivePoint(point) });
const poiController = createPoiController({ getTrack: () => currentTrack, getActivePointIndex: () => activePoint.index,
  onActivePoint: activePoint.set, onMapSelection: (index) => routeMap.renderPoiSelection(index) });
const routeSummaryView = createRouteSummaryView({ updatePageLanguage, renderPointsOfInterest: poiController.renderPointsOfInterest, setDetailedView,
  onFiltersRendered: refreshRouteFocus });
const routeFilters = createRouteFilters({ getTrack: () => currentTrack, onChange: refreshRouteFocus });
const routeMap = createRouteMap({ getPoiSelection: () => poiController.selection, getMapColorMode: () => mapColorMode,
  getRouteFilter: routeFilters.selectedRouteFilter, getTerrainRange: routeFilters.selectedTerrainRange,
  onActivePoint: activePoint.set, onPointContext: activePoint.setPointContext, onPoiHover: poiController.hover,
  onPoiLeave: poiController.leave, onPoiToggle: poiController.toggle });
const elevationProfile = createElevationProfile({ getTrack: () => currentTrack, getViewRange: () => viewRange,
  getSummaryMetrics: () => publicTrackData?.summary?.metrics, getColorMode: () => profileColorMode,
  getFocusPlacement: () => profileFocusPlacement, getRouteFilter: routeFilters.selectedRouteFilter,
  getTerrainRange: routeFilters.selectedTerrainRange });

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
  if (isTrackCollectionPage) collection.load({ reset: true });
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
  trackEditor.setFields(data);
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

function refreshRouteFocus() {
  if (!currentTrack) return;
  routeMap.draw(currentTrack, { fit: false });
  if (currentTrack.hasElevation) elevationProfile.drawProfile(currentTrack);
  activePoint.set(activePoint.index);
  routeFilters.renderControls();
}

function setViewRange(range, { remember = true } = {}) {
  const normalized = [Math.min(...range), Math.max(...range)];
  if (normalized[1] - normalized[0] < 2) return;
  if (remember) zoomHistory.push([...viewRange]);
  viewRange = normalized;
  elevationProfile.resetMetrics();
  elevationProfile.drawProfile(currentTrack);
  const isFullRange = viewRange[0] === 0 && viewRange[1] === currentTrack.points.length - 1;
  if (isFullRange) {
    routeMap.clearRangeFocus();
    routeMap.fitFullRange();
  } else routeMap.fitRange(currentTrack, viewRange);
  document.querySelector('#zoom-back').disabled = zoomHistory.length === 0;
  document.querySelector('#zoom-reset').disabled = isFullRange;
  activePoint.set(viewRange[0]);
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
  if (scope === 'map') routeMap.draw(currentTrack, { fit: false });
  if (scope === 'profile' && currentTrack.hasElevation) elevationProfile.drawProfile(currentTrack);
  activePoint.set(activePoint.index);
}

function setProfileFocusPlacement(placement) {
  profileFocusPlacement = placement;
  document.querySelectorAll('[data-profile-focus-placement]').forEach((button) => {
    const active = button.dataset.profileFocusPlacement === placement;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (currentTrack?.hasElevation) elevationProfile.drawProfile(currentTrack);
}

function renderTrack(rawTrack, { analysisSources, routeType = 'other' } = {}) {
  document.querySelector('#track-name').classList.remove('inline-loading', 'is-loading');
  document.querySelector('.route-metrics').hidden = false;
  document.querySelector('.route-workspace').hidden = false;
  document.querySelector('#route-state-note').hidden = true;
  setDetailedView('ready');
  routeMap.clearRangeFocus();
  routeFilters.reset();
  currentTrack = neutralAnalysis(rawTrack);
  poiController.reset();
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
  elevationProfile.resetMetrics();
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
  routeMap.draw(currentTrack);
  if (currentTrack.hasElevation) elevationProfile.drawProfile(currentTrack);
  routeSummaryView.renderSourceInfo(analysisSources || { gpx: 'SUCCESS', valhalla: 'PENDING', openStreetMap: 'PENDING' });
  document.querySelector('#zoom-back').disabled = true;
  document.querySelector('#zoom-reset').disabled = true;
  activePoint.set(0);
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
  if (ready) routeMap.invalidateSize();
}

async function loadPublicTrack(trackId, retries = 0) {
  publicTrackId = trackId;
  publicTrackData = null;
  publicTrackOwnershipVerified = false;
  currentTrack = null;
  const response = await trackApi.publicTrack(trackId);
  if (!response.ok) {
    routeSummaryView.renderUnavailableTrack({ title: t('tracks.notFound'), analysisNote: t('tracks.checkLink') });
    return;
  }
  const { data } = await response.json();
  publicTrackData = data;
  routeSummaryView.renderBasicTrackHeader(data);
  renderExternalTrackLinks(document.querySelector('#external-track-links'), data.externalLinks);
  const linksSection = document.querySelector('#external-track-links-section');
  linksSection.hidden = availableExternalTrackLinks(data.externalLinks).length === 0;
  document.querySelector('#external-track-links-nav').hidden = linksSection.hidden;
  renderTrackAttribution();
  const download = document.querySelector('#download-track');
  download.href = data.downloadUrl || '#';
  download.hidden = !data.downloadUrl;
  if (!data.analysisUrl) {
    routeSummaryView.renderUnavailableTrack(data.status === 'READY' ? { ...data, analysisNote: t('errors.fileUnavailable') } : data);
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
    routeSummaryView.renderUnavailableTrack({ ...data, analysisNote: t('errors.fileUnavailable') });
  }
}

bindProfileInteractions({ getTrack: () => currentTrack, getViewRange: () => viewRange,
  getPoiSelection: () => poiController.selection, getActivePointIndex: () => activePoint.index,
  onHoverPoi: poiController.hover, onLeavePoi: poiController.leave, onTogglePoi: poiController.toggle,
  onActivePoint: activePoint.set, onPointContext: activePoint.setPointContext, onViewRange: setViewRange });
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

document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeUserMenu(); });
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
  if (isMyTracksPage) await collection.load({ reset: true });
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

document.querySelector('.source-popover').addEventListener('click', async (event) => {
  if (!event.target.closest('.source-retry')) return;
  await uploadFlow.retryExisting(publicTrackId);
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

if (pathPublicTrackId) {
  routeMap.init();
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
trackEditor.refreshSpeedInput();
updatePageLanguage();
if (new URLSearchParams(window.location.search).get('auth') === 'error') {
  const toast = document.querySelector('#toast');
  bindText(toast, () => t('errors.auth'));
  toast.classList.add('visible');
}
