import process from 'node:process';
import { createHash } from 'node:crypto';
import { createMapboxPreviewProvider } from './mapbox.js';

// Provider contract: { provider, style, rendererVersion, version, attribution,
//   render([{ lat, lon }]) -> Buffer<PNG> }.
// No provider URLs or credentials cross the browser boundary.
export function createTrackPreviewProvider(environment = process.env, dependencies = {}) {
  const name = environment.TRACK_PREVIEW_PROVIDER || 'none';
  if (name === 'none') return null;
  if (name !== 'mapbox') throw new Error('TRACK_PREVIEW_PROVIDER must be none or mapbox.');
  const token = environment.MAPBOX_ACCESS_TOKEN;
  if (!token?.trim()) throw new Error('MAPBOX_ACCESS_TOKEN is required for Mapbox previews.');
  const style = environment.MAPBOX_PREVIEW_STYLE || 'mapbox/streets-v12';
  if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(style)) throw new Error('MAPBOX_PREVIEW_STYLE must be owner/style-id.');
  const version = createHash('sha256').update(`mapbox-v3:${style}`).digest('hex').slice(0, 16);
  return createMapboxPreviewProvider({ token, style, version, ...dependencies });
}
