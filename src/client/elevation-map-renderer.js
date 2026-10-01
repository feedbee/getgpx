import { elevationGradientStops } from './domain/route-color.js';

// Keep every projected vertex so its elevation stays aligned with the GPX point.
export function createElevationMapRenderer(leaflet) {
  const renderer = leaflet.canvas({ padding: 0.5, pane: 'elevationPane' });
  const updatePoly = renderer._updatePoly;
  renderer._updatePoly = function (layer, closed) {
    if (!layer.options.elevations) return updatePoly.call(this, layer, closed);
    if (!this._drawing) return;
    const context = this._ctx;
    context.save();
    context.setLineDash([]);
    context.lineWidth = layer.options.weight;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.globalAlpha = layer.options.opacity;
    for (const part of layer._parts) {
      for (let index = 1; index < part.length; index += 1) {
        const from = part[index - 1];
        const to = part[index];
        if (from.x === to.x && from.y === to.y) continue;
        const gradient = context.createLinearGradient(from.x, from.y, to.x, to.y);
        for (const { offset, color } of elevationGradientStops(layer.options.elevations[index - 1], layer.options.elevations[index], layer.options.elevationRange)) {
          gradient.addColorStop(offset, color);
        }
        context.strokeStyle = gradient;
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
      }
    }
    context.restore();
  };
  return renderer;
}
