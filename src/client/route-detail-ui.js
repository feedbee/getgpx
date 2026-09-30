import { t, bindText, bindAttribute, htmlMessage, preferences, formatMeasurement } from './i18n.js';
import { distanceValue, elevationValue, number } from './measurements.js';
import { neutralAnalysis } from './analysis-presentation.js';
import { formatDuration } from './route-page-summary.js';
import { routeTypeDefinition, routeTypeIcon } from './route-type-ui.js';
import { detectClimbs, detectDescents } from './domain/climbs.js';
import { calculateSegmentGrades } from './domain/gradient.js';
import { nearestRoutePointIndex } from './domain/profile-math.js';
import { classifySurface } from './domain/surface.js';

export function prepareRenderableTrack(rawTrack) {
  const currentTrack = neutralAnalysis(rawTrack);
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
  return currentTrack;
}

export function renderLoadedTrackHeader(currentTrack, routeType, updatePageLanguage, documentRef = document) {
  bindText(documentRef.querySelector('#track-name'), () => currentTrack.name || t('common.unnamed'));
  bindText(documentRef.querySelector('#compact-track-name'), () => currentTrack.name || t('common.unnamed'));
  const type = routeTypeDefinition(routeType);
  const typeMetric = documentRef.querySelector('#route-type-metric');
  typeMetric.innerHTML = `${routeTypeIcon(type.id)}<b>${htmlMessage(`activity.${type.id}`)}</b>`;
  bindAttribute(typeMetric, 'aria-label', () => t('route.typeValue', { type: routeTypeDefinition(type.id).label }));
  const compactTypeMetric = documentRef.querySelector('#compact-route-type-metric');
  compactTypeMetric.innerHTML = `${routeTypeIcon(type.id)}<b>${htmlMessage(`activity.${type.id}`)}</b>`;
  bindAttribute(compactTypeMetric, 'aria-label', () => t('route.typeValue', { type: routeTypeDefinition(type.id).label }));
  bindText(documentRef.querySelector('#distance'), () => number(distanceValue(currentTrack.distanceKm, preferences.value), preferences.value));
  bindText(documentRef.querySelector('#compact-distance'), () => number(distanceValue(currentTrack.distanceKm, preferences.value), preferences.value));
  bindText(documentRef.querySelector('#ascent'), () => currentTrack.hasElevation ? number(elevationValue(currentTrack.ascentM, preferences.value), { ...preferences.value, digits: 0 }) : '—');
  bindText(documentRef.querySelector('#compact-ascent'), () => currentTrack.hasElevation ? number(elevationValue(currentTrack.ascentM, preferences.value), { ...preferences.value, digits: 0 }) : '—');
  bindText(documentRef.querySelector('#descent'), () => currentTrack.hasElevation ? number(elevationValue(currentTrack.descentM, preferences.value), { ...preferences.value, digits: 0 }) : '—');
  bindText(documentRef.querySelector('#compact-descent'), () => currentTrack.hasElevation ? number(elevationValue(currentTrack.descentM, preferences.value), { ...preferences.value, digits: 0 }) : '—');
  const [duration] = formatDuration(currentTrack.estimatedDurationMs || currentTrack.movingTimeMs);
  bindText(documentRef.querySelector('#duration'), () => duration);
  bindText(documentRef.querySelector('#duration-unit'), () => t('common.hour'));
  bindText(documentRef.querySelector('#compact-duration'), () => duration);
  bindText(documentRef.querySelector('#compact-duration-unit'), () => t('common.hour'));
  bindText(documentRef.querySelector('#profile-ascent'), () => number(elevationValue(currentTrack.ascentM, preferences.value), { ...preferences.value, digits: 0 }));
  bindText(documentRef.querySelector('#profile-descent'), () => number(elevationValue(currentTrack.descentM, preferences.value), { ...preferences.value, digits: 0 }));
  const speedBadge = documentRef.querySelector('#average-speed-badge');
  const routeSpeed = currentTrack.effectiveSpeedKmh || currentTrack.movingAverageSpeedKmh;
  bindText(speedBadge, () => formatMeasurement('speed', routeSpeed));
  bindText(documentRef.querySelector('#compact-speed'), () => formatMeasurement('speed', routeSpeed));
  bindAttribute(speedBadge, 'title', () => currentTrack.movingAverageSpeedKmh
    ? t('route.recordedSpeed', { speed: formatMeasurement('speed', routeSpeed) })
    : routeSpeed ? t('route.estimatedSpeed', { speed: formatMeasurement('speed', routeSpeed) }) : t('route.noSpeed'));
  updatePageLanguage();
}

export function createRouteDetailView({ getProfileColorMode, onReady, documentRef = document }) {
  function setDetailedView(state) {
    const ready = state === 'ready';
    for (const selector of ['#map', '.map-mode', '#map-note', '#hover-readout', '.profile-toolbar', '#profile-wrap']) {
      documentRef.querySelector(selector).hidden = !ready;
    }
    for (const legend of documentRef.querySelectorAll('.profile-card .route-legend')) {
      legend.hidden = !ready || legend.id !== `${getProfileColorMode()}-legend`;
    }
    for (const selector of ['#map-load-state', '#profile-load-state']) {
      const element = documentRef.querySelector(selector);
      element.hidden = ready;
      element.classList.toggle('is-processing', state === 'loading');
      if (!ready) bindText(element, () => t(state === 'loading' ? 'common.loadingRoute' : 'errors.fileUnavailable'));
    }
    documentRef.querySelectorAll('[data-surface-filter],[data-waytype-filter],[data-quality-filter],[data-terrain-range]')
      .forEach((control) => { control.disabled = !ready || control.dataset.summaryEmpty === 'true'; });
    documentRef.querySelectorAll('[data-poi-index]').forEach((control) => { control.disabled = !ready; });
    if (ready) onReady();
  }

  return { setDetailedView };
}
