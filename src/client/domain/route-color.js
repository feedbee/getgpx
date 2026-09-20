import { groupGradientRuns } from './gradient.js';
import { groupQualityRuns, groupSurfaceRuns, groupWayTypeRuns } from './surface.js';

export function colorRunsForMode(points, mode) {
  if (mode === 'quality') {
    return groupQualityRuns(points).map((run) => ({ ...run, color: run.quality.color, label: run.quality.label }));
  }
  if (mode === 'waytype') {
    return groupWayTypeRuns(points).map((run) => ({ ...run, color: run.wayType.color, label: run.wayType.label }));
  }
  if (mode === 'surface') {
    return groupSurfaceRuns(points).map((run) => ({ ...run, color: run.surface.color, label: run.surface.label }));
  }
  return groupGradientRuns(points).map((run) => ({ ...run, label: 'Градиент' }));
}

export function highlightRunsForFilter(points, filter) {
  if (!filter) return [];
  return colorRunsForMode(points, filter.kind).filter((run) => {
    if (filter.kind === 'quality') return run.quality.id === filter.id;
    if (filter.kind === 'waytype') return run.wayType.id === filter.id;
    return run.surface.id === filter.id;
  });
}
