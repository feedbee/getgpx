import { describe, expect, it, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
import { createRouteMap } from '../../../src/client/route-map.js';

function fakeLeaflet() {
  const layers = [];
  const map = {
    createPane: vi.fn(), getPane: () => ({ style: {} }),
    eachLayer: (callback) => [...layers].forEach(callback),
    removeLayer: (layer) => { layers.splice(layers.indexOf(layer), 1); },
    fitBounds: vi.fn(), invalidateSize: vi.fn(), latLngToContainerPoint: () => ({ x: 50, y: 60 }),
  };
  const layer = (coordinates, options = {}) => ({
    coordinates, options, events: {},
    addTo() { layers.push(this); return this; },
    on(event, callback) { this.events[event] = callback; return this; },
    bindTooltip() { return this; }, getBounds() { return coordinates; },
    bringToBack() { return this; }, bringToFront() { return this; },
    getElement() { return null; }, setZIndexOffset: vi.fn(),
    openTooltip: vi.fn(), closeTooltip: vi.fn(), setLatLng: vi.fn(),
  });
  return {
    layers, map,
    leaflet: {
      canvas: () => ({ _updatePoly: vi.fn() }),
      map: () => map, tileLayer: () => layer([]), polyline: layer, marker: layer,
      circleMarker: layer, divIcon: (options) => options,
      control: { zoom: () => layer([]) },
    },
  };
}

describe('route map', () => {
  it.each(['gradient', 'elevation'])('renders the %s route, tracks a selected point, and focuses a range', (mode) => {
    const { layers, map, leaflet } = fakeLeaflet();
    const elements = new Map();
    const documentRef = { querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, { innerHTML: '', setAttribute: vi.fn(), getBoundingClientRect: () => ({ left: 10, top: 20, right: 500, bottom: 500 }) });
      return elements.get(selector);
    } };
    const track = { points: [
      { lat: 1, lon: 2, distanceKm: 0 },
      { lat: 3, lon: 4, distanceKm: 1 },
      { lat: 5, lon: 6, distanceKm: 2 },
    ], pointsOfInterest: [] };
    let pinnedIndex = null;
    const onActivePoint = vi.fn();
    const onOpenPoint = vi.fn();
    const routeMap = createRouteMap({ getPoiSelection: () => ({ pinnedIndex, hoveredIndex: null }),
      getMapColorMode: () => mode, getRouteFilter: () => null, getTerrainRange: () => null,
      onActivePoint, onOpenPoint, onPointContext: vi.fn(), onPoiHover: vi.fn(), onPoiLeave: vi.fn(), onPoiToggle: vi.fn(),
      documentRef, leaflet });

    routeMap.init();
    routeMap.draw(track);
    expect(map.fitBounds).toHaveBeenCalledWith(expect.any(Array), { padding: [48, 48] });
    if (mode === 'elevation') {
      const baseLayer = layers.find(item => item.options.elevations);
      expect(baseLayer.options).toMatchObject({ noClip: true, smoothFactor: 0, interactive: false });
      expect(baseLayer.options.elevations).toHaveLength(track.points.length);
      expect(layers.find(item => item.options.color === '#ffffff').options.renderer).toBe(baseLayer.options.renderer);
    }
    const routeLine = layers.find((item) => item.options.opacity === 0);
    routeLine.events.mousemove({ latlng: { lat: 3, lng: 4 } });
    expect(onActivePoint).toHaveBeenCalledWith(1, { showContext: true });
    pinnedIndex = 0;
    routeLine.events.mousemove({ latlng: { lat: 5, lng: 6 } });
    expect(onActivePoint).toHaveBeenCalledTimes(1);
    routeMap.setActivePoint(track.points[1]);
    expect(layers.find((item) => item.options.fillColor === '#131712').setLatLng).toHaveBeenCalledWith([3, 4]);
    const endpoints = layers.filter(item => item.options.icon?.html?.includes('endpoint'));
    endpoints[0].events.click();
    expect(onOpenPoint).toHaveBeenLastCalledWith(0, expect.objectContaining({ anchor: { x: 60, y: 80 } }));
    endpoints[1].events.click();
    expect(onOpenPoint).toHaveBeenLastCalledWith(2, expect.any(Object));
    layers.find(item => item.options.fillColor === '#131712').events.click();
    expect(onOpenPoint).toHaveBeenLastCalledWith(1, expect.any(Object));
    routeMap.fitRange(track, [0, 2]);
    expect(map.fitBounds).toHaveBeenLastCalledWith(expect.any(Array), { padding: [72, 72] });
    routeMap.clearRangeFocus();
    expect(layers.some((item) => item.options.rangeFocus)).toBe(false);
  });
});
