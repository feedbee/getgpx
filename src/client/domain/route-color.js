import { groupGradientRuns } from './gradient.js';
import { groupQualityRuns, groupSurfaceRuns, groupWayTypeRuns } from './surface.js';

export const ELEVATION_COLORS = ['#3569b0', '#429cab', '#77ad73', '#e1bb46', '#e58039', '#c23b36'];

export function elevationRange(points) {
  let min = Infinity;
  let max = -Infinity;
  for (const { ele } of points) {
    if (!Number.isFinite(ele)) continue;
    min = Math.min(min, ele);
    max = Math.max(max, ele);
  }
  return { min, max };
}

export const EVEREST_ELEVATION_M = 8849;

function elevationPosition(height, range) {
  const absolute = Math.max(0, Math.min(1, height / EVEREST_ELEVATION_M));
  const min = Math.max(0, range?.min ?? Infinity);
  const max = Math.min(EVEREST_ELEVATION_M, range?.max ?? -Infinity);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return absolute;
  // Small altitude noise should not receive the full relative contrast boost.
  const weight = 0.7 * Math.min(1, (max - min) / 300);
  const relative = Math.max(0, Math.min(1, (height - min) / (max - min)));
  return absolute * (1 - weight) + relative * weight;
}

export function elevationColor(height, range) {
  if (!Number.isFinite(height)) return '#8c918b';
  const position = elevationPosition(height, range) * (ELEVATION_COLORS.length - 1);
  const index = Math.min(ELEVATION_COLORS.length - 2, Math.floor(position));
  const fraction = position - index;
  const channels = [1, 3, 5].map((start) => {
    const from = parseInt(ELEVATION_COLORS[index].slice(start, start + 2), 16);
    const to = parseInt(ELEVATION_COLORS[index + 1].slice(start, start + 2), 16);
    return Math.round(from + (to - from) * fraction).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

export function elevationGradientStops(from, to, range) {
  const stops = [{ offset: 0, color: elevationColor(from, range) }, { offset: 1, color: elevationColor(to, range) }];
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return stops;
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const boundaries = [...new Set([low, high, 0, EVEREST_ELEVATION_M, range?.min, range?.max]
    .filter(height => Number.isFinite(height) && height >= low && height <= high))].sort((a, b) => a - b);
  const addStop = (height) => {
    const offset = (height - from) / (to - from);
    if (offset > 0 && offset < 1) stops.push({ offset, color: elevationColor(height, range) });
  };
  boundaries.forEach(addStop);
  for (let index = 1; index < boundaries.length; index += 1) {
    const start = boundaries[index - 1];
    const end = boundaries[index];
    const startPosition = elevationPosition(start, range);
    const endPosition = elevationPosition(end, range);
    for (let anchor = 1; anchor < ELEVATION_COLORS.length - 1; anchor += 1) {
      const position = anchor / (ELEVATION_COLORS.length - 1);
      if (position > startPosition && position < endPosition) {
        addStop(start + (end - start) * (position - startPosition) / (endPosition - startPosition));
      }
    }
  }
  return stops.sort((a, b) => a.offset - b.offset);
}

function groupElevationRuns(points) {
  const range = elevationRange(points);
  if (points.length === 1) return [{ startIndex: 0, endIndex: 0, startColor: elevationColor(points[0].ele, range), color: elevationColor(points[0].ele, range), label: 'common.elevation' }];
  return points.slice(1).map((point, index) => ({
    startIndex: index, endIndex: index + 1,
    startColor: elevationColor(points[index].ele, range), color: elevationColor(point.ele, range), label: 'common.elevation',
  }));
}

export function colorRunsForMode(points, mode) {
  if (mode === 'elevation') return groupElevationRuns(points);
  if (mode === 'quality') {
    return groupQualityRuns(points).map((run) => ({ ...run, color: run.quality.color, label: run.quality.label }));
  }
  if (mode === 'waytype') {
    return groupWayTypeRuns(points).map((run) => ({ ...run, color: run.wayType.color, label: run.wayType.label }));
  }
  if (mode === 'surface') {
    return groupSurfaceRuns(points).map((run) => ({ ...run, color: run.surface.color, label: run.surface.label }));
  }
  return groupGradientRuns(points).map((run) => ({ ...run, label: 'common.gradient' }));
}

export function profileColorRuns(points, mode) {
  return {
    area: colorRunsForMode(points, 'gradient'),
    line: colorRunsForMode(points, mode),
  };
}

export function highlightRunsForFilter(points, filter) {
  if (!filter) return [];
  return colorRunsForMode(points, filter.kind).filter((run) => {
    if (filter.kind === 'quality') return run.quality.id === filter.id;
    if (filter.kind === 'waytype') return run.wayType.id === filter.id;
    return run.surface.id === filter.id;
  });
}
