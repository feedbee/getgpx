export const DEFAULT_ROUTE_TYPE = 'other';

export const ROUTE_TYPE_IDS = Object.freeze([
  'cycling', 'road-cycling', 'gravel-cycling', 'mountain-biking',
  'hiking', 'running', 'walking', 'driving', 'motorcycling', 'swimming',
  'winter-sports', 'other',
]);

const ROUTE_TYPE_SET = new Set(ROUTE_TYPE_IDS);

export function isRouteType(value) {
  return typeof value === 'string' && ROUTE_TYPE_SET.has(value);
}

export function normalizeRouteType(value) {
  return isRouteType(value) ? value : DEFAULT_ROUTE_TYPE;
}
