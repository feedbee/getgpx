const SURFACES = [
  { id: 'asphalt', label: 'surface.asphalt', color: '#29322d' },
  { id: 'paved', label: 'surface.paved', color: '#778279' },
  { id: 'cobblestone', label: 'surface.cobblestone', color: '#9b9489' },
  { id: 'gravel', label: 'surface.gravel', color: '#c59043' },
  { id: 'unpaved', label: 'surface.unpaved', color: '#8b563d' },
  { id: 'unknown', label: 'surface.unknown', color: '#b8bbb3' },
];

const ROAD_QUALITIES = [
  { id: 'good', label: 'quality.good', color: '#648a55' },
  { id: 'mixed', label: 'quality.mixed', color: '#d0a13b' },
  { id: 'rough', label: 'quality.rough', color: '#c45a42' },
  { id: 'unknown', label: 'surface.unknown', color: '#b8bbb3' },
];

const WAY_TYPES = [
  { id: 'road', label: 'waytype.road', color: '#202521' },
  { id: 'cycleway', label: 'waytype.cycleway', color: '#65aaa4' },
  { id: 'street', label: 'waytype.street', color: '#b6bec7' },
  { id: 'path', label: 'waytype.path', color: '#7758a6' },
  { id: 'access', label: 'waytype.access', color: '#2f7195' },
  { id: 'unknown', label: 'surface.unknown', color: '#e3e5e2' },
];

const ASPHALT = new Set(['asphalt', 'chipseal']);
const PAVED = new Set(['paved', 'concrete', 'concrete:lanes', 'concrete:plates', 'metal', 'wood']);
const COBBLESTONE = new Set(['paving_stones', 'sett', 'cobblestone']);
const GRAVEL = new Set(['gravel', 'fine_gravel', 'pebblestone', 'compacted']);
const UNPAVED = new Set(['unpaved', 'dirt', 'earth', 'ground', 'mud', 'sand', 'grass', 'grass_paver', 'rock', 'stone']);

export const surfaceCategories = SURFACES;
export const roadQualityCategories = ROAD_QUALITIES;
export const wayTypeCategories = WAY_TYPES;

export function classifyWayType(highway) {
  const value = typeof highway === 'string' ? highway.toLowerCase() : '';
  let id = 'unknown';
  if (['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].includes(value)) id = 'road';
  else if (value === 'cycleway') id = 'cycleway';
  else if (['residential', 'living_street', 'unclassified'].includes(value)) id = 'street';
  else if (['path', 'footway', 'track', 'steps', 'pedestrian'].includes(value)) id = 'path';
  else if (value === 'service') id = 'access';
  return WAY_TYPES.find((item) => item.id === id);
}

export function surfaceEmphasis(surfaceId, selectedSurfaceId) {
  if (!selectedSurfaceId) return { highlighted: false, dimmed: false };
  return surfaceId === selectedSurfaceId
    ? { highlighted: true, dimmed: false }
    : { highlighted: false, dimmed: true };
}

const ROAD_LABELS = {
  motorway: 'road.motorway', trunk: 'road.trunk', primary: 'road.primary', secondary: 'road.secondary',
  tertiary: 'road.tertiary', residential: 'road.residential', service: 'road.service', cycleway: 'road.cycleway',
  track: 'road.track', path: 'road.path', footway: 'road.footway', steps: 'road.steps',
};

export function roadTypeLabel(highway) {
  return ROAD_LABELS[highway] || (highway ? 'road.other' : 'road.unknown');
}

export function classifyRoadQuality(tags = {}) {
  const smoothness = typeof tags.smoothness === 'string' ? tags.smoothness.toLowerCase() : undefined;
  const tracktype = typeof tags.tracktype === 'string' ? tags.tracktype.toLowerCase() : undefined;
  let id = 'unknown';
  if (['excellent', 'good'].includes(smoothness)) id = 'good';
  else if (smoothness === 'intermediate') id = 'mixed';
  else if (['bad', 'very_bad', 'horrible', 'very_horrible', 'impassable'].includes(smoothness)) id = 'rough';
  else if (tracktype === 'grade1') id = 'good';
  else if (tracktype === 'grade2') id = 'mixed';
  else if (['grade3', 'grade4', 'grade5'].includes(tracktype)) id = 'rough';
  return ROAD_QUALITIES.find((item) => item.id === id);
}

export function classifySurface(tags = {}) {
  const value = typeof tags.surface === 'string' ? tags.surface.toLowerCase() : undefined;
  let id = 'unknown';
  if (ASPHALT.has(value)) id = 'asphalt';
  else if (PAVED.has(value)) id = 'paved';
  else if (COBBLESTONE.has(value)) id = 'cobblestone';
  else if (GRAVEL.has(value)) id = 'gravel';
  else if (UNPAVED.has(value)) id = 'unpaved';
  const category = SURFACES.find((item) => item.id === id);
  return { ...category, raw: value || null, highway: tags.highway || null, smoothness: tags.smoothness || null, tracktype: tags.tracktype || null, quality: classifyRoadQuality(tags) };
}

function valhallaTags(match) {
  const surfaceMap = {
    paved_smooth: { surface: 'asphalt', smoothness: 'good', inferred: true },
    paved: { surface: 'paved', smoothness: 'intermediate' },
    paved_rough: { surface: 'paved', smoothness: 'bad' },
    compacted: { surface: 'compacted', smoothness: 'intermediate' },
    gravel: { surface: 'gravel', smoothness: 'intermediate' },
    dirt: { surface: 'dirt', smoothness: 'bad' },
    path: { surface: 'ground' },
    impassable: { surface: 'ground', smoothness: 'impassable' },
  };
  const roadClass = match.roadClass === 'service_other' ? 'service' : match.roadClass;
  const highway = ['track', 'cycleway', 'footway', 'path', 'steps'].includes(match.use) ? match.use : roadClass;
  return { ...(surfaceMap[match.surface] || {}), highway };
}

export function applyValhallaMatches(points, matches) {
  let matchIndex = 0;
  return points.map((point, pointIndex) => {
    while (matchIndex < matches.length - 1 && matches[matchIndex + 1].pointIndex <= pointIndex) matchIndex += 1;
    const match = matches[matchIndex] || {};
    const fallbackTags = valhallaTags(match);
    const hasExactSurface = typeof match.osmTags?.surface === 'string';
    const hasOsmWay = match.osmTags && typeof match.osmTags === 'object';
    const tags = hasExactSurface
      ? { ...fallbackTags, ...match.osmTags, inferred: false }
      : hasOsmWay && match.surface === 'paved_smooth'
        ? { ...fallbackTags, ...match.osmTags, surface: 'paved', inferred: true }
        : fallbackTags;
    return { ...point, surface: { ...classifySurface(tags), inferred: tags.inferred === true } };
  });
}

export async function fetchValhallaMatches(points, { signal } = {}) {
  const response = await fetch('/api/surface-match', {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ points: points.map(({ lat, lon }) => ({ lat, lon })) }), signal,
  });
  if (!response.ok) throw new Error(`Surface matching: ${response.status}`);
  const result = await response.json();
  const matches = result?.data?.matches;
  if (!Array.isArray(matches) || matches.length < 2) throw new Error('Surface matching: invalid response');
  let previousIndex = -1;
  matches.forEach((match) => {
    if (!Number.isInteger(match?.pointIndex) || match.pointIndex <= previousIndex || match.pointIndex >= points.length) {
      throw new Error('Surface matching: invalid point index');
    }
    previousIndex = match.pointIndex;
  });
  return matches;
}

export function summarizeSurfaces(points) {
  const distances = Object.fromEntries(SURFACES.map(({ id }) => [id, 0]));
  points.slice(1).forEach((point, index) => {
    const distance = Math.max(0, point.distanceKm - points[index].distanceKm);
    distances[point.surface?.id || 'unknown'] += distance;
  });
  const total = Object.values(distances).reduce((sum, distance) => sum + distance, 0);
  return SURFACES.map((category) => ({
    ...category,
    distanceKm: distances[category.id],
    percent: total ? (distances[category.id] / total) * 100 : 0,
  }));
}

export function summarizeRoadQuality(points) {
  const distances = Object.fromEntries(ROAD_QUALITIES.map(({ id }) => [id, 0]));
  points.slice(1).forEach((point, index) => {
    const distance = Math.max(0, point.distanceKm - points[index].distanceKm);
    distances[point.surface?.quality?.id || 'unknown'] += distance;
  });
  const total = Object.values(distances).reduce((sum, distance) => sum + distance, 0);
  return ROAD_QUALITIES.map((category) => ({
    ...category, distanceKm: distances[category.id], percent: total ? (distances[category.id] / total) * 100 : 0,
  }));
}

export function summarizeWayTypes(points) {
  const distances = Object.fromEntries(WAY_TYPES.map(({ id }) => [id, 0]));
  points.slice(1).forEach((point, index) => {
    const distance = Math.max(0, point.distanceKm - points[index].distanceKm);
    distances[classifyWayType(point.surface?.highway).id] += distance;
  });
  const total = Object.values(distances).reduce((sum, distance) => sum + distance, 0);
  return WAY_TYPES.map((category) => ({
    ...category, distanceKm: distances[category.id], percent: total ? (distances[category.id] / total) * 100 : 0,
  }));
}

export function groupWayTypeRuns(points) {
  if (points.length < 2) return [];
  const runs = [];
  let startIndex = 0;
  let wayType = classifyWayType(points[1].surface?.highway);
  for (let index = 2; index < points.length; index += 1) {
    const next = classifyWayType(points[index].surface?.highway);
    if (next.id !== wayType.id) {
      runs.push({ startIndex, endIndex: index - 1, wayType });
      startIndex = index - 1;
      wayType = next;
    }
  }
  runs.push({ startIndex, endIndex: points.length - 1, wayType });
  return runs;
}

export function groupSurfaceRuns(points) {
  if (points.length < 2) return [];
  const runs = [];
  let startIndex = 0;
  let surface = points[1].surface || classifySurface();
  for (let index = 2; index < points.length; index += 1) {
    const next = points[index].surface || classifySurface();
    if (next.id !== surface.id) {
      runs.push({ startIndex, endIndex: index - 1, surface });
      startIndex = index - 1;
      surface = next;
    }
  }
  runs.push({ startIndex, endIndex: points.length - 1, surface });
  return runs;
}

export function groupQualityRuns(points) {
  if (points.length < 2) return [];
  const runs = [];
  let startIndex = 0;
  let quality = points[1].surface?.quality || ROAD_QUALITIES.at(-1);
  for (let index = 2; index < points.length; index += 1) {
    const next = points[index].surface?.quality || ROAD_QUALITIES.at(-1);
    if (next.id !== quality.id) {
      runs.push({ startIndex, endIndex: index - 1, quality });
      startIndex = index - 1;
      quality = next;
    }
  }
  runs.push({ startIndex, endIndex: points.length - 1, quality });
  return runs;
}
