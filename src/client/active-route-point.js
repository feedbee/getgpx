import { t, formatMeasurement, percent, escapeHtml } from './i18n.js';
import { roadLabel } from './analysis-presentation.js';
import { classifyWayType } from './domain/surface.js';

export function createActiveRoutePoint({ getTrack, chartCoordinates, onMapPoint, documentRef = document }) {
  let activePointIndex = 0;

  function setPointContext(point) {
    const currentIds = point ? {
      surface: point.surface.id,
      waytype: classifyWayType(point.surface.highway).id,
      quality: point.surface.quality.id,
    } : null;
    documentRef.querySelectorAll('[data-surface-filter],[data-waytype-filter],[data-quality-filter]').forEach((control) => {
      const matchesPoint = currentIds && (control.dataset.surfaceFilter === currentIds.surface
        || control.dataset.waytypeFilter === currentIds.waytype
        || control.dataset.qualityFilter === currentIds.quality);
      control.classList.toggle('is-current', Boolean(matchesPoint));
    });
  }

  function set(index, { showContext = false } = {}) {
    if (!getTrack()) return;
    activePointIndex = Math.max(0, Math.min(index, getTrack().points.length - 1));
    const point = getTrack().points[activePointIndex];
    const chart = chartCoordinates(point);
    onMapPoint(point);
    documentRef.querySelector('#profile-cursor').setAttribute('x1', chart.x);
    documentRef.querySelector('#profile-cursor').setAttribute('x2', chart.x);
    documentRef.querySelector('#profile-dot').setAttribute('cx', chart.x);
    documentRef.querySelector('#profile-dot').setAttribute('cy', chart.y);
    const grade = percent(point.grade);
    const surfaceLabel = point.surface.inferred ? t('profile.inferred', { surface: t(point.surface.label) }) : t(point.surface.label);
    documentRef.querySelector('#hover-readout').innerHTML = `<b>${formatMeasurement('distance', point.distanceKm)} · ${formatMeasurement('elevation', point.ele)} · ${grade}</b><span>${escapeHtml(t('profile.surfaceDetail', { surface: surfaceLabel, road: roadLabel(point.surface.highway), quality: t(point.surface.quality.label) }))}</span><small>${escapeHtml(t('profile.percentRoute', { percent: percent(getTrack().distanceKm ? point.distanceKm / getTrack().distanceKm * 100 : 0, 0) }))}</small>`;
    const slider = documentRef.querySelector('#profile-wrap');
    slider.setAttribute('aria-valuenow', getTrack().distanceKm ? Math.round((point.distanceKm / getTrack().distanceKm) * 100) : 0);
    slider.setAttribute('aria-valuetext', t('profile.positionValue', { distance: formatMeasurement('distance', point.distanceKm), elevation: formatMeasurement('elevation', point.ele) }));
    setPointContext(showContext ? point : null);
  }

  return { set, setPointContext, get index() { return activePointIndex; } };
}
