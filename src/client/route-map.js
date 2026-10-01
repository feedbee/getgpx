import L from 'leaflet';
import { createElevationMapRenderer } from './elevation-map-renderer.js';
import { t, bindText, bindAttribute, htmlMessage } from './i18n.js';
import { poiName } from './analysis-presentation.js';
import { nearestRoutePointIndex } from './domain/profile-math.js';
import { colorRunsForMode, elevationRange, highlightRunsForFilter } from './domain/route-color.js';
import { isClosedRoute } from './domain/route-shape.js';

export function createRouteMap({ getPoiSelection, getMapColorMode, getRouteFilter, getTerrainRange,
  onActivePoint, onPointContext, onPoiHover, onPoiLeave, onPoiToggle, documentRef = document, leaflet = L }) {
  let map;
  let routeLine;
  let activeMarker;
  let poiMarkers = [];
  let focusLayers = [];
  let currentTrack;
  let elevationRenderer;

  function makeEndpointIcon(label, type) {
    return leaflet.divIcon({ className: '', html: `<div class="endpoint endpoint-${type}">${label}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
  }

  function makePoiIcon(index) {
    return leaflet.divIcon({ className: '', html: `<div class="poi-marker"><span>${index + 1}</span></div>`, iconSize: [28, 32], iconAnchor: [14, 30] });
  }

  function init() {
    map = leaflet.map('map', { zoomControl: false, attributionControl: true });
    map.createPane('elevationPane');
    map.getPane('elevationPane').style.zIndex = '399';
    map.createPane('startMarkerPane');
    map.getPane('startMarkerPane').style.zIndex = '675';
    leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    leaflet.control.zoom({ position: 'topright', zoomInTitle: t('map.zoomIn'), zoomOutTitle: t('map.zoomOut') }).addTo(map);
    bindAttribute(documentRef.querySelector('.leaflet-control-zoom-in'), 'title', () => t('map.zoomIn'));
    bindAttribute(documentRef.querySelector('.leaflet-control-zoom-in'), 'aria-label', () => t('map.zoomIn'));
    bindAttribute(documentRef.querySelector('.leaflet-control-zoom-out'), 'title', () => t('map.zoomOut'));
    bindAttribute(documentRef.querySelector('.leaflet-control-zoom-out'), 'aria-label', () => t('map.zoomOut'));
  }

  function nearestPoint(latlng) {
    return nearestRoutePointIndex(currentTrack.points, { lat: latlng.lat, lon: latlng.lng });
  }

  function draw(track, { fit = true } = {}) {
    currentTrack = track;
    if (routeLine) map.eachLayer((layer) => { if (layer.options?.trackLayer && !layer.options?.rangeFocus) map.removeLayer(layer); });
    poiMarkers = [];
    const coordinates = track.points.map((point) => [point.lat, point.lon]);
    const elevationMode = getMapColorMode() === 'elevation';
    if (elevationMode) elevationRenderer ??= createElevationMapRenderer(leaflet);
    leaflet.polyline(coordinates, { ...(elevationMode ? { renderer: elevationRenderer, noClip: true, smoothFactor: 0 } : {}), color: '#ffffff', weight: 8, opacity: 0.92, trackLayer: true, interactive: false }).addTo(map);
    if (elevationMode) {
      leaflet.polyline(coordinates, {
        renderer: elevationRenderer, elevationRange: elevationRange(track.points), elevations: track.points.map(point => point.ele),
        noClip: true, smoothFactor: 0, weight: 5, opacity: 1, trackLayer: true, interactive: false,
      }).addTo(map);
    } else colorRunsForMode(track.points, getMapColorMode()).forEach((run) => {
      leaflet.polyline(coordinates.slice(run.startIndex, run.endIndex + 1), {
        color: run.color,
        weight: 5,
        opacity: 1,
        trackLayer: true, interactive: false,
      }).addTo(map);
    });
    highlightRunsForFilter(track.points, getRouteFilter()).forEach((run) => {
      const highlightedCoordinates = coordinates.slice(run.startIndex, run.endIndex + 1);
      leaflet.polyline(highlightedCoordinates, {
        color: '#ffffff', weight: 11, opacity: 0.94, trackLayer: true, interactive: false,
      }).addTo(map);
      leaflet.polyline(highlightedCoordinates, {
        color: run.color, weight: 7, opacity: 1, trackLayer: true, interactive: false,
      }).addTo(map);
    });
    routeLine = leaflet.polyline(coordinates, { color: '#000000', weight: 14, opacity: 0, trackLayer: true }).addTo(map);
    routeLine.on('mousemove', (event) => {
      if (getPoiSelection().pinnedIndex === null) onActivePoint(nearestPoint(event.latlng), { showContext: true });
    });
    routeLine.on('mouseout', () => { if (getPoiSelection().pinnedIndex === null) onPointContext(null); });
    const closedRoute = isClosedRoute(track.points);
    leaflet.marker(coordinates[0], {
      icon: makeEndpointIcon('A', 'start'), trackLayer: true, pane: 'startMarkerPane', interactive: false, zIndexOffset: 1000,
      title: closedRoute ? t('map.startFinishTitle') : t('map.startTitle'),
    }).addTo(map);
    if (!closedRoute) {
      leaflet.marker(coordinates.at(-1), {
        icon: makeEndpointIcon('B', 'finish'), trackLayer: true, interactive: false, zIndexOffset: 900, title: t('map.finishTitle'),
      }).addTo(map);
    }
    poiMarkers = (track.pointsOfInterest || []).map((point, index) => {
      const tooltip = documentRef.createElement('span');
      bindText(tooltip, () => poiName(point, index));
      const marker = leaflet.marker([point.lat, point.lon], {
        icon: makePoiIcon(index), trackLayer: true, zIndexOffset: 700, title: poiName(point, index),
      }).addTo(map).bindTooltip(tooltip, { direction: 'top', offset: [0, -26] });
      marker.on('mouseover', () => onPoiHover(index));
      marker.on('mouseout', () => onPoiLeave());
      marker.on('click', () => onPoiToggle(index));
      return marker;
    });
    renderPoiSelection(getPoiSelection().pinnedIndex ?? getPoiSelection().hoveredIndex);
    documentRef.querySelector('#map-note').innerHTML = closedRoute
      ? `<span class="start-dot"></span><b>${htmlMessage('map.startFinish')}</b>`
      : `<span class="start-dot"></span><b>${htmlMessage('map.start')}</b><i class="finish-dot"></i><b>${htmlMessage('map.finish')}</b>`;
    activeMarker = leaflet.circleMarker(coordinates[0], { radius: 8, color: '#fff', weight: 3, fillColor: '#131712', fillOpacity: 1, trackLayer: true, interactive: false }).addTo(map);
    const terrainRange = getTerrainRange();
    if (terrainRange) {
      leaflet.polyline(coordinates.slice(terrainRange.startIndex, terrainRange.endIndex + 1), {
        color: '#12251e', weight: 12, opacity: 0.8, trackLayer: true, interactive: false,
      }).addTo(map);
      leaflet.polyline(coordinates.slice(terrainRange.startIndex, terrainRange.endIndex + 1), {
        color: terrainRange.color, weight: 6, opacity: 1, trackLayer: true, interactive: false,
      }).addTo(map);
    }
    focusLayers[0]?.bringToBack?.();
    focusLayers.slice(1).forEach((layer) => layer.bringToFront?.());
    if (fit) map.fitBounds(routeLine.getBounds(), { padding: [48, 48] });
  }

  function clearRangeFocus() {
    focusLayers.forEach((layer) => map.removeLayer(layer));
    focusLayers = [];
  }

  function fitRange(track, range) {
    const points = track.points.slice(range[0], range[1] + 1);
    const coordinates = points.map((point) => [point.lat, point.lon]);
    clearRangeFocus();
    const outline = leaflet.polyline(coordinates, {
      color: '#151a17', weight: 14, opacity: 0.9, dashArray: '10 8', lineCap: 'butt',
      rangeFocus: true, interactive: false,
    }).addTo(map).bringToBack();
    const boundaryStyle = { radius: 7, color: '#10251d', weight: 3, fillColor: '#f0b83f', fillOpacity: 1, rangeFocus: true, interactive: false };
    focusLayers = [outline, leaflet.circleMarker(coordinates[0], boundaryStyle).addTo(map), leaflet.circleMarker(coordinates.at(-1), boundaryStyle).addTo(map)];
    map.fitBounds(outline.getBounds(), { padding: [72, 72] });
  }

  function renderPoiSelection(index) {
    poiMarkers.forEach((marker, markerIndex) => {
      marker.getElement()?.querySelector('.poi-marker')?.classList.toggle('is-active', markerIndex === index);
      marker.setZIndexOffset(markerIndex === index ? 1200 : 700);
      if (markerIndex === index) marker.openTooltip();
      else marker.closeTooltip();
    });
  }

  function fitFullRange() {
    map.fitBounds(routeLine.getBounds(), { padding: [48, 48] });
  }

  return { init, draw, renderPoiSelection, clearRangeFocus, fitRange, fitFullRange,
    setActivePoint: (point) => activeMarker?.setLatLng([point.lat, point.lon]),
    invalidateSize: () => map.invalidateSize() };
}
