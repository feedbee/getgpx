import { describe, expect, it } from 'vitest';
import { updatePoiSelection } from '../../../src/client/domain/poi-selection.js';

const EMPTY = { hoveredIndex: null, pinnedIndex: null, returnPointIndex: null };

describe('updatePoiSelection', () => {
  it('temporarily selects a hovered POI and restores the previous profile point on leave', () => {
    const hovered = updatePoiSelection(EMPTY, { type: 'hover', index: 2, currentPointIndex: 17 });

    expect(hovered).toEqual({ hoveredIndex: 2, pinnedIndex: null, returnPointIndex: 17 });
    expect(updatePoiSelection(hovered, { type: 'leave' })).toEqual(EMPTY);
  });

  it('pins a POI on click and ignores hover until the same POI is clicked again', () => {
    const hovered = updatePoiSelection(EMPTY, { type: 'hover', index: 1, currentPointIndex: 8 });
    const pinned = updatePoiSelection(hovered, { type: 'toggle', index: 1, currentPointIndex: 8 });

    expect(pinned).toEqual({ hoveredIndex: null, pinnedIndex: 1, returnPointIndex: 8 });
    expect(updatePoiSelection(pinned, { type: 'hover', index: 3, currentPointIndex: 25 })).toEqual(pinned);
    expect(updatePoiSelection(pinned, { type: 'toggle', index: 1, currentPointIndex: 25 })).toEqual(EMPTY);
  });
});
