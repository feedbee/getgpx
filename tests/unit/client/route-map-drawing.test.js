import { describe, expect, it, vi } from 'vitest';
import { bindRouteEndpointKeyboard, drawRouteLines, routeEndpointIcon, routeEndpointLegend } from '../../../src/client/route-map-drawing.js';

const track = { points: [{ lat: 1, lon: 2, ele: 10 }, { lat: 2, lon: 3, ele: 20 }] };
function setup() {
  const layers = [];
  return { layers, leaflet: { polyline(coordinates, options) {
    const layer = { coordinates, options, addTo() { layers.push(this); return this; } };
    return layer;
  }, divIcon: options => options } };
}

describe('shared map drawing', () => {
  it.each(['tracks', 'gradient', 'elevation'])('keeps the same white outline and stroke width in %s mode', mode => {
    const { leaflet, layers } = setup();
    const renderer = {};
    drawRouteLines(leaflet, {}, track, mode, { color: '#bd4931', renderer });
    expect(layers[0].options).toMatchObject({ color: '#ffffff', weight: 8, opacity: 0.92, interactive: false });
    expect(layers.slice(1).every(layer => layer.options.weight === 5 && layer.options.opacity === 1)).toBe(true);
    if (mode === 'elevation') {
      expect(layers[0].options.renderer).toBe(renderer);
      expect(layers[1].options).toMatchObject({ renderer, noClip: true, smoothFactor: 0, elevations: [10, 20] });
    }
  });
  it('uses the ordinary circular endpoint class and dimensions for both wider labels', () => {
    const { leaflet } = setup();
    for (const kind of ['start', 'finish']) {
      const icon = routeEndpointIcon(leaflet, `8${kind === 'start' ? 'A' : 'B'}`, kind, { color: '#bd4931' });
      expect(icon.iconSize).toEqual([24, 24]);
      expect(icon.iconAnchor).toEqual([12, 12]);
      expect(icon.html).toContain(`class="endpoint endpoint-${kind}"`);
    }
    expect(routeEndpointLegend()).toContain('start-dot');
    expect(routeEndpointLegend()).toContain('finish-dot');
  });
});

it('opens endpoint details once through Enter or Space without bubbling to map handlers', () => {
  const handlers = {};
  const onOpen = vi.fn();
  bindRouteEndpointKeyboard({ getElement: () => ({ addEventListener: (type, handler) => { handlers[type] = handler; } }) }, onOpen);
  for (const key of ['Enter', ' ']) {
    const event = { key, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    handlers.keydown(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  }
  expect(onOpen).toHaveBeenCalledTimes(2);
  handlers.keydown({ key: 'Tab' });
  expect(onOpen).toHaveBeenCalledTimes(2);
});
