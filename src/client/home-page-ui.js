import { t, htmlMessage, messageAttribute, metricMarkup } from './i18n.js';
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  })[character]);
}

export function renderPublicTracks(publicTracks, loading = false) {
  if (loading) return `<p class="home-note inline-loading" role="status"><span class="loading-spinner" aria-hidden="true"></span>${htmlMessage('tracks.loading')}</p>`;
  if (!publicTracks.length) return `<p class="home-note">${htmlMessage('home.noTracks')}</p>`;
  return publicTracks.map((track) => `
    <a class="home-track-link" href="${escapeHtml(track.url)}">
      <span><strong>${escapeHtml(track.title || t('common.unnamed'))}</strong><small>${htmlMessage('home.routeDistance', { distance: { measurement: 'distance', value: track.distanceKm } })}</small></span><b aria-hidden="true">↗</b>
    </a>`).join('');
}

export function renderHomeRouteCard(primary, loading = false) {
  const primaryUrl = primary?.url || '#public-tracks';
  const primaryTitle = primary?.title || t('common.routeUnavailable');
  return `<article class="home-route-card" ${messageAttribute('aria-label', 'home.publicRoute', { title: primaryTitle })}>
    <header><div><span>${htmlMessage('home.publicKicker')}</span><h2>${loading ? `<span class="inline-loading"><span class="loading-spinner" aria-hidden="true"></span>${htmlMessage('common.loadingRoute')}</span>` : escapeHtml(primaryTitle)}</h2></div><a href="${escapeHtml(primaryUrl)}" ${messageAttribute('aria-label', 'home.open', { title: primaryTitle })}>↗</a></header>
    <a class="home-map-link" href="${escapeHtml(primaryUrl)}" ${messageAttribute('aria-label', 'home.openMap', { title: primaryTitle })}><div id="home-example-map" aria-hidden="true"></div><span class="home-map-loading inline-loading" id="home-map-loading" role="status"><span class="loading-spinner" aria-hidden="true"></span>${htmlMessage('home.mapLoading')}</span></a>
    <dl class="home-route-stats"><div><dt>${htmlMessage('common.distance')}</dt><dd>${metricMarkup('distance', primary?.distanceKm)}</dd></div><div><dt>${htmlMessage('common.ascent')}</dt><dd>${metricMarkup('elevation', primary?.ascentM)}</dd></div><div><dt>${htmlMessage('common.points')}</dt><dd>${Number.isSafeInteger(primary?.pointsOfInterestCount) ? primary.pointsOfInterestCount : '—'}</dd></div></dl>
  </article>`;
}

export function renderHomePage(publicTracks = [], { loading = false } = {}) {
  const primary = publicTracks[0];
  const primaryUrl = primary?.url || '#public-tracks';
  return `
    <main class="home-page" id="home">
      <nav class="home-nav" ${messageAttribute('aria-label', 'home.navigation')}>
        <a href="#passport">${htmlMessage('home.features')}</a><a href="#platforms">${htmlMessage('home.platforms')}</a><a href="#public-tracks">${htmlMessage('home.publicTracks')}</a>
      </nav>

      <section class="home-hero" aria-labelledby="home-title">
        <div class="home-hero-copy">
          <p class="route-kicker">${htmlMessage('home.kicker')}</p>
          <h1 id="home-title">${htmlMessage('home.oneTrack')}<br />${htmlMessage('home.oneLink')}</h1>
          <p class="home-lede">${htmlMessage('home.lede')}</p>
          <p class="home-note">${htmlMessage('home.noRegistration')}</p>
          <div class="home-actions">
            <a class="home-primary" data-home-guest href="/api/auth/google">${htmlMessage('home.publish')} <span aria-hidden="true">↗</span></a>
            <button class="home-primary" data-home-author data-auth-upload type="button" hidden>${htmlMessage('common.upload')} <span aria-hidden="true">＋</span></button>
            <a class="home-secondary" id="home-open-real" href="${escapeHtml(primaryUrl)}" ${loading ? 'aria-disabled="true"' : ''}>${htmlMessage('home.openReal')}</a>
          </div>
        </div>
        ${renderHomeRouteCard(primary, loading)}
      </section>

      <section class="home-proof" ${messageAttribute('aria-label', 'home.mainFeatures')}><div><strong>${htmlMessage('home.noAccount')}</strong><span>${htmlMessage('home.viewDownload')}</span></div><div><strong>${htmlMessage('home.original')}</strong><span>${htmlMessage('home.directLink')}</span></div><div><strong>${htmlMessage('home.openData')}</strong><span>${htmlMessage('home.forAnalysis')}</span></div></section>

      <section class="home-section home-passport" id="passport" aria-labelledby="passport-title">
        <div class="home-section-heading"><p class="route-kicker">${htmlMessage('home.passportKicker')}</p><div><h2 id="passport-title">${htmlMessage('home.beforeStart')}</h2><p>${htmlMessage('home.realInterface')}</p></div></div>
        <nav class="home-preview-nav" ${messageAttribute('aria-label', 'home.fragments')}><a href="#preview-map">${htmlMessage('common.map')}</a><a href="#preview-profile">${htmlMessage('common.profile')}</a><a href="#preview-pois">${htmlMessage('common.points')}</a><a href="#preview-surface">${htmlMessage('common.surfaces')}</a><a href="#preview-climbs">${htmlMessage('common.climbs')}</a></nav>
        <div class="home-preview-rail" ${messageAttribute('aria-label', 'home.trackFeatures')}>
          <article class="home-preview-card home-preview-map" id="preview-map"><header><span>${htmlMessage('map.route')}</span><small>${htmlMessage('home.realTrack')}</small></header><div id="home-preview-example-map" aria-hidden="true"></div><div class="home-preview-map-copy"><strong>${htmlMessage('home.onMap')}</strong><p>${htmlMessage('home.mapColors')}</p><a href="#preview-profile" ${messageAttribute('aria-label', 'home.next')}>→</a></div></article>
          <article class="home-preview-card" id="preview-profile"><header><span>${htmlMessage('common.elevationProfile')}</span><small>${htmlMessage('home.ascentValue', { elevation: { measurement: 'elevation', value: 3810 } })}</small></header><div class="home-mini-profile" aria-hidden="true"><svg viewBox="0 0 600 230" preserveAspectRatio="none"><path class="home-profile-fill" d="M0 205 L0 174 35 156 70 166 110 130 145 145 180 116 220 124 260 80 300 112 340 64 380 86 420 38 460 96 500 74 545 138 600 122 L600 205Z"/><path class="home-profile-line" d="M0 174 35 156 70 166 110 130 145 145 180 116 220 124 260 80 300 112 340 64 380 86 420 38 460 96 500 74 545 138 600 122"/></svg><div><span>${metricMarkup('distance', 0)}</span><span>${metricMarkup('distance', 100)}</span><span>${metricMarkup('distance', 201.7)}</span></div></div><footer><b>${metricMarkup('elevation', 506)}</b><span>${htmlMessage('home.maximumElevation')}</span><a href="#preview-pois" ${messageAttribute('aria-label', 'home.next')}>→</a></footer></article>
          <article class="home-preview-card" id="preview-pois"><header><span>${htmlMessage('common.pois')}</span><small>${htmlMessage('poi.count', { count: 25 })}</small></header><div class="home-mini-pois"><span><b>7</b><i>${htmlMessage('poi.waterExample')}<small>${htmlMessage('poi.water')}</small></i></span><span><b>11</b><i>${htmlMessage('poi.foodExample')}<small>${htmlMessage('poi.food')}</small></i></span><span><b>14</b><i>${htmlMessage('poi.aidExample')}<small>${htmlMessage('poi.aid')}</small></i></span></div><footer><b>${htmlMessage('home.poiKinds')}</b><a href="#preview-surface" ${messageAttribute('aria-label', 'home.next')}>→</a></footer></article>
          <article class="home-preview-card" id="preview-surface"><header><span>${htmlMessage('common.routeInfo')}</span><small>OpenStreetMap</small></header><div class="home-mini-surfaces"><div><span style="--share:55%;--tone:#8b6b43">${htmlMessage('surface.unpaved')} <b>55%</b></span></div><div><span style="--share:17%;--tone:#9b875d">${htmlMessage('surface.paved')} <b>17%</b></span></div><div><span style="--share:15%;--tone:#c59043">${htmlMessage('surface.gravel')} <b>15%</b></span></div><div><span style="--share:13%;--tone:#6f7771">${htmlMessage('surface.asphalt')} <b>13%</b></span></div></div><footer><b>${htmlMessage('home.analyzedDistance', { distance: { measurement: 'distance', value: 201.7 } })}</b><a href="#preview-climbs" ${messageAttribute('aria-label', 'home.next')}>→</a></footer></article>
          <article class="home-preview-card" id="preview-climbs"><header><span>${htmlMessage('common.terrain')}</span><small>${htmlMessage('home.automatic')}</small></header><div class="home-mini-climbs"><span><b>#1</b><strong>${htmlMessage('terrain.category', { category: 4 })}</strong><i>${metricMarkup('number', 3.4)} % · ${metricMarkup('elevation', 168)} · ${metricMarkup('distance', 4.12, { digits: 2 })}</i></span><span><b>#2</b><strong>${htmlMessage('terrain.category', { category: 3 })}</strong><i>${metricMarkup('number', 7)} % · ${metricMarkup('elevation', 260)} · ${metricMarkup('distance', 3.02, { digits: 2 })}</i></span><span><b>#3</b><strong>${htmlMessage('terrain.category', { category: 3 })}</strong><i>${metricMarkup('number', 4.4)} % · ${metricMarkup('elevation', 266)} · ${metricMarkup('distance', 4.57, { digits: 2 })}</i></span></div><footer><a href="#preview-surface" ${messageAttribute('aria-label', 'home.previous')}>←</a><b>${htmlMessage('home.terrainCount', { climbs: 9, descents: 7 })}</b></footer></article>
        </div>
        <p class="home-scroll-hint">${htmlMessage('home.scroll')}</p>
      </section>

      <section class="home-section home-platforms" id="platforms" aria-labelledby="platforms-title"><div class="home-platform-copy"><p class="route-kicker">${htmlMessage('home.independentKicker')}</p><h2 id="platforms-title">${htmlMessage('home.oneApp')}</h2><p>${htmlMessage('home.linksDescription')}</p><span class="home-soon">${htmlMessage('home.addWhileEditing')}</span></div><div class="home-platform-list" ${messageAttribute('aria-label', 'home.supportedPlatforms')}><span>Komoot <b>↗</b></span><span>Strava <b>↗</b></span><span>Garmin <b>↗</b></span><span>Ride with GPS <b>↗</b></span></div></section>

      <section class="home-section home-tracks" id="public-tracks" aria-labelledby="public-tracks-title"><div class="home-section-heading"><p class="route-kicker">${htmlMessage('home.examples')}</p><div><h2 id="public-tracks-title">${htmlMessage('home.openPublic')}</h2><p>${htmlMessage('home.publicDescription')}</p></div></div><div class="home-track-links">${renderPublicTracks(publicTracks, loading)}</div></section>

      <section class="home-library" aria-labelledby="library-title"><div><p class="route-kicker">${htmlMessage('home.library')}</p><h2 id="library-title">${htmlMessage('home.atHand')}</h2><p>${htmlMessage('home.searchReady')}</p></div><span class="home-soon">${htmlMessage('home.soon')}</span></section>
      <section class="home-final" aria-labelledby="home-final-title"><p class="route-kicker">${htmlMessage('home.haveGpx')}</p><h2 id="home-final-title">${htmlMessage('home.goodLink')}</h2><a class="home-primary" data-home-guest href="/api/auth/google">${htmlMessage('home.publish')} <span aria-hidden="true">↗</span></a><button class="home-primary" data-home-author data-auth-upload type="button" hidden>${htmlMessage('common.upload')} <span aria-hidden="true">＋</span></button></section>
    </main>`;
}
