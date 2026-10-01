import { htmlMessage, messageAttribute, t, unitMarkup } from './i18n.js';
import { renderAuthControl } from './auth-ui.js';
import { renderHomePage } from './home-page-ui.js';
import { renderNotFoundPage } from './not-found-ui.js';
import { renderPreferencesControl } from './preferences-ui.js';
import { renderOwnerTrackActions } from './route-actions-ui.js';
import { renderTrackUploadDialogs } from './track-upload-ui.js';
import { renderRouteTypeDropdown, routeTypeIcon } from './route-type-ui.js';
import { renderExternalLinkFields } from './external-track-links-ui.js';

export function renderAppShell({ isHomePage, isNotFoundPage, isTrackCollectionPage, isFavoriteTracksPage }) {
  return `
  <header class="topbar">
    <div class="topbar-inner"><a class="brand" href="/" ${messageAttribute('aria-label', 'header.home')}><img class="brand-mark" src="/getgpx-mark-30.png" srcset="/getgpx-mark-60.png 2x, /getgpx-mark-90.png 3x" alt="" width="30" height="30" /><span>GETGPX</span></a>
    <section class="compact-route-header" ${messageAttribute('aria-label', 'header.currentRoute')} aria-hidden="true">
      <strong id="compact-track-name"></strong>
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
  ${isHomePage ? renderHomePage([], { loading: true }) : ''}
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
          <h1 id="track-name"></h1>
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
    <div class="route-workspace" hidden>
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
            <p class="detail-load-state is-processing" id="profile-load-state" role="status">${htmlMessage('common.loadingRoute')}</p>
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
      <aside class="map-column"><section class="map-shell" ${messageAttribute('aria-label', 'map.route')}><p class="detail-load-state is-processing" id="map-load-state" role="status">${htmlMessage('common.loadingRoute')}</p><div id="map" hidden></div><div class="map-mode segmented-control" ${messageAttribute('aria-label', 'map.color')} hidden><button class="active" type="button" data-color-scope="map" data-color-mode="gradient">${htmlMessage('common.gradient')}</button><button type="button" data-color-scope="map" data-color-mode="surface">${htmlMessage('common.surface')}</button><button type="button" data-color-scope="map" data-color-mode="waytype">${htmlMessage('common.roadType')}</button><button type="button" data-color-scope="map" data-color-mode="quality">${htmlMessage('common.quality')}</button></div><div class="map-note" id="map-note" hidden></div><div class="hover-readout" id="hover-readout" aria-live="polite" hidden><b>${htmlMessage('map.hover')}</b></div></section></aside>
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
      <div><button type="button" id="cancel-track-edit">${htmlMessage('common.cancel')}</button><button class="button-primary" type="submit">${htmlMessage('common.save')}</button></div>
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
  <footer class="api-footer"><a href="/api/docs">${htmlMessage('api.documentation')}</a></footer>
  <div class="toast" id="toast" role="alert"></div>
`;

}
