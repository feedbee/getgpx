import { t, bindText, bindAttribute, htmlMessage, formatMeasurement, preferences } from './i18n.js';
import { distanceValue, elevationValue, number } from './measurements.js';
import { routeTypeDefinition, routeTypeIcon } from './route-type-ui.js';
import { renderClimbs, renderSurfaces } from './route-summary-ui.js';
import { summarizeSurfaces, summarizeWayTypes, summarizeRoadQuality } from './domain/surface.js';

export function formatDuration(ms) {
  if (!ms) return ['—', ''];
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);
  return [`${hours}:${String(minutes).padStart(2, '0')}`, t('common.hour')];
}

export function createRouteSummaryView({ documentRef = document, updatePageLanguage,
  renderPointsOfInterest, setDetailedView, onFiltersRendered, onDistributionsRendered = () => {} }) {
  let useSelection = true;
  let rangeContext = null;
  const selectionControl = documentRef.querySelector('#distribution-selection-control');
  const selectionToggle = documentRef.querySelector('#distribution-selection-toggle');
  selectionControl.hidden = true;
  selectionToggle.checked = useSelection;
  selectionToggle.addEventListener('change', () => {
    useSelection = selectionToggle.checked;
    if (rangeContext) renderRangeDistributions(...rangeContext);
  });

  function clearRangeContext() {
    rangeContext = null;
    selectionControl.hidden = true;
  }

  function renderRangeDistributions(track, range, fullSummary) {
    rangeContext = [track, [...range], fullSummary];
    const [startIndex, endIndex] = range;
    const isFullRange = startIndex === 0 && endIndex === track.points.length - 1;
    selectionControl.hidden = isFullRange;
    selectionToggle.checked = useSelection;
    if ((isFullRange || !useSelection) && fullSummary?.distributions) {
      renderSurfaces(fullSummary, { documentRef, onFiltersRendered: onDistributionsRendered });
      return;
    }
    // Keep the first selected point as the boundary, excluding the segment before it.
    const points = useSelection ? track.points.slice(startIndex, endIndex + 1) : track.points;
    renderSurfaces({ distributions: {
      surfaces: summarizeSurfaces(points),
      wayTypes: summarizeWayTypes(points),
      roadQualities: summarizeRoadQuality(points),
    } }, { documentRef, onFiltersRendered: onDistributionsRendered });
  }

  function renderSourceInfo(sources = {}) {
    const symbols = { SUCCESS: '✓', FAILED: '×', PENDING: '…' };
    const labels = { SUCCESS: 'sources.available', FAILED: 'sources.unavailable', PENDING: 'sources.processing' };
    documentRef.querySelectorAll('[data-analysis-source]').forEach((row) => {
      const status = sources[row.dataset.analysisSource] || 'PENDING';
      row.dataset.sourceStatus = status;
      bindText(row.querySelector('.source-state'), () => symbols[status]);
      bindAttribute(row.querySelector('.source-state'), 'aria-label', () => t(labels[status]));
    });
  }

  function renderUnavailableTrack(track) {
    clearRangeContext();
    documentRef.querySelector('#track-name').classList.remove('inline-loading', 'is-loading');
    bindText(documentRef.querySelector('#track-name'), () => track.title || t('common.unnamed'));
    bindText(documentRef.querySelector('#compact-track-name'), () => track.title || t('common.unnamed'));
    bindText(documentRef.querySelector('#route-state-note'), () => track.analysisNote || t(track.processing?.status === 'PROCESSING' ? 'sources.waiting' : 'sources.failed'));
    documentRef.querySelector('#route-state-note').hidden = false;
    documentRef.querySelector('#route-state-note').classList.toggle('is-processing', track.processing?.status === 'PROCESSING');
    const metrics = track.metrics;
    documentRef.querySelector('.route-metrics').hidden = !metrics;
    if (metrics) {
      const type = routeTypeDefinition(track.routeType);
      documentRef.querySelector('#route-type-metric').innerHTML = `${routeTypeIcon(type.id)}<b>${htmlMessage(`activity.${type.id}`)}</b>`;
      bindText(documentRef.querySelector('#distance'), () => metrics.distanceKm == null ? '—'
        : number(distanceValue(metrics.distanceKm, preferences.value), preferences.value));
      bindText(documentRef.querySelector('#ascent'), () => metrics.ascentM == null ? '—'
        : number(elevationValue(metrics.ascentM, preferences.value), { ...preferences.value, digits: 0 }));
      bindText(documentRef.querySelector('#descent'), () => metrics.descentM == null ? '—'
        : number(elevationValue(metrics.descentM, preferences.value), { ...preferences.value, digits: 0 }));
      bindText(documentRef.querySelector('#duration'), () => metrics.estimatedDurationMs == null ? '—' : formatDuration(metrics.estimatedDurationMs)[0]);
      bindText(documentRef.querySelector('#duration-unit'), () => t('common.hour'));
      bindText(documentRef.querySelector('#average-speed-badge'), () => metrics.speedKmh == null ? '—'
        : formatMeasurement('speed', metrics.speedKmh));
    }
    documentRef.querySelector('.route-workspace').hidden = !track.revision;
    if (track.revision) setDetailedView(track.processing?.status === 'PROCESSING' ? 'loading' : 'failed');
  }

  function renderBasicTrackHeader(track) {
    clearRangeContext();
    documentRef.querySelector('#track-name').classList.remove('inline-loading', 'is-loading');
    bindText(documentRef.querySelector('#track-name'), () => track.title || t('common.unnamed'));
    bindText(documentRef.querySelector('#compact-track-name'), () => track.title || t('common.unnamed'));
    const type = routeTypeDefinition(track.routeType);
    for (const selector of ['#route-type-metric', '#compact-route-type-metric']) {
      const element = documentRef.querySelector(selector);
      element.innerHTML = `${routeTypeIcon(type.id)}<b>${htmlMessage(`activity.${type.id}`)}</b>`;
      bindAttribute(element, 'aria-label', () => t('route.typeValue', { type: routeTypeDefinition(type.id).label }));
    }
    const metrics = track.metrics;
    documentRef.querySelector('.route-metrics').hidden = !metrics;
    if (metrics) {
      const distance = () => metrics.distanceKm == null ? '—'
        : number(distanceValue(metrics.distanceKm, preferences.value), preferences.value);
      const elevation = (value) => value == null ? '—'
        : number(elevationValue(value, preferences.value), { ...preferences.value, digits: 0 });
      for (const selector of ['#distance', '#compact-distance']) bindText(documentRef.querySelector(selector), distance);
      for (const selector of ['#ascent', '#compact-ascent']) bindText(documentRef.querySelector(selector), () => elevation(metrics.ascentM));
      for (const selector of ['#descent', '#compact-descent']) bindText(documentRef.querySelector(selector), () => elevation(metrics.descentM));
      const duration = () => metrics.estimatedDurationMs == null ? '—' : formatDuration(metrics.estimatedDurationMs)[0];
      for (const selector of ['#duration', '#compact-duration']) bindText(documentRef.querySelector(selector), duration);
      for (const selector of ['#duration-unit', '#compact-duration-unit']) bindText(documentRef.querySelector(selector), () => t('common.hour'));
      const speed = () => metrics.speedKmh == null ? '—' : formatMeasurement('speed', metrics.speedKmh);
      for (const selector of ['#average-speed-badge', '#compact-speed']) bindText(documentRef.querySelector(selector), speed);
      bindAttribute(documentRef.querySelector('#average-speed-badge'), 'title', () => metrics.speedKmh == null
        ? t('route.noSpeed') : t('route.estimatedSpeed', { speed: speed() }));
    }
    updatePageLanguage();
    documentRef.querySelector('.route-workspace').hidden = !track.revision;
    documentRef.querySelector('#route-state-note').hidden = true;
    if (track.revision) {
      const hasRoadSummary = Object.values(track.distributions).some((items) => items.length);
      documentRef.querySelector('.surface-section').hidden = !hasRoadSummary;
      documentRef.querySelector('.route-tabs a[href="#way-types"]').hidden = !hasRoadSummary;
      const hasTerrainSummary = track.sources?.valhalla === 'SUCCESS'
        || track.climbs.length || track.descents.length;
      documentRef.querySelector('.climbs-section').hidden = !hasTerrainSummary;
      documentRef.querySelector('.route-tabs a[href="#climbs"]').hidden = !hasTerrainSummary;
      renderClimbs(track, documentRef);
      renderPointsOfInterest(track.pointsOfInterest);
      renderSurfaces(track, { documentRef, onFiltersRendered });
      renderSourceInfo(track.sources);
      bindText(documentRef.querySelector('#profile-ascent'), () => metrics.ascentM == null ? '—' : formatMeasurement('elevation', metrics.ascentM, { digits: 0 }));
      bindText(documentRef.querySelector('#profile-descent'), () => metrics.descentM == null ? '—' : formatMeasurement('elevation', metrics.descentM, { digits: 0 }));
      bindText(documentRef.querySelector('#min-label'), () => metrics.minElevationM == null ? '—' : formatMeasurement('elevation', metrics.minElevationM));
      bindText(documentRef.querySelector('#max-label'), () => metrics.maxElevationM == null ? '—' : formatMeasurement('elevation', metrics.maxElevationM));
      setDetailedView('loading');
    }
  }

  return { renderSourceInfo, renderUnavailableTrack, renderBasicTrackHeader, renderRangeDistributions };
}
