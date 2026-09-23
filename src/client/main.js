import { renderPreferencesControl, setupPreferencesControl } from './preferences-ui.js';
import { distanceValue, elevationValue, number, createSpeedDraft } from './measurements.js';
import { neutralAnalysis, poiName, poiType, roadLabel } from './analysis-presentation.js';
import { errorMessage, errorFromPayload } from './errors-ui.js';
import { t, bindText, bindAttribute, htmlMessage, messageAttribute, preferences, formatMeasurement, currentUnit, unitMarkup, percent, escapeHtml } from './i18n.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { renderAuthControl } from './auth-ui.js';
import { renderHomePage } from './home-page-ui.js';
import { renderNotFoundPage } from './not-found-ui.js';
import { bulkDeleteSummary, bulkSelectionState, cancelTrackSearch, createTrackCard } from './my-tracks-ui.js';
import { closeOverflowMenuOnOutsideClick, copyPublicTrackLink, favoriteButtonState, publicTrackIdFromPath, renderOwnerTrackActions } from './route-actions-ui.js';
import { shouldShowCompactRouteHeader } from './sticky-route-header-ui.js';
import { formatTrackAttribution, resolveTrackUploader } from './track-meta-ui.js';
import { renderTrackUploadDialogs, uploadMetadataHint, uploadMetadataPayload } from './track-upload-ui.js';
import { closeRouteTypeDropdownOnEscape, closeRouteTypeDropdownsOutside, renderRouteTypeDropdown, routeTypeDefinition, routeTypeIcon, selectedRouteType, setRouteTypeDropdown } from './route-type-ui.js';
import { availableExternalTrackLinks, renderExternalLinkFields, renderExternalTrackLinks } from './external-track-links-ui.js';
import { detectClimbs, detectDescents } from './domain/climbs.js';
import { calculateSegmentGrades } from './domain/gradient.js';
import { emptyPoiSelection, updatePoiSelection } from './domain/poi-selection.js';
import { areaPathFromCoordinates, elevationGainLoss, nearestRoutePointIndex, pointIndexAtRatio, pointerRatioInPlot, profileFocusVisibility, profileRangePosition, visibleRangeIndices } from './domain/profile-math.js';
import { colorRunsForMode, highlightRunsForFilter, profileColorRuns } from './domain/route-color.js';
import { isClosedRoute } from './domain/route-shape.js';
import { classifySurface, classifyWayType, roadQualityCategories, summarizeRoadQuality, summarizeSurfaces, summarizeWayTypes, surfaceCategories, surfaceEmphasis, wayTypeCategories } from './domain/surface.js';

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
let activeUploadMetadata = null;
const isMyTracksPage = window.location.pathname === '/my-tracks';
const isFavoriteTracksPage = window.location.pathname === '/favorite-tracks';
const isTrackCollectionPage = isMyTracksPage || isFavoriteTracksPage;
const isHomePage = window.location.pathname === '/';
const pathPublicTrackId = publicTrackIdFromPath(window.location.pathname);
const isNotFoundPage = !isHomePage && !isTrackCollectionPage && !pathPublicTrackId;
let homepageTracks = [];
if (isHomePage) {
  try {
    const response = await fetch('/api/tracks/homepage', { headers: { accept: 'application/json' } });
    const payload = await response.json();
    if (response.ok && Array.isArray(payload.data)) homepageTracks = payload.data;
  } catch {
    homepageTracks = [];
  }
}
let myTracksCursor = null;
let myTracksLoading = false;
let publicTrackId = null;
let publicTrackData = null;
let publicTrackOwnershipVerified = false;
let managedTrackId = null;
let managedTrackTitle = '';
let tracksPendingDeletion = [];

app.innerHTML = `
  <header class="topbar">
    <div class="topbar-inner"><a class="brand" href="/" ${messageAttribute('aria-label', 'header.home')}><img class="brand-mark" src="/getgpx-mark-30.png" srcset="/getgpx-mark-60.png 2x, /getgpx-mark-90.png 3x" alt="" width="30" height="30" /><span>GETGPX</span></a>
    <section class="compact-route-header" ${messageAttribute('aria-label', 'header.currentRoute')} aria-hidden="true">
      <strong id="compact-track-name">${htmlMessage('common.loadingRoute')}</strong>
      <div class="compact-route-metrics" ${messageAttribute('aria-label', 'header.metrics')}>
        <span class="route-type-metric" id="compact-route-type-metric" ${messageAttribute('aria-label', 'common.routeType')}>${routeTypeIcon('other')}<b>${htmlMessage('activity.other')}</b></span>
        <span class="distance-metric" ${messageAttribute('aria-label', 'route.distance')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M7 9l-3 3 3 3m10-6 3 3-3 3"/></svg><b id="compact-distance">—</b> ${unitMarkup('distance')}</span>
        <span class="elevation-metric" ${messageAttribute('aria-label', 'route.ascent')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17 17 5m-7 0h7v7"/></svg><b id="compact-ascent">—</b> ${unitMarkup('elevation')} <small>${htmlMessage('common.ascentLower')}</small></span>
        <span class="elevation-metric" ${messageAttribute('aria-label', 'route.descent')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 7 12 12m0-7v7h-7"/></svg><b id="compact-descent">—</b> ${unitMarkup('elevation')} <small>${htmlMessage('common.descentLower')}</small></span>
        <span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><b id="compact-duration">—</b> <i id="compact-duration-unit"></i></span>
        <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.6 18a8 8 0 1 1 12.8 0M12 13l4-4"/><path d="M4 18h16"/></svg><b id="compact-speed">— ${unitMarkup('speed')}</b></span>
      </div>
    </section>
    <div class="topbar-actions">${renderPreferencesControl()}<button class="upload-button" data-auth-upload type="button" hidden><span aria-hidden="true">＋</span> ${htmlMessage('common.upload')}</button><div id="auth-control">${renderAuthControl(null)}</div></div></div>
    <input id="gpx-file" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden />
  </header>
  ${isHomePage ? renderHomePage(homepageTracks) : ''}
  ${isNotFoundPage ? renderNotFoundPage() : ''}
  <main class="my-tracks-page" id="my-tracks" ${isTrackCollectionPage ? '' : 'hidden'}>
    <header class="my-tracks-header">
      <div><p class="route-kicker">${htmlMessage('tracks.collection')}</p><h1>${isFavoriteTracksPage ? t('common.favorites') : t('common.myTracks')}</h1><p>${isFavoriteTracksPage ? t('tracks.favoriteDescription') : t('tracks.description')}</p></div>
      <button class="my-tracks-upload" ${isFavoriteTracksPage ? '' : 'data-auth-upload'} type="button" ${isFavoriteTracksPage ? 'hidden disabled' : 'hidden'}><span aria-hidden="true">＋</span> ${htmlMessage('common.upload')}</button>
    </header>
    <form class="track-search" id="track-search" role="search"><label for="track-query">${htmlMessage('tracks.searchLabel')}</label><div class="track-search-controls"><span class="track-search-input"><input id="track-query" name="query" type="search" maxlength="100" ${messageAttribute('placeholder', 'tracks.searchPlaceholder')} autocomplete="off" /><button class="track-search-clear" id="track-search-clear" type="button" ${messageAttribute('aria-label', 'tracks.clearSearch')} ${messageAttribute('title', 'tracks.clearSearch')} hidden>×</button></span><button class="track-search-submit" type="submit">${htmlMessage('tracks.search')}</button></div></form>
    <div class="track-list-toolbar"><button class="select-all-tracks" id="select-all-tracks" type="button" disabled>${htmlMessage('common.selectAll')}</button><button class="bulk-delete-tracks" id="bulk-delete-tracks" type="button" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></svg><span>${isFavoriteTracksPage ? t('common.remove') : t('common.delete')}</span></button></div>
    <p class="my-tracks-message" id="my-tracks-message" role="status">${htmlMessage(isFavoriteTracksPage ? 'tracks.loginFavorites' : 'tracks.loginOwn')}</p>
    <section class="track-list" id="track-list" aria-live="polite"></section>
    <button class="load-more-tracks" id="load-more-tracks" type="button" hidden>${htmlMessage('tracks.more')}</button>
  </main>
  <main class="page" id="route" ${isTrackCollectionPage || isHomePage || isNotFoundPage ? 'hidden' : ''}>
    <header class="route-header">
      <p class="route-state-note" id="route-state-note" hidden></p>
      <div class="route-heading">
        <div class="route-heading-copy">
          <h1 id="track-name">${htmlMessage('common.loadingRoute')}</h1>
        </div>
        <div class="track-attribution" id="track-attribution" hidden>
          <span class="track-attribution-avatar" aria-hidden="true"><img id="track-uploader-avatar" alt="" hidden /><svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0"/></svg></span>
          <span id="track-attribution-text"></span>
        </div>
      </div>
      <div class="route-summary-row">
        <div class="route-metrics" ${messageAttribute('aria-label', 'route.metrics')}>
          <span class="route-type-metric" id="route-type-metric" ${messageAttribute('aria-label', 'common.routeType')}>${routeTypeIcon('other')}<b>${htmlMessage('activity.other')}</b></span>
          <span class="distance-metric" ${messageAttribute('aria-label', 'route.distance')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M7 9l-3 3 3 3m10-6 3 3-3 3"/></svg><b id="distance">—</b> ${unitMarkup('distance')}</span>
          <span class="elevation-metric" ${messageAttribute('aria-label', 'route.ascent')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17 17 5m-7 0h7v7"/></svg><b id="ascent">—</b> ${unitMarkup('elevation')} <small>${htmlMessage('common.ascentLower')}</small></span>
          <span class="elevation-metric" ${messageAttribute('aria-label', 'route.descent')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 7 12 12m0-7v7h-7"/></svg><b id="descent">—</b> ${unitMarkup('elevation')} <small>${htmlMessage('common.descentLower')}</small></span>
          <span class="moving-metric"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><b id="duration">—</b> <i id="duration-unit"></i></span>
          <span class="moving-metric"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.6 18a8 8 0 1 1 12.8 0M12 13l4-4"/><path d="M4 18h16"/></svg><abbr id="average-speed-badge" ${messageAttribute('title', 'route.speedTitle')}>— ${unitMarkup('speed')}</abbr></span>
        </div>
        <div class="route-actions" ${messageAttribute('aria-label', 'route.actions')}>
          <button class="primary-action" id="save-track" type="button" ${messageAttribute('aria-label', 'common.addFavorite')} aria-pressed="false" ${messageAttribute('title', 'common.addFavorite')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg><span>${htmlMessage('route.favorite')}</span></button>
          <button id="share-track" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>${htmlMessage('route.share')}</button>
          <a id="download-track" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/></svg>${htmlMessage('route.download')}</a>
          <span class="owner-track-actions" id="owner-track-actions" hidden><details class="route-overflow"><summary ${messageAttribute('aria-label', 'route.more')}><span aria-hidden="true">•••</span></summary><div>${renderOwnerTrackActions()}</div></details></span>
        </div>
      </div>
    </header>
    <div class="route-workspace">
      <div class="route-content">
        <nav class="section-nav route-tabs" ${messageAttribute('aria-label', 'route.contents')}>
          <a href="#external-track-links-section" id="external-track-links-nav" hidden>${htmlMessage('route.services')}</a><a href="#points-of-interest" id="poi-nav-link" hidden>${htmlMessage('common.pois')}</a><a href="#details">${htmlMessage('common.elevationProfile')}</a><a href="#way-types">${htmlMessage('common.routeInfo')}</a><a href="#climbs">${htmlMessage('common.terrain')}</a>
        </nav>
        <section class="content-section external-track-links-section" id="external-track-links-section" aria-labelledby="external-track-links-title" hidden>
          <div class="compact-heading"><h2 id="external-track-links-title">${htmlMessage('route.serviceHeading')}</h2></div>
          <div class="external-track-links" id="external-track-links"></div>
        </section>
        <section class="content-section poi-section" id="points-of-interest" aria-labelledby="poi-title" hidden>
          <div class="compact-heading"><h2 id="poi-title">${htmlMessage('common.pois')}</h2><p id="poi-count"></p></div>
          <div class="analysis-card poi-list" id="poi-list"></div>
        </section>
        <section class="content-section profile-section" id="details">
          <div class="compact-heading"><h2>${htmlMessage('common.elevationProfile')}</h2></div>
          <div class="analysis-card profile-card">
            <div class="profile-toolbar"><div class="profile-mode segmented-control" ${messageAttribute('aria-label', 'profile.color')}><button class="active" type="button" data-color-scope="profile" data-color-mode="gradient">${htmlMessage('common.gradient')}</button><button type="button" data-color-scope="profile" data-color-mode="surface">${htmlMessage('common.surface')}</button><button type="button" data-color-scope="profile" data-color-mode="waytype">${htmlMessage('common.roadType')}</button><button type="button" data-color-scope="profile" data-color-mode="quality">${htmlMessage('common.quality')}</button></div><div class="profile-toolbar-actions"><div class="profile-overlay-settings"><button class="profile-settings-trigger" id="profile-settings-trigger" type="button" ${messageAttribute('aria-label', 'profile.overlaySettings')} aria-expanded="false" aria-controls="profile-settings-popover"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="M19 13.2v-2.4l-2-.7a7 7 0 0 0-.6-1.4l.9-1.9-1.7-1.7-1.9.9a7 7 0 0 0-1.4-.6l-.7-2H9.2l-.7 2a7 7 0 0 0-1.4.6l-1.9-.9-1.7 1.7.9 1.9a7 7 0 0 0-.6 1.4l-2 .7v2.4l2 .7a7 7 0 0 0 .6 1.4l-.9 1.9 1.7 1.7 1.9-.9a7 7 0 0 0 1.4.6l.7 2h2.4l.7-2a7 7 0 0 0 1.4-.6l1.9.9 1.7-1.7-.9-1.9a7 7 0 0 0 .6-1.4l2-.7Z"/></svg></button><div class="profile-settings-popover" id="profile-settings-popover" role="dialog" aria-labelledby="profile-settings-title" hidden><strong id="profile-settings-title">${htmlMessage('profile.showOverlay')}</strong><div class="profile-focus-placement segmented-control" ${messageAttribute('aria-label', 'profile.highlightPosition')}><button type="button" data-profile-focus-placement="profile" aria-pressed="false">${htmlMessage('profile.onProfile')}</button><button class="active" type="button" data-profile-focus-placement="ribbon" aria-pressed="true">${htmlMessage('profile.onRibbon')}</button></div></div></div><div class="profile-actions segmented-control"><button id="zoom-back" type="button" disabled>${htmlMessage('profile.back')}</button><button id="zoom-reset" type="button" disabled>${htmlMessage('common.cancel')}</button></div></div></div>
            <div class="profile-wrap" id="profile-wrap" tabindex="0" role="slider" ${messageAttribute('aria-label', 'profile.position')} aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
              <svg id="profile" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ebc35" stop-opacity=".24"/><stop offset="1" stop-color="#7ebc35" stop-opacity=".02"/></linearGradient></defs><g id="grid"></g><g id="climb-bands"></g><path id="profile-area" class="profile-area"></path><g id="profile-gradient-area"></g><g id="gradient-line"></g><g id="profile-focus-profile"></g><g id="surface-ribbon"></g><g id="profile-focus-ribbon"></g><rect id="profile-selection" class="profile-selection" x="0" y="18" width="0" height="246"></rect><line id="profile-cursor" class="profile-cursor" y1="18" y2="264"></line><circle id="profile-dot" class="profile-dot" r="6"></circle></svg>
              <div class="profile-pois" id="profile-pois" aria-hidden="true"></div>
              <div class="axis" id="axis"></div>
            </div>
            <div class="gradient-legend route-legend" id="gradient-legend"><span><i class="grade-down"></i>${htmlMessage('common.descentLower')}</span><span><i class="grade-easy"></i>0–3%</span><span><i class="grade-mid"></i>3–6%</span><span><i class="grade-hard"></i>6–9%</span><span><i class="grade-steep"></i>9–12%</span><span><i class="grade-max"></i>12%+</span></div>
            <div class="surface-legend route-legend" id="surface-legend" hidden></div><div class="waytype-legend route-legend" id="waytype-legend" hidden></div><div class="quality-legend route-legend" id="quality-legend" hidden></div>
            <div class="profile-summary"><span><b id="profile-ascent">—</b> ${unitMarkup('elevation')}<small>${htmlMessage('common.ascent')}</small></span><span><b id="profile-descent">—</b> ${unitMarkup('elevation')}<small>${htmlMessage('common.descent')}</small></span><span><b id="max-label">—</b><small>${htmlMessage('profile.maximum')}</small></span><span><b id="min-label">—</b><small>${htmlMessage('profile.minimum')}</small></span></div>
          </div>
        </section>
        <section class="content-section surface-section" id="way-types" aria-labelledby="surface-title">
          <div class="compact-heading"><div class="surface-title-row"><h2 id="surface-title">${htmlMessage('common.routeInfo')}</h2><div class="source-help"><button class="source-help-trigger" type="button" ${messageAttribute('aria-label', 'sources.title')} aria-haspopup="dialog" aria-controls="source-popover">?</button><div class="source-popover" id="source-popover" role="dialog" ${messageAttribute('aria-label', 'sources.title')}><strong>${htmlMessage('sources.title')}</strong><ul><li data-analysis-source="gpx"><span class="source-state" aria-hidden="true">…</span><span><b>GPX</b><small>${htmlMessage('sources.gpx')}</small></span></li><li data-analysis-source="valhalla"><span class="source-state" aria-hidden="true">…</span><span><b>Valhalla</b><small>${htmlMessage('sources.valhalla')}</small></span><button class="source-retry" data-retry-source="valhalla" type="button" ${messageAttribute('aria-label', 'sources.retryValhalla')} ${messageAttribute('title', 'common.retry')} hidden>↻</button></li><li data-analysis-source="openStreetMap"><span class="source-state" aria-hidden="true">…</span><span><b>OpenStreetMap</b><small>${htmlMessage('sources.osm')}</small></span><button class="source-retry" data-retry-source="openStreetMap" type="button" ${messageAttribute('aria-label', 'sources.retryOsm')} ${messageAttribute('title', 'common.retry')} hidden>↻</button></li></ul></div></div></div></div>
          <div class="analysis-card">
            <section class="distribution-group"><h3>${htmlMessage('waytype.title')}</h3><div class="distribution-bar" id="way-type-bar" ${messageAttribute('aria-label', 'waytype.distribution')}></div><div class="distribution-list" id="way-type-stats"></div></section>
            <section class="distribution-group"><h3>${htmlMessage('common.surfaces')}</h3><div class="distribution-bar surface-bar" id="surface-bar" ${messageAttribute('aria-label', 'surface.distribution')}></div><div class="distribution-list surface-stats" id="surface-stats"></div></section>
            <section class="distribution-group quality-compact"><h3>${htmlMessage('quality.title')}</h3><div class="distribution-bar" id="quality-bar" ${messageAttribute('aria-label', 'quality.distribution')}></div><div class="distribution-list quality-stats" id="quality-stats"></div></section>
          </div>
        </section>
        <section class="content-section climbs-section" id="climbs" aria-labelledby="climbs-title">
          <div class="compact-heading"><h2 id="climbs-title">${htmlMessage('common.terrain')}</h2><p>${htmlMessage('terrain.automatic')}</p></div>
          <div class="analysis-card terrain-card">
            <div class="terrain-tabs" role="tablist"><button class="active" type="button" data-terrain-tab="climbs">${htmlMessage('common.climbs')} <b id="climbs-count">0</b></button><button type="button" data-terrain-tab="descents">${htmlMessage('common.descents')} <b id="descents-count">0</b></button></div>
            <div class="climbs-list terrain-list" id="climbs-list"></div><div class="descents-list terrain-list" id="descents-list" hidden></div>
          </div>
        </section>
      </div>
      <aside class="map-column"><section class="map-shell" ${messageAttribute('aria-label', 'map.route')}><div id="map"></div><div class="map-mode segmented-control" ${messageAttribute('aria-label', 'map.color')}><button class="active" type="button" data-color-scope="map" data-color-mode="gradient">${htmlMessage('common.gradient')}</button><button type="button" data-color-scope="map" data-color-mode="surface">${htmlMessage('common.surface')}</button><button type="button" data-color-scope="map" data-color-mode="waytype">${htmlMessage('common.roadType')}</button><button type="button" data-color-scope="map" data-color-mode="quality">${htmlMessage('common.quality')}</button></div><div class="map-note" id="map-note"></div><div class="hover-readout" id="hover-readout" aria-live="polite"><b>${htmlMessage('map.hover')}</b></div></section></aside>
    </div>
  </main>
  ${renderTrackUploadDialogs()}
  <input id="replacement-gpx" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden />
  <dialog class="edit-track-dialog" id="edit-track-dialog">
    <form id="edit-track-form">
      <p class="route-kicker">${htmlMessage('edit.kicker')}</p><h2>${htmlMessage('edit.title')}</h2>
      ${renderRouteTypeDropdown({ id: 'edit-track-route-type', name: 'routeType' })}
      <label>${htmlMessage('common.title')}<input id="edit-track-title" name="title" required maxlength="200" /></label>
      <label><span id="speed-input-label"></span><input id="edit-track-speed" name="speedKmh" type="text" inputmode="decimal" required /></label>
      ${renderExternalLinkFields('edit-track')}
      <label class="replace-gpx-control" for="replacement-gpx">${htmlMessage('edit.replace')}</label>
      <p class="form-error" id="edit-track-error" hidden></p>
      <div><button type="button" id="cancel-track-edit">${htmlMessage('common.cancel')}</button><button type="submit">${htmlMessage('common.save')}</button></div>
    </form>
  </dialog>
  <dialog class="confirm-delete-dialog" id="confirm-delete-dialog">
    <form method="dialog">
      <div class="confirm-delete-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></svg></div>
      <div><p class="route-kicker" id="delete-dialog-kicker">${htmlMessage('tracks.deleteKicker')}</p><h2 id="delete-dialog-title">${htmlMessage('tracks.deleteOne')}</h2></div>
      <p id="delete-track-description"></p>
      <ul class="delete-track-list" id="delete-track-list"></ul>
      <p class="form-error" id="delete-track-error" hidden></p>
      <div class="confirm-delete-actions"><button type="button" id="cancel-track-delete">${htmlMessage('common.cancel')}</button><button class="confirm-delete-button" type="button" id="confirm-track-delete">${htmlMessage('common.delete')}</button></div>
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
  const response = await fetch(`/api/tracks/${trackId}/manage`, { headers: { accept: 'application/json' } });
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
  const response = await fetch(`/api/tracks/${trackId}/saved`, { headers: { accept: 'application/json' } });
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
    const response = await fetch(`/api/tracks/${isFavoriteTracksPage ? 'saved' : 'mine'}?${parameters}`, { headers: { accept: 'application/json' } });
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

async function openTrackEditorFromList(track) {
  const response = await fetch(`/api/tracks/${track.id}/manage`, { headers: { accept: 'application/json' } });
  if (!response.ok) return;
  const { data } = await response.json();
  openTrackEditor(data);
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
    const track = homepageTracks[0]?.analysis;
    if (!track?.points?.length) throw new Error('Track unavailable');
    const coordinates = track.points.map((point) => [point.lat, point.lon]);
    [container, previewContainer].filter(Boolean).forEach((mapContainer) => {
      const homeMap = L.map(mapContainer, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(homeMap);
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
  const { ascentM, descentM } = elevationGainLoss(track.points, startIndex, endIndex);
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
  bindText(document.querySelector('#min-label'), () => formatMeasurement('elevation', min));
  bindText(document.querySelector('#max-label'), () => formatMeasurement('elevation', max));
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

function renderSurfaces(track) {
  const summary = summarizeSurfaces(track.points);
  const wayTypes = summarizeWayTypes(track.points);
  const quality = summarizeRoadQuality(track.points);
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
  renderPointsOfInterest(currentTrack.pointsOfInterest);
  if (currentTrack.hasElevation) drawProfile(currentTrack);
  renderClimbs(currentTrack);
  renderSurfaces(currentTrack);
  renderSourceInfo(analysisSources || { gpx: 'SUCCESS', valhalla: 'PENDING', openStreetMap: 'PENDING' });
  document.querySelector('#zoom-back').disabled = true;
  document.querySelector('#zoom-reset').disabled = true;
  setActivePoint(0);
}

function renderUnavailableTrack(track) {
  bindText(document.querySelector('#track-name'), () => track.title || t('common.unnamed'));
  bindText(document.querySelector('#compact-track-name'), () => track.title || t('common.unnamed'));
  bindText(document.querySelector('#route-state-note'), () => track.analysisNote || t(track.status === 'PROCESSING' ? 'sources.waiting' : 'sources.failed'));
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
    renderUnavailableTrack({ title: t('tracks.notFound'), analysisNote: t('tracks.checkLink') });
    return;
  }
  const { data } = await response.json();
  publicTrackData = data;
  renderExternalTrackLinks(document.querySelector('#external-track-links'), data.externalLinks);
  const linksSection = document.querySelector('#external-track-links-section');
  linksSection.hidden = availableExternalTrackLinks(data.externalLinks).length === 0;
  document.querySelector('#external-track-links-nav').hidden = linksSection.hidden;
  renderTrackAttribution();
  const download = document.querySelector('#download-track');
  download.href = data.downloadUrl;
  download.hidden = false;
  if (!data.analysis) {
    renderUnavailableTrack(data);
    return;
  }
  data.analysis.name = data.title;
  renderTrack(data.analysis, { analysisSources: data.analysisSources, routeType: data.routeType });
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
  bindText(message, () => errorMessage(error));
  message.hidden = false;
  const details = document.querySelector('#processing-details');
  details.hidden = false;
  bindText(document.querySelector('#processing-code'), () => /^[A-Z_]{1,50}$/.test(error.code) ? error.code : 'UNKNOWN_ERROR');
  document.querySelector('#retry-processing').hidden = error.code !== 'ENRICHMENT_UNAVAILABLE';
  document.querySelector('#close-processing').hidden = false;
  const status = document.querySelector('#processing-status');
  status.classList.add('is-failed');
  bindText(status.querySelector('strong'), () => t('upload.stopped'));
  bindText(document.querySelector('#processing-status-copy'), () => t('upload.fix'));
}

function renderUploadMetadata() {
  if (!activeUploadMetadata) return;
  document.querySelector('#upload-metadata').hidden = false;
  bindText(document.querySelector('#upload-track-title-value'), () => activeUploadMetadata.title);
  document.querySelector('#upload-track-title').value = activeUploadMetadata.title;
  setRouteTypeDropdown(document.querySelector('#upload-route-type'), activeUploadMetadata.routeType);
  const links = availableExternalTrackLinks(activeUploadMetadata.externalLinks);
  const linksValue = document.querySelector('#upload-links-value');
  if (links.length) renderExternalTrackLinks(linksValue, activeUploadMetadata.externalLinks, null, { inline: true });
  else {
    linksValue.replaceChildren(t('common.noLinks'));
    linksValue.hidden = false;
  }
  const linksForm = document.querySelector('#upload-links-form');
  [...linksForm.elements].forEach((field) => {
    if (field instanceof HTMLInputElement) field.value = activeUploadMetadata.externalLinks[field.name] || '';
  });
}

function setUploadMetadataEditing(rowSelector, editing) {
  const row = document.querySelector(rowSelector);
  row.classList.toggle('is-editing', editing);
  row.querySelector('.upload-metadata-view').hidden = editing;
  row.querySelector('form').hidden = !editing;
}

async function loadUploadMetadata(trackId) {
  if (activeUploadMetadata?.id === trackId) return;
  const response = await fetch(`/api/tracks/${trackId}/manage`, { headers: { accept: 'application/json' } });
  if (!response.ok) return;
  const { data } = await response.json();
  if (activeUploadTrackId !== trackId) return;
  activeUploadMetadata = {
    id: trackId,
    title: data.title,
    speedKmh: data.speedKmh || 20,
    routeType: data.routeType,
    externalLinks: data.externalLinks || {},
  };
  renderUploadMetadata();
}

function showTrackCreated(trackId) {
  const status = document.querySelector('#processing-status');
  status.classList.add('is-complete');
  bindText(status.querySelector('strong'), () => t('upload.complete'));
  bindText(document.querySelector('#processing-status-copy'), () => t('upload.viewReady'));
  bindText(document.querySelector('#upload-metadata-hint'), () => uploadMetadataHint(true));
  document.querySelector('#open-uploaded-track').hidden = false;
  document.querySelector('#finish-processing').hidden = false;
  document.querySelector('#close-processing').hidden = false;
  document.querySelector('#open-uploaded-track').dataset.trackId = trackId;
}

async function pollTrackStatus(trackId) {
  while (activeUploadTrackId === trackId) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    const response = await fetch(`/api/tracks/${trackId}/status`, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(t('errors.status'));
    const { data } = await response.json();
    updateProcessing(data.step);
    if (data.step === 'ENRICHING' || data.status === 'READY') await loadUploadMetadata(trackId);
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
  document.querySelector('#open-uploaded-track').hidden = true;
  document.querySelector('#finish-processing').hidden = true;
  document.querySelector('#close-processing').hidden = true;
  document.querySelector('#upload-metadata').hidden = true;
  document.querySelector('#processing-status').classList.remove('is-complete', 'is-failed');
  bindText(document.querySelector('#processing-status').querySelector('strong'), () => t('upload.processing'));
  bindText(document.querySelector('#processing-status-copy'), () => t('upload.wait'));
  bindText(document.querySelector('#upload-metadata-hint'), () => uploadMetadataHint(false));
  activeUploadMetadata = null;
  processing.hidden = false;
  updateProcessing('UPLOADING');
  try {
    const response = await fetch('/api/tracks', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/gpx+xml',
        'x-gpx-filename': encodeURIComponent(file.name),
        'x-track-type': 'cycling',
      },
      body: file,
    });
    const payload = await response.json();
    if (!response.ok) throw errorFromPayload(payload);
    activeUploadTrackId = payload.data.id;
    updateProcessing(payload.data.step);
    await pollTrackStatus(activeUploadTrackId);
  } catch (uploadError) {
    showProcessingError(uploadError);
  }
}

async function replaceTrackFile(file, trackId = publicTrackId) {
  if (!currentUser || !trackId) return;
  const processing = document.querySelector('#processing-overlay');
  document.querySelector('#processing-error').hidden = true;
  document.querySelector('#processing-details').hidden = true;
  processing.hidden = false;
  updateProcessing('UPLOADING');
  try {
    const response = await fetch(`/api/tracks/${trackId}/file`, {
      method: 'PUT',
      headers: { accept: 'application/json', 'content-type': 'application/gpx+xml', 'x-gpx-filename': encodeURIComponent(file.name) },
      body: file,
    });
    const payload = await response.json();
    if (!response.ok) throw errorFromPayload(payload);
    activeUploadTrackId = trackId;
    updateProcessing(payload.data.step);
    await pollTrackStatus(trackId);
  } catch (replaceError) {
    showProcessingError(replaceError);
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
    uploadFile(event.target.files[0]);
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
    uploadFile(event.dataTransfer.files[0]);
  }
});
document.querySelector('#close-processing').addEventListener('click', () => {
  activeUploadTrackId = null;
  document.querySelector('#processing-overlay').hidden = true;
});
document.querySelector('#finish-processing').addEventListener('click', async () => {
  document.querySelector('#processing-overlay').hidden = true;
  if (isMyTracksPage) await loadMyTracks({ reset: true });
});
document.querySelector('#open-uploaded-track').addEventListener('click', (event) => {
  window.location.assign(`/tracks/${event.currentTarget.dataset.trackId}`);
});
document.querySelector('#edit-upload-title').addEventListener('click', () => {
  setUploadMetadataEditing('#upload-title-row', true);
  document.querySelector('#upload-track-title').focus();
});
document.querySelector('#cancel-upload-title').addEventListener('click', () => {
  setUploadMetadataEditing('#upload-title-row', false);
  renderUploadMetadata();
});
document.querySelector('#edit-upload-links').addEventListener('click', () => {
  setUploadMetadataEditing('#upload-links-row', true);
  document.querySelector('#upload-links-form input').focus();
});
document.querySelector('#cancel-upload-links').addEventListener('click', () => {
  setUploadMetadataEditing('#upload-links-row', false);
  renderUploadMetadata();
});

document.addEventListener('change', async (event) => {
  const input = event.target.closest('.route-type-dropdown input[type="radio"]');
  if (!input) return;
  const dropdown = input.closest('.route-type-dropdown');
  setRouteTypeDropdown(dropdown, input.value);
  dropdown.open = false;
  if (dropdown.id === 'upload-route-type') await saveUploadMetadata({ routeType: input.value });
});

document.addEventListener('pointerdown', (event) => {
  closeRouteTypeDropdownsOutside(event.target);
});
document.addEventListener('keydown', (event) => {
  closeRouteTypeDropdownOnEscape(event);
}, true);

async function saveUploadMetadata({ title, routeType, links }) {
  if (!activeUploadMetadata) return false;
  const payload = uploadMetadataPayload({
    title: title ?? activeUploadMetadata.title,
    speedKmh: activeUploadMetadata.speedKmh,
    routeType: routeType ?? activeUploadMetadata.routeType,
    links: links ?? activeUploadMetadata.externalLinks,
  });
  const error = document.querySelector('#upload-metadata-error');
  error.hidden = true;
  const response = await fetch(`/api/tracks/${activeUploadMetadata.id}`, {
    method: 'PATCH',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const responsePayload = await response.json();
  if (!response.ok) {
    bindText(error, () => errorMessage(responsePayload?.error));
    error.hidden = false;
    return false;
  }
  activeUploadMetadata.title = responsePayload.data.title;
  activeUploadMetadata.routeType = responsePayload.data.routeType;
  activeUploadMetadata.externalLinks = responsePayload.data.externalLinks || {};
  renderUploadMetadata();
  return true;
}

document.querySelector('#upload-title-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (await saveUploadMetadata({ title: document.querySelector('#upload-track-title').value })) setUploadMetadataEditing('#upload-title-row', false);
});
document.querySelector('#upload-links-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const links = Object.fromEntries(['komoot', 'strava', 'garmin', 'rideWithGps'].map((service) => [service, formData.get(service)]));
  if (await saveUploadMetadata({ links })) setUploadMetadataEditing('#upload-links-row', false);
});
document.querySelector('#retry-processing').addEventListener('click', async () => {
  if (!activeUploadTrackId) return;
  const response = await fetch(`/api/tracks/${activeUploadTrackId}/retry-analysis`, { method: 'POST', headers: { accept: 'application/json' } });
  const payload = await response.json();
  if (!response.ok) {
    showProcessingError({ message: errorMessage(payload?.error), code: payload?.error?.code || 'RETRY_FAILED' });
    return;
  }
  document.querySelector('#processing-error').hidden = true;
  document.querySelector('#processing-details').hidden = true;
  document.querySelector('#retry-processing').hidden = true;
  document.querySelector('#close-processing').hidden = true;
  document.querySelector('#processing-status').classList.remove('is-failed');
  bindText(document.querySelector('#processing-status').querySelector('strong'), () => t('upload.processing'));
  bindText(document.querySelector('#processing-status-copy'), () => t('upload.wait'));
  updateProcessing(payload.data.step);
  await pollTrackStatus(activeUploadTrackId);
});

document.querySelector('#track-search').addEventListener('submit', (event) => {
  event.preventDefault();
  const query = document.querySelector('#track-query').value.trim();
  const pathname = isFavoriteTracksPage ? '/favorite-tracks' : '/my-tracks';
  const nextUrl = query ? `${pathname}?query=${encodeURIComponent(query)}` : pathname;
  window.history.replaceState(null, '', nextUrl);
  loadMyTracks({ reset: true });
});
const trackQueryInput = document.querySelector('#track-query');
const trackSearchClear = document.querySelector('#track-search-clear');
trackQueryInput.addEventListener('input', () => { trackSearchClear.hidden = !trackQueryInput.value; });
trackSearchClear.addEventListener('click', () => {
  cancelTrackSearch({ input: trackQueryInput, history: window.history, reload: loadMyTracks, pathname: isFavoriteTracksPage ? '/favorite-tracks' : '/my-tracks' });
  trackSearchClear.hidden = true;
  trackQueryInput.focus();
});
document.querySelector('#load-more-tracks').addEventListener('click', () => loadMyTracks());
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
  const response = await fetch(`/api/tracks/${managedTrackId}`, {
    method: 'PATCH',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      title: document.querySelector('#edit-track-title').value,
      speedKmh: speedDraft.canonical,
      routeType: selectedRouteType(document.querySelector('#edit-track-route-type')),
      externalLinks: externalLinksFromEditor(),
    }),
  });
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
    payload.data.analysis.name = payload.data.title;
    renderTrack(payload.data.analysis, { analysisSources: payload.data.analysisSources, routeType: payload.data.routeType });
  }
});
document.querySelector('#replacement-gpx').addEventListener('change', (event) => {
  if (event.target.files[0]) {
    document.querySelector('#edit-track-dialog').close();
    replaceTrackFile(event.target.files[0], managedTrackId);
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
document.querySelector('#delete-track').addEventListener('click', () => openTrackDeleteConfirmation({
  id: publicTrackId,
  title: managedTrackTitle || currentTrack?.name || t('tracks.thisTrack'),
}));
document.querySelector('#cancel-track-delete').addEventListener('click', () => document.querySelector('#confirm-delete-dialog').close());
document.querySelector('#confirm-track-delete').addEventListener('click', async () => {
  const button = document.querySelector('#confirm-track-delete');
  const error = document.querySelector('#delete-track-error');
  button.disabled = true;
  error.hidden = true;
  const isBulkDelete = managedTrackId === null;
  const response = await fetch(isFavoriteTracksPage ? '/api/tracks/saved' : isBulkDelete ? '/api/tracks' : `/api/tracks/${managedTrackId}`, {
    method: 'DELETE',
    headers: isBulkDelete || isFavoriteTracksPage
      ? { accept: 'application/json', 'content-type': 'application/json' }
      : { accept: 'application/json' },
    body: isBulkDelete || isFavoriteTracksPage ? JSON.stringify({ ids: tracksPendingDeletion.map((track) => track.id) }) : undefined,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    bindText(error, () => errorMessage(payload?.error));
    error.hidden = false;
    button.disabled = false;
    return;
  }
  document.querySelector('#confirm-delete-dialog').close();
  if (isTrackCollectionPage) await loadMyTracks({ reset: true });
  else window.location.assign('/my-tracks');
});

document.querySelector('#track-list').addEventListener('click', (event) => {
  const action = event.target.closest('[data-track-action]');
  if (!action) return;
  const card = action.closest('.track-card');
  const track = { id: card.dataset.trackId, title: card.dataset.trackTitle, speedKmh: Number(card.dataset.trackSpeed) };
  if (action.dataset.trackAction === 'edit') openTrackEditorFromList(track);
  if (action.dataset.trackAction === 'delete') openTrackDeleteConfirmation(track);
  if (action.dataset.trackAction === 'unsave' && isFavoriteTracksPage) {
    managedTrackId = null;
    openTracksDeleteConfirmation([track]);
  }
  if (action.dataset.trackAction === 'favorite' && isMyTracksPage) toggleCardFavorite(action, track);
});

async function toggleCardFavorite(button, track) {
  const wasFavorite = button.getAttribute('aria-pressed') === 'true';
  button.disabled = true;
  try {
    const response = await fetch(`/api/tracks/${track.id}/saved`, { method: wasFavorite ? 'DELETE' : 'PUT', headers: { accept: 'application/json' } });
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
    button.disabled = false;
  }
}
document.querySelector('#track-list').addEventListener('change', (event) => {
  if (event.target.matches('[data-track-select]')) updateBulkDeleteButton();
});

document.querySelector('#share-track')?.addEventListener('click', async () => {
  if (!publicTrackId) return;
  const toast = document.querySelector('#toast');
  try {
    await copyPublicTrackLink({ trackId: publicTrackId, origin: window.location.origin, clipboard: navigator.clipboard });
    bindText(toast, () => t('notification.copied'));
  } catch {
    bindText(toast, () => t('notification.copyFailed'));
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
  button.disabled = true;
  try {
    const response = await fetch(`/api/tracks/${publicTrackId}/saved`, {
      method: saved ? 'DELETE' : 'PUT',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error();
    setSavedButton(!saved);
  } catch {
    const toast = document.querySelector('#toast');
    bindText(toast, () => t('notification.favoriteFailed'));
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2500);
  } finally {
    button.disabled = false;
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
if (isHomePage) initHomeExampleMap();
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
