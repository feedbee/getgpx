import { describe, expect, it, vi } from 'vitest';
import { createElevationMapRenderer } from '../../../src/client/elevation-map-renderer.js';
import { elevationColor } from '../../../src/client/domain/route-color.js';

describe('smooth elevation map renderer', () => {
  it('uses projected edges with endpoint colors and redraws at new zoom coordinates', () => {
    const gradients = [];
    const context = { save: vi.fn(), restore: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
      createLinearGradient: vi.fn((...coordinates) => {
        const stops = [];
        gradients.push({ coordinates, stops });
        return { addColorStop: (offset, color) => stops.push({ offset, color }) };
      }) };
    const fallback = vi.fn();
    const renderer = { _ctx: context, _drawing: true, _updatePoly: fallback };
    const leaflet = { canvas: () => renderer };
    createElevationMapRenderer(leaflet);
    const layer = { options: { elevations: [500, 600, 800], elevationRange: { min: 500, max: 800 }, weight: 5, opacity: 1 },
      _parts: [[{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 30, y: 40 }]] };
    renderer._updatePoly(layer, false);
    expect(gradients[0].coordinates).toEqual([0, 0, 10, 20]);
    expect(gradients[0].stops[0]).toEqual({ offset: 0, color: elevationColor(500, { min: 500, max: 800 }) });
    expect(gradients[0].stops.at(-1)).toEqual({ offset: 1, color: elevationColor(600, { min: 500, max: 800 }) });
    expect(gradients[0].stops.slice(1, -1)).toEqual([expect.objectContaining({ color: '#429cab' })]);
    expect(gradients[1].stops.at(-1)).toEqual({ offset: 1, color: elevationColor(800, { min: 500, max: 800 }) });
    layer._parts = [[{ x: 5, y: 5 }, { x: 25, y: 45 }, { x: 65, y: 85 }]];
    renderer._updatePoly(layer, false);
    expect(gradients[2].coordinates).toEqual([5, 5, 25, 45]);
    renderer._updatePoly({ options: {} }, false);
    expect(fallback).toHaveBeenCalled();
  });
});
