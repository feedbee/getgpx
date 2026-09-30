import { t, bindText, escapeHtml, formatMeasurement, preferences, percent } from './i18n.js';
import { elevationValue, number } from './measurements.js';
import { poiName } from './analysis-presentation.js';
import { areaPathFromCoordinates, elevationGainLoss, profileFocusVisibility, profileRangePosition, visibleRangeIndices } from './domain/profile-math.js';
import { colorRunsForMode, highlightRunsForFilter, profileColorRuns } from './domain/route-color.js';

export function createElevationProfile({ getTrack, getViewRange, getSummaryMetrics, getColorMode,
  getFocusPlacement, getRouteFilter, getTerrainRange, documentRef = document }) {
  let viewMetrics = null;
  function visibleMetrics() {
    const [startIndex, endIndex] = getViewRange();
    const points = getTrack().points.slice(startIndex, endIndex + 1);
    const elevations = points.map((point) => point.ele).filter(Number.isFinite);
    const rawMin = Math.min(...elevations);
    const rawMax = Math.max(...elevations);
    const padding = Math.max(10, (rawMax - rawMin) * 0.08);
    return { startIndex, endIndex, startKm: points[0].distanceKm, endKm: points.at(-1).distanceKm, min: rawMin - padding, max: rawMax + padding };
  }

  function chartCoordinates(point) {
    const { min, max, startKm, endKm } = viewMetrics ?? visibleMetrics();
    const x = ((point.distanceKm - startKm) / Math.max(endKm - startKm, 0.001)) * 1200;
    const y = 260 - ((point.ele - min) / Math.max(max - min, 1)) * 220;
    return { x, y };
  }

  function renderProfilePointsOfInterest(track, startKm, endKm) {
    const group = documentRef.querySelector('#profile-pois');
    group.replaceChildren();
    (track.pointsOfInterest || []).forEach((point, index) => {
      const routePoint = track.points[point.routePointIndex];
      if (!routePoint || routePoint.distanceKm < startKm || routePoint.distanceKm > endKm) return;
      const ratio = (routePoint.distanceKm - startKm) / Math.max(endKm - startKm, 0.001);
      const marker = documentRef.createElement('span');
      marker.className = 'profile-poi';
      marker.dataset.profilePoiIndex = String(index);
      marker.style.left = `${ratio * 100}%`;
      marker.title = poiName(point, index);
      bindText(marker, () => String(index + 1));
      group.append(marker);
    });
  }

  function drawProfile(track) {
    viewMetrics = visibleMetrics();
    const { startIndex, endIndex, startKm, endKm, min, max } = viewMetrics;
    const isFullRange = startIndex === 0 && endIndex === track.points.length - 1;
    const summaryMetrics = isFullRange ? getSummaryMetrics() : null;
    const { ascentM, descentM } = summaryMetrics || elevationGainLoss(track.points, startIndex, endIndex);
    bindText(documentRef.querySelector('#profile-ascent'), () => number(elevationValue(ascentM, preferences.value), { ...preferences.value, digits: 0 }));
    bindText(documentRef.querySelector('#profile-descent'), () => number(elevationValue(descentM, preferences.value), { ...preferences.value, digits: 0 }));
    const visiblePoints = track.points.slice(startIndex, endIndex + 1).filter((point) => Number.isFinite(point.ele));
    const coords = visiblePoints.map(chartCoordinates);
    renderProfilePointsOfInterest(track, startKm, endKm);
    const line = coords.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    documentRef.querySelector('#profile-area').setAttribute('d', `${line} L1200,264 L0,264 Z`);
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
    const profileRuns = profileColorRuns(track.points, getColorMode());
    const gradientAreaPaths = profileRuns.area.map((run) => {
      const path = areaPathFromCoordinates(profileCoordinates(run), 264);
      return path ? `<path d="${path}" fill="${run.color}"></path>` : '';
    }).join('');
    documentRef.querySelector('#profile-gradient-area').innerHTML = gradientAreaPaths;
    const baseProfilePaths = profileRuns.line.map((run) => {
      const path = profilePath(run);
      return path ? `<path d="${path}" stroke="${run.color}"><title>${escapeHtml(t(run.label))}</title></path>` : '';
    }).join('');
    documentRef.querySelector('#gradient-line').innerHTML = baseProfilePaths;
    const focusedRuns = highlightRunsForFilter(track.points, getRouteFilter());
    const terrainRange = getTerrainRange();
    if (terrainRange) focusedRuns.push(terrainRange);
    const focusVisibility = profileFocusVisibility(getFocusPlacement());
    documentRef.querySelector('#profile-focus-profile').innerHTML = focusVisibility.profile ? focusedRuns.map((run) => {
      const path = profilePath(run);
      return path ? `<path class="profile-focus-path-outline" d="${path}"></path><path class="profile-focus-path-line" d="${path}" stroke="${run.color}"><title>${escapeHtml(t(run.label))}</title></path>` : '';
    }).join('') : '';
    documentRef.querySelector('#grid').innerHTML = [40, 95, 150, 205, 260].map((y) => `<line x1="0" y1="${y}" x2="1200" y2="${y}" />`).join('');
    documentRef.querySelector('#axis').innerHTML = Array.from({ length: 6 }, (_, index) => `<span>${formatMeasurement('distance', startKm + (endKm - startKm) * index / 5)}</span>`).join('');
    bindText(documentRef.querySelector('#min-label'), () => formatMeasurement('elevation', summaryMetrics?.minElevationM ?? min));
    bindText(documentRef.querySelector('#max-label'), () => formatMeasurement('elevation', summaryMetrics?.maxElevationM ?? max));
    documentRef.querySelector('#climb-bands').innerHTML = track.climbs.map((climb) => {
      const from = Math.max(climb.startKm, startKm);
      const to = Math.min(climb.endKm, endKm);
      if (from >= to) return '';
      const x = ((from - startKm) / Math.max(endKm - startKm, 0.001)) * 1200;
      const width = ((to - from) / Math.max(endKm - startKm, 0.001)) * 1200;
      return `<rect class="climb-band" x="${x}" y="18" width="${width}" height="246" fill="${climb.color}"><title>${escapeHtml(t('profile.climb', { distance: formatMeasurement('distance', climb.lengthM / 1000), grade: percent(climb.averageGrade) }))}</title></rect>`;
    }).join('');
    const ribbonRuns = colorRunsForMode(track.points, getColorMode());
    const ribbonRect = (run) => {
      const position = profileRangePosition(track.points, run, startKm, endKm);
      if (!position) return '';
      const { x, width } = position;
      return `<rect x="${x}" y="269" width="${Math.max(width, 1)}" height="9" fill="${run.color}"><title>${escapeHtml(t(run.label))}</title></rect>`;
    };
    documentRef.querySelector('#surface-ribbon').innerHTML = ribbonRuns.map(ribbonRect).join('');
    const focusRect = (run) => {
      const position = profileRangePosition(track.points, run, startKm, endKm);
      if (!position) return '';
      const { x, width } = position;
      return `<rect class="profile-focus-outline" x="${x}" y="265" width="${Math.max(width, 1)}" height="17" rx="2"></rect><rect class="profile-focus-line" x="${x}" y="268" width="${Math.max(width, 1)}" height="11" rx="1" fill="${run.color}"><title>${escapeHtml(t(run.label))}</title></rect>`;
    };
    documentRef.querySelector('#profile-focus-ribbon').innerHTML = focusVisibility.ribbon ? focusedRuns.map(focusRect).join('') : '';
  }

  return { drawProfile, chartCoordinates, resetMetrics() { viewMetrics = null; } };
}
