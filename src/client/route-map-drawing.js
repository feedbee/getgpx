import { colorRunsForMode, elevationRange } from './domain/route-color.js';
import { htmlMessage, escapeHtml, t } from './i18n.js';

// Both single-track and comparison maps share widths, outline, opacity and rendering.
export function drawRouteLines(leaflet, target, track, mode, { renderer, color, range = elevationRange(track.points), layerOptions = {} } = {}) {
  const coordinates = track.points.map(point => [point.lat, point.lon]);
  const elevationOptions = mode === 'elevation' ? { renderer, noClip: true, smoothFactor: 0 } : {};
  const outline = leaflet.polyline(coordinates, { ...elevationOptions, color: '#ffffff', weight: 8, opacity: 0.92, interactive: false, ...layerOptions }).addTo(target);
  const lines = [];
  if (mode === 'elevation') {
    lines.push(leaflet.polyline(coordinates, { ...elevationOptions, elevationRange: range, elevations: track.points.map(point => point.ele),
      weight: 5, opacity: 1, interactive: false, ...layerOptions }).addTo(target));
  } else {
    const runs = mode === 'tracks' ? [{ startIndex: 0, endIndex: track.points.length - 1, color }] : colorRunsForMode(track.points, mode);
    runs.forEach(run => lines.push(leaflet.polyline(coordinates.slice(run.startIndex, run.endIndex + 1),
      { color: run.color, weight: 5, opacity: 1, interactive: false, ...layerOptions }).addTo(target)));
  }
  return { outline, lines };
}

export function routeEndpointIcon(leaflet, label, kind, { color, title = t(kind === 'start' ? 'map.startTitle' : 'map.finishTitle') } = {}) {
  return leaflet.divIcon({ className: '', html: `<button type="button" class="endpoint endpoint-${kind}"${color ? ` style="background:${escapeHtml(color)}"` : ''} aria-label="${escapeHtml(title)}">${escapeHtml(label)}</button>`,
    iconSize: [24, 24], iconAnchor: [12, 12] });
}

export function routeEndpointLegend(closed = false) {
  return closed ? `<span class="start-dot"></span><b>${htmlMessage('map.startFinish')}</b>`
    : `<span class="start-dot"></span><b>${htmlMessage('map.start')}</b><i class="finish-dot"></i><b>${htmlMessage('map.finish')}</b>`;
}

// Handle keyboard activation at the marker boundary, before map key handlers.
// The wrapper survives icon updates when comparison numbering changes.
export function bindRouteEndpointKeyboard(marker, onOpen) {
  marker.getElement()?.addEventListener?.('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    onOpen();
  });
}
