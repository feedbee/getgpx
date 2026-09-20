import { describe, expect, it } from 'vitest';
import { colorRunsForMode, highlightRunsForFilter, profileColorRuns } from '../../../src/client/domain/route-color.js';

const points = [
  { surface: { id: 'asphalt', color: '#111', highway: 'secondary', quality: { id: 'good', color: '#0a0' } }, grade: 1 },
  { surface: { id: 'asphalt', color: '#111', highway: 'secondary', quality: { id: 'good', color: '#0a0' } }, grade: 2 },
  { surface: { id: 'gravel', color: '#222', highway: 'track', quality: { id: 'rough', color: '#a00' } }, grade: 5 },
];

describe('route color layers', () => {
  it('keeps the selected base mode independent from a highlighted filter', () => {
    expect(colorRunsForMode(points, 'surface').map((run) => run.color)).toEqual(['#111', '#222']);
    expect(highlightRunsForFilter(points, { kind: 'quality', id: 'good' })).toEqual([
      expect.objectContaining({ startIndex: 0, endIndex: 1, color: '#0a0' }),
    ]);
  });

  it('supports road quality as a base color mode', () => {
    expect(colorRunsForMode(points, 'quality').map((run) => run.color)).toEqual(['#0a0', '#a00']);
  });

  it('returns no overlay when no filter is highlighted', () => {
    expect(highlightRunsForFilter(points, null)).toEqual([]);
  });

  it('provides gradient colors for the profile ribbon', () => {
    expect(colorRunsForMode(points, 'gradient').map((run) => run.color)).toEqual(['#84a83f', '#d6b737']);
  });

  it.each(['gradient', 'surface', 'waytype', 'quality'])('keeps gradient area colors behind %s profile lines', (mode) => {
    expect(profileColorRuns(points, mode).area.map((run) => run.color)).toEqual(['#84a83f', '#d6b737']);
  });
});
