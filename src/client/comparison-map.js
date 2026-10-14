import { drawRouteLines, routeEndpointIcon, bindRouteEndpointKeyboard } from './route-map-drawing.js';
import { isClosedRoute } from './domain/route-shape.js';
import L from 'leaflet';
import { elevationRange } from './domain/route-color.js';
import { createElevationMapRenderer } from './elevation-map-renderer.js';
import { nearestRoutePointIndex } from './domain/profile-math.js';
import { createRoutePointPopover } from './route-point-popover.js';
import { routePointReadout } from './active-route-point.js';
import { t, escapeHtml } from './i18n.js';

export function createComparisonMap(container, readout, onHighlight, { leaflet = L, createPopover = createRoutePointPopover } = {}) {
  const map = leaflet.map(container, { zoomControl: false });
  leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  leaflet.control.zoom({ position: 'topright', zoomInTitle: t('map.zoomIn'), zoomOutTitle: t('map.zoomOut') }).addTo(map);
  map.createPane('elevationPane').style.zIndex = '399';
  const renderer = createElevationMapRenderer(leaflet);
  let entries = [];
  let layers = [];
  let selectedEntry;
  let activeMarker;
  let highlightedId;
  const popover = createPopover({ getTrack: () => selectedEntry?.track, showTrackName: true, getTrackColor: () => selectedEntry?.color, panelId: 'comparison-point-popover',
    onSelect: (index) => { onHighlight(selectedEntry.id); showPoint(selectedEntry, index); },
    onClose: clearPointHighlight });
  map.on('movestart', () => popover.close());

  function clearPointHighlight() {
    onHighlight(null);
    readout.hidden = true;
    activeMarker?.remove();
    activeMarker = null;
  }

  function showPoint(entry, index) {
    selectedEntry = entry;
    const point = entry.track.points[index];
    activeMarker ??= leaflet.circleMarker([point.lat, point.lon], { radius: 8, color: '#fff', weight: 3, fillOpacity: 1, interactive: false }).addTo(map);
    activeMarker.setLatLng([point.lat, point.lon]).setStyle({ fillColor: entry.color }).bringToFront();
    readout.style.setProperty('--track-color', entry.color);
    readout.innerHTML = `<strong>${escapeHtml(entry.track.name || t('common.unnamed'))}</strong>${routePointReadout(point, entry.track)}`;
    readout.hidden = false;
  }

  function openPoint(entry, index, event, trigger, context = {}) {
    selectedEntry = entry;
    const point = map.latLngToContainerPoint(event.latlng);
    const bounds = container.getBoundingClientRect();
    popover.open(index, { anchor: { x: bounds.left + point.x, y: bounds.top + point.y }, trigger, bounds, context });
  }

  function arrangeLayers(highlightId = null) {
    const order = new Map(entries.map((entry, index) => [entry.id, index]));
    const stacked = [...layers].sort((a, b) => Number(a.entry.id === highlightId) - Number(b.entry.id === highlightId)
      || order.get(b.entry.id) - order.get(a.entry.id));
    stacked.forEach(({ entry, group }, rank) => group.eachLayer(layer => {
      layer.bringToFront?.();
      const markerRank = entry.id === highlightId ? stacked.length : rank;
      layer.setZIndexOffset?.(markerRank * 2000 + 1000);
    }));
    activeMarker?.bringToFront();
  }

  function fitTrack(id) {
    const entry = entries.find(item => item.id === id);
    if (!entry?.track.points.length) return false;
    popover.close();
    readout.hidden = true;
    activeMarker?.remove();
    activeMarker = null;
    map.fitBounds(leaflet.latLngBounds(entry.track.points.map(point => [point.lat, point.lon])), { padding: [48, 48], maxZoom: 19 });
    return true;
  }

  function reorder(ids) {
    const byId = new Map(entries.map(entry => [entry.id, entry]));
    entries = ids.filter(id => byId.has(id)).map(id => {
      const entry = byId.get(id);
      entry.number = ids.indexOf(id) + 1;
      return entry;
    });
    popover.close();
    layers.forEach(({ entry, endpointMarkers }) => endpointMarkers.forEach(({ marker, kind, title }) => {
      marker.setIcon(routeEndpointIcon(leaflet, `${entry.number}${kind === 'start' ? 'A' : 'B'}`, kind, { color: entry.color, title }));
    }));
    highlightedId = undefined;
    highlight(null);
  }

  function highlight(id) {
    if (highlightedId === id) return;
    highlightedId = id;
    layers.forEach(({ entry, outline, lines, endpointMarkers }) => {
      const dimmed = id !== null && entry.id !== id;
      outline.setStyle({ opacity: dimmed ? 0.4 : 0.92 });
      lines.forEach(line => line.setStyle({ opacity: dimmed ? 0.35 : 1 }));
      endpointMarkers.forEach(({ marker }) => {
        marker.setOpacity(dimmed ? 0.35 : 1);
        const element = marker.getElement();
        element?.style.setProperty('--track-color', entry.color);
        element?.classList.toggle('comparison-endpoint-active', entry.id === id);
      });
    });
    arrangeLayers(id);
  }

  function draw(nextEntries, mode, { fit = false } = {}) {
    popover.close();
    entries = nextEntries;
    highlightedId = undefined;
    layers.forEach(({ group }) => group.remove());
    layers = [];
    activeMarker?.remove();
    activeMarker = null;
    readout.hidden = true;
    const ranges = entries.map(entry => elevationRange(entry.track.points));
    const heightRange = { min: Math.min(...ranges.map(range => range.min)), max: Math.max(...ranges.map(range => range.max)) };
    for (const entry of entries) {
      const { track, color } = entry;
      const coordinates = track.points.map(point => [point.lat, point.lon]);
      const group = leaflet.layerGroup().addTo(map);
      const { outline, lines } = drawRouteLines(leaflet, group, track, mode, { renderer, color, range: heightRange });
      const hit = leaflet.polyline(coordinates, { color, weight: 14, opacity: 0 }).addTo(group);
      hit.on('mousemove', event => {
        if (popover.isOpen) return;
        onHighlight(entry.id);
        showPoint(entry, nearestRoutePointIndex(track.points, { lat: event.latlng.lat, lon: event.latlng.lng }));
      });
      hit.on('mouseout', () => { if (!popover.isOpen) clearPointHighlight(); });
      hit.on('click', event => openPoint(entry, nearestRoutePointIndex(track.points, { lat: event.latlng.lat, lon: event.latlng.lng }), event, hit.getElement()));
      const endpointMarkers = [];
      const endpoints = isClosedRoute(track.points) ? [['start', 0]] : [['start', 0], ['finish', track.points.length - 1]];
      for (const [kind, index] of endpoints) {
        const label = `${entry.number}${kind === 'start' ? 'A' : 'B'}`;
        const title = `${track.name || t('common.unnamed')} · ${t(kind === 'start' ? 'map.startTitle' : 'map.finishTitle')}`;
        const marker = leaflet.marker(coordinates[index], { title, keyboard: false,
          icon: routeEndpointIcon(leaflet, label, kind, { color, title }), zIndexOffset: kind === 'start' ? 1000 : 900 }).addTo(group);
        endpointMarkers.push({ marker, kind, title });
        marker.on('mouseover', () => onHighlight(entry.id));
        marker.on('mouseout', () => { if (!popover.isOpen) onHighlight(null); });
        marker.on('click', event => openPoint(entry, index, event, marker.getElement()?.querySelector('button') ?? marker.getElement(), { kind }));
        bindRouteEndpointKeyboard(marker, () => openPoint(entry, index, { latlng: { lat: track.points[index].lat, lng: track.points[index].lon } },
          marker.getElement()?.querySelector('button') ?? marker.getElement(), { kind }));
      }
      layers.push({ entry, group, outline, lines, endpointMarkers });
    }
    arrangeLayers();
    if (fit && entries.length) map.fitBounds(leaflet.latLngBounds(entries.flatMap(entry => entry.track.points.map(point => [point.lat, point.lon]))), { padding: [45, 45], maxZoom: 15 });
    if (!entries.length) map.setView([52, 20], 5);
  }
  return { draw, highlight, reorder, fitTrack, invalidateSize: () => map.invalidateSize() };
}
