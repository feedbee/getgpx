import { DOMParser as NodeDOMParser } from '@xmldom/xmldom';

const XmlParser = globalThis.DOMParser ?? NodeDOMParser;
const EARTH_RADIUS_M = 6_371_000;
const MOVING_SPEED_THRESHOLD_KMH = 1;

function textOf(parent, tagName) {
  return parent?.getElementsByTagName(tagName)?.[0]?.textContent?.trim() || '';
}

function haversine(a, b) {
  const radians = (value) => (value * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function parseGpx(xml, { fallbackName = 'Маршрут без названия', maxPoints = 500_000 } = {}) {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw new Error('GPX содержит неподдерживаемую XML-конструкцию.');
  }
  const document = new XmlParser().parseFromString(xml, 'application/xml');
  const parserError = document.getElementsByTagName('parsererror')[0];
  if (parserError) throw new Error('Не удалось прочитать GPX: файл содержит ошибку XML.');

  const track = document.getElementsByTagName('trk')[0];
  const route = document.getElementsByTagName('rte')[0];
  const source = track || route || document;
  const rawPoints = track
    ? Array.from(track.getElementsByTagName('trkpt'))
    : Array.from(source.getElementsByTagName('rtept'));
  if (rawPoints.length > maxPoints) throw new Error(`GPX должен содержать не более ${maxPoints.toLocaleString('ru-RU')} точек.`);

  const points = rawPoints.map((node) => {
    const timeText = textOf(node, 'time');
    const elevationText = textOf(node, 'ele');
    const elevation = elevationText === '' ? null : Number(elevationText);
    return {
      lat: Number(node.getAttribute('lat')),
      lon: Number(node.getAttribute('lon')),
      ele: Number.isFinite(elevation) ? elevation : null,
      time: timeText ? new Date(timeText) : null,
    };
  }).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));

  const pointsOfInterest = Array.from(document.getElementsByTagName('wpt')).map((node, index) => ({
    lat: Number(node.getAttribute('lat')),
    lon: Number(node.getAttribute('lon')),
    name: textOf(node, 'name') || textOf(node, 'desc') || `Точка интереса ${index + 1}`,
    type: textOf(node, 'type'),
    symbol: textOf(node, 'sym'),
  })).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));

  if (points.length < 2) throw new Error('В GPX не найдено достаточно точек маршрута.');

  return {
    name: textOf(track, 'name') || textOf(route, 'name')
      || textOf(document.getElementsByTagName('metadata')[0], 'name') || fallbackName,
    points,
    pointsOfInterest,
  };
}

export function analyzeTrack(track) {
  let distanceM = 0;
  let ascentM = 0;
  let descentM = 0;
  let movingTimeMs = 0;
  let movingDistanceM = 0;
  let minElevationM = Infinity;
  let maxElevationM = -Infinity;
  let elevationCount = 0;
  let firstTime = null;
  let lastTime = null;
  const points = track.points.map((point, index, all) => {
    if (index) {
      const segmentDistanceM = haversine(all[index - 1], point);
      distanceM += segmentDistanceM;
      const previousTime = all[index - 1].time;
      if (previousTime instanceof Date && point.time instanceof Date) {
        const segmentDurationMs = point.time.getTime() - previousTime.getTime();
        const speedKmh = (segmentDistanceM / 1000) / (segmentDurationMs / 3_600_000);
        if (segmentDurationMs > 0 && speedKmh >= MOVING_SPEED_THRESHOLD_KMH) {
          movingTimeMs += segmentDurationMs;
          movingDistanceM += segmentDistanceM;
        }
      }
      const previousElevation = all[index - 1].ele;
      if (Number.isFinite(point.ele) && Number.isFinite(previousElevation)) {
        const delta = point.ele - previousElevation;
        if (delta > 0) ascentM += delta;
        else descentM += Math.abs(delta);
      }
    }
    if (Number.isFinite(point.ele)) {
      minElevationM = Math.min(minElevationM, point.ele);
      maxElevationM = Math.max(maxElevationM, point.ele);
      elevationCount += 1;
    }
    if (point.time instanceof Date && !Number.isNaN(point.time.getTime())) {
      firstTime ??= point.time;
      lastTime = point.time;
    }
    return { ...point, distanceKm: distanceM / 1000 };
  });

  const durationMs = firstTime && lastTime && firstTime !== lastTime
    ? lastTime.getTime() - firstTime.getTime()
    : null;

  return {
    ...track,
    points,
    distanceKm: distanceM / 1000,
    ascentM: Math.round(ascentM),
    descentM: Math.round(descentM),
    minElevationM: elevationCount ? Math.round(minElevationM) : null,
    maxElevationM: elevationCount ? Math.round(maxElevationM) : null,
    durationMs: durationMs > 0 ? durationMs : null,
    movingTimeMs: movingTimeMs > 0 ? Math.min(movingTimeMs, durationMs || movingTimeMs) : null,
    movingSpeedThresholdKmh: MOVING_SPEED_THRESHOLD_KMH,
    movingAverageSpeedKmh: movingTimeMs > 0 ? (movingDistanceM / 1000) / (movingTimeMs / 3_600_000) : null,
    averageSpeedKmh: durationMs > 0 ? (distanceM / 1000) / (durationMs / 3_600_000) : null,
    hasElevation: elevationCount === points.length && elevationCount > 1,
  };
}
