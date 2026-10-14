import { describe, expect, it, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
import { createComparisonMap } from '../../../src/client/comparison-map.js';

function setup() {
  const order = [];
  const markers = [];
  const activePoints = [];
  let popoverOptions;
  const map = { on: vi.fn(), createPane: () => ({ style: {} }), fitBounds: vi.fn(), setView: vi.fn(), latLngToContainerPoint: () => ({ x: 20, y: 20 }) };
  function layer(coordinates = [], options = {}) {
    return { coordinates, options, addTo(target) { target.items?.push(this); return this; }, on: vi.fn(),
      setStyle: vi.fn(function () { return this; }), getElement: () => null,
      setLatLng: vi.fn(function () { return this; }), remove: vi.fn(),
      bringToFront() { order.push(this.coordinates[0]?.[0]); return this; },
    };
  }
  const leaflet = { map: () => map, tileLayer: () => layer(), control: { zoom: () => layer() },
    createPane: () => ({ style: {} }), canvas: () => ({ _updatePoly: vi.fn() }), divIcon: options => options,
    latLngBounds: coordinates => coordinates,
    polyline: layer, circleMarker(coordinates, options) { const marker = layer([coordinates], options); activePoints.push(marker); return marker; }, marker(coordinates, options) {
      const marker = layer([coordinates], options);
      marker.setOpacity = vi.fn();
      marker.element = { classList: { toggle: vi.fn() }, style: { setProperty: vi.fn() } };
      marker.element.querySelector = () => null;
      marker.element.querySelector = () => null;
      marker.getElement = () => marker.element;
      marker.setZIndexOffset = vi.fn(); marker.setIcon = vi.fn(); markers.push(marker); return marker;
    },
    layerGroup: () => ({ items: [], addTo() { return this; }, eachLayer(callback) { this.items.forEach(callback); }, remove: vi.fn() }),
  };
  const readout = { style: { setProperty: vi.fn() } };
  const onHighlight = vi.fn(id => view.highlight(id));
  const view = createComparisonMap({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }, readout, onHighlight, { leaflet,
    createPopover: options => { popoverOptions = options; return { close: vi.fn(), open: vi.fn(index => options.onSelect(index)) }; } });
  const entry = (id, lat) => ({ id, color: '#2463a6', number: lat, track: { points: [
    { lat, lon: 1, ele: 10 }, { lat: lat + 1, lon: 2, ele: 20 },
  ].map(point => ({ ...point, grade: 0, distanceKm: 0, surface: { label: 'surface.asphalt', highway: 'secondary', quality: { label: 'quality.good' } } })) } });
  return { view, order, markers, map, readout, onHighlight, activePoints, get popoverOptions() { return popoverOptions; }, entries: [entry('first', 1), entry('second', 3)] };
}

describe('comparison map layer order', () => {
  it('only updates layer styles and stacking when the highlighted track changes', () => {
    const { view, entries, order, markers } = setup();
    view.draw(entries, 'tracks');
    view.highlight('second');
    const stacked = [...order];
    const calls = markers[0].setOpacity.mock.calls.length;
    view.highlight('second');
    expect(order).toEqual(stacked);
    expect(markers[0].setOpacity).toHaveBeenCalledTimes(calls);
    view.reorder(['second', 'first']);
    view.highlight(null);
    expect(order.at(-1)).toBe(4);
    view.draw(entries, 'tracks');
    view.highlight('second');
    expect(order.at(-1)).toBe(4);
  });

  it.each(['tracks', 'elevation'])('keeps the first list row on top in %s mode, temporarily raising the hovered track', mode => {
    const { view, order, markers, entries, map } = setup();
    view.draw(entries, mode);
    expect(order.at(-1)).toBe(2); // First track's finish marker.
    expect(markers.every(marker => marker.options.keyboard === false)).toBe(true);
    view.highlight('second');
    expect(order.at(-1)).toBe(4);
    expect(markers[2].setZIndexOffset.mock.lastCall[0]).toBeGreaterThan(markers[0].setZIndexOffset.mock.lastCall[0]);
    expect(markers[2].setOpacity).toHaveBeenLastCalledWith(1);
    expect(markers[0].setOpacity).toHaveBeenLastCalledWith(0.35);
    expect(markers[2].element.classList.toggle).toHaveBeenLastCalledWith('comparison-endpoint-active', true);
    view.highlight(null);
    expect(order.at(-1)).toBe(2);
    expect(markers[0].setZIndexOffset.mock.lastCall[0]).toBeGreaterThan(markers[2].setZIndexOffset.mock.lastCall[0]);
    expect(markers[2].setOpacity).toHaveBeenLastCalledWith(1);
    expect(markers[2].element.classList.toggle).toHaveBeenLastCalledWith('comparison-endpoint-active', false);
    view.reorder(['second', 'first']);
    expect(order.at(-1)).toBe(4);
    expect(markers[2].setIcon.mock.lastCall[0].html).toContain('>1A</button>');
    expect(markers[0].setIcon.mock.lastCall[0].html).toContain('>2A</button>');
    expect(markers[2].setZIndexOffset.mock.lastCall[0]).toBeGreaterThan(markers[0].setZIndexOffset.mock.lastCall[0]);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });
});

describe('comparison point details', () => {
  it('restores the stack on closing details and highlights the newly selected track on reopening', () => {
    const fixture = setup();
    const { view, entries, markers, readout, activePoints, onHighlight } = fixture;
    view.draw(entries, 'tracks');
    const click = marker => marker.on.mock.calls.find(([event]) => event === 'click')[1]({ latlng: {} });
    click(markers[2]);
    expect(onHighlight).toHaveBeenLastCalledWith('second');
    expect(readout.hidden).toBe(false);
    fixture.popoverOptions.onClose();
    expect(onHighlight).toHaveBeenLastCalledWith(null);
    expect(readout.hidden).toBe(true);
    expect(activePoints[0].remove).toHaveBeenCalled();
    expect(markers[0].setZIndexOffset.mock.lastCall[0]).toBeGreaterThan(markers[2].setZIndexOffset.mock.lastCall[0]);
    click(markers[0]);
    expect(onHighlight).toHaveBeenLastCalledWith('first');
    expect(readout.hidden).toBe(false);
  });
});

describe('comparison map fitting', () => {
  it('fits only the chosen track and leaves layer order intact', () => {
    const { view, entries, map, order } = setup();
    view.draw(entries, 'tracks');
    const stack = [...order];
    expect(view.fitTrack('second')).toBe(true);
    expect(map.fitBounds).toHaveBeenCalledWith([[3, 1], [4, 2]], { padding: [48, 48], maxZoom: 19 });
    expect(order).toEqual(stack);
  });
  it('does not move the map for an unavailable track', () => {
    const { view, entries, map } = setup();
    view.draw(entries, 'tracks');
    expect(view.fitTrack('unavailable')).toBe(false);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });
});
