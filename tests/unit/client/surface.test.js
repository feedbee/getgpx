import { describe, expect, it } from 'vitest';
import { applyValhallaMatches, classifyRoadQuality, classifySurface, classifyWayType, groupQualityRuns, summarizeRoadQuality, summarizeSurfaces, summarizeWayTypes, surfaceEmphasis } from '../../../src/client/domain/surface.js';

describe('surfaceEmphasis', () => {
  it('highlights the selected surface and dims every other surface', () => {
    expect(surfaceEmphasis('asphalt', null)).toEqual({ highlighted: false, dimmed: false });
    expect(surfaceEmphasis('asphalt', 'asphalt')).toEqual({ highlighted: true, dimmed: false });
    expect(surfaceEmphasis('gravel', 'asphalt')).toEqual({ highlighted: false, dimmed: true });
  });
});

describe('way types', () => {
  it('groups OSM highway tags into route-friendly categories', () => {
    expect(classifyWayType('secondary').id).toBe('road');
    expect(classifyWayType('cycleway').id).toBe('cycleway');
    expect(classifyWayType('residential').id).toBe('street');
    expect(classifyWayType('path').id).toBe('path');
    expect(classifyWayType('service').id).toBe('access');
  });

  it('summarizes distance by way type without losing distance', () => {
    const points = [
      { distanceKm: 0, surface: { highway: 'secondary' } },
      { distanceKm: 2, surface: { highway: 'secondary' } },
      { distanceKm: 3, surface: { highway: 'cycleway' } },
    ];
    const summary = summarizeWayTypes(points);
    expect(summary.find((item) => item.id === 'road').distanceKm).toBe(2);
    expect(summary.find((item) => item.id === 'cycleway').distanceKm).toBe(1);
  });
});

describe('classifySurface', () => {
  it('normalizes detailed OSM values into useful product categories', () => {
    expect(classifySurface({ surface: 'asphalt' }).id).toBe('asphalt');
    expect(classifySurface({ surface: 'paving_stones' }).id).toBe('cobblestone');
    expect(classifySurface({ surface: 'fine_gravel' }).id).toBe('gravel');
    expect(classifySurface({ surface: 'earth' }).id).toBe('unpaved');
  });

  it('keeps missing surface data unknown even on major roads', () => {
    expect(classifySurface({ highway: 'primary' }).id).toBe('unknown');
  });
});

describe('applyValhallaMatches', () => {
  it('prefers exact OSM material tags over Valhalla generalized pavement', () => {
    const points = Array.from({ length: 3 }, (_, index) => ({ distanceKm: index }));
    const matches = [
      { pointIndex: 0, surface: 'paved_smooth', roadClass: 'secondary', use: 'road', osmTags: { surface: 'asphalt', highway: 'secondary' } },
      { pointIndex: 1, surface: 'paved_smooth', roadClass: 'residential', use: 'road', osmTags: { surface: 'cobblestone', highway: 'residential' } },
      { pointIndex: 2, surface: 'paved_smooth', roadClass: 'track', use: 'track', osmTags: { surface: 'ground', highway: 'track' } },
    ];

    const enriched = applyValhallaMatches(points, matches);

    expect(enriched[0].surface).toMatchObject({ id: 'asphalt', raw: 'asphalt', inferred: false });
    expect(enriched[1].surface).toMatchObject({ id: 'cobblestone', raw: 'cobblestone', inferred: false });
    expect(enriched[2].surface).toMatchObject({ id: 'unpaved', raw: 'ground', inferred: false });
  });

  it('does not call a matched OSM way asphalt when its material tag is missing', () => {
    const points = [{ distanceKm: 0 }, { distanceKm: 1 }];
    const matches = [
      { pointIndex: 0, surface: 'paved_smooth', roadClass: 'tertiary', use: 'road', osmTags: { highway: 'tertiary' } },
      { pointIndex: 1, surface: 'paved_smooth', roadClass: 'tertiary', use: 'road', osmTags: { highway: 'tertiary' } },
    ];

    const enriched = applyValhallaMatches(points, matches);

    expect(enriched[0].surface).toMatchObject({ id: 'paved', raw: 'paved', inferred: true });
  });

  it('expands sampled edge matches and treats Valhalla smooth road pavement as estimated asphalt', () => {
    const points = Array.from({ length: 5 }, (_, index) => ({ distanceKm: index }));
    const matches = [
      { pointIndex: 0, surface: 'paved_smooth', roadClass: 'secondary', use: 'road', matchType: 'matched' },
      { pointIndex: 3, surface: 'gravel', roadClass: 'service_other', use: 'track', matchType: 'matched' },
      { pointIndex: 4, surface: 'gravel', roadClass: 'service_other', use: 'track', matchType: 'matched' },
    ];

    const enriched = applyValhallaMatches(points, matches);

    expect(enriched[0].surface).toMatchObject({ id: 'asphalt', quality: { id: 'good' }, highway: 'secondary', inferred: true });
    expect(enriched[2].surface.id).toBe('asphalt');
    expect(enriched[3].surface).toMatchObject({ id: 'gravel', highway: 'track' });
  });
});

describe('summarizeSurfaces', () => {
  it('counts distance by the destination point surface without losing total distance', () => {
    const points = [
      { distanceKm: 0, surface: { id: 'unknown' } },
      { distanceKm: 1, surface: { id: 'asphalt' } },
      { distanceKm: 1.5, surface: { id: 'gravel' } },
    ];

    const summary = summarizeSurfaces(points);

    expect(summary.find((item) => item.id === 'asphalt').distanceKm).toBe(1);
    expect(summary.find((item) => item.id === 'gravel').distanceKm).toBe(0.5);
    expect(summary.reduce((sum, item) => sum + item.distanceKm, 0)).toBe(1.5);
  });
});

describe('classifyRoadQuality', () => {
  it('uses smoothness before the less precise tracktype value', () => {
    expect(classifyRoadQuality({ smoothness: 'excellent', tracktype: 'grade4' }).id).toBe('good');
    expect(classifyRoadQuality({ smoothness: 'intermediate' }).id).toBe('mixed');
    expect(classifyRoadQuality({ smoothness: 'very_bad' }).id).toBe('rough');
  });

  it('falls back to tracktype and leaves absent tags unknown', () => {
    expect(classifyRoadQuality({ tracktype: 'grade1' }).id).toBe('good');
    expect(classifyRoadQuality({ tracktype: 'grade2' }).id).toBe('mixed');
    expect(classifyRoadQuality({ tracktype: 'grade4' }).id).toBe('rough');
    expect(classifyRoadQuality({}).id).toBe('unknown');
  });
});

describe('summarizeRoadQuality', () => {
  it('calculates rough and unknown distance independently from surface material', () => {
    const points = [
      { distanceKm: 0, surface: { quality: { id: 'unknown' } } },
      { distanceKm: 2, surface: { quality: { id: 'rough' } } },
      { distanceKm: 3, surface: { quality: { id: 'unknown' } } },
    ];

    const summary = summarizeRoadQuality(points);

    expect(summary.find((item) => item.id === 'rough').distanceKm).toBe(2);
    expect(summary.find((item) => item.id === 'unknown').distanceKm).toBe(1);
  });

  it('groups adjacent points by road quality for map and profile highlighting', () => {
    const points = [
      { surface: { quality: { id: 'good', label: 'Хорошее', color: '#0a0' } } },
      { surface: { quality: { id: 'good', label: 'Хорошее', color: '#0a0' } } },
      { surface: { quality: { id: 'rough', label: 'Плохое', color: '#a00' } } },
      { surface: { quality: { id: 'rough', label: 'Плохое', color: '#a00' } } },
    ];

    expect(groupQualityRuns(points).map(({ startIndex, endIndex, quality }) => ({ startIndex, endIndex, id: quality.id }))).toEqual([
      { startIndex: 0, endIndex: 1, id: 'good' },
      { startIndex: 1, endIndex: 3, id: 'rough' },
    ]);
  });
});
