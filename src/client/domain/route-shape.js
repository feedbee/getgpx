const EARTH_RADIUS_M = 6_371_000;

function distanceM(a, b) {
  const radians = (value) => (value * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function endpointDistanceM(points) {
  if (points.length < 2) return Infinity;
  return distanceM(points[0], points.at(-1));
}

export function isClosedRoute(points, thresholdM = 10) {
  return endpointDistanceM(points) < thresholdM;
}
