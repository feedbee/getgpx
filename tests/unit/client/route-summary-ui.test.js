import { describe, expect, it, vi } from 'vitest';
import { renderClimbs, renderSurfaces } from '../../../src/client/route-summary-ui.js';
import { roadQualityCategories, surfaceCategories, wayTypeCategories } from '../../../src/client/domain/surface.js';

function fakeDocument() {
  const elements = new Map();
  return {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, { innerHTML: '', textContent: '', dataset: {} });
      return elements.get(selector);
    },
    querySelectorAll: () => [],
  };
}

describe('route summary rendering', () => {
  it.each([
    ['surfaces', 'surface', 'surface', surfaceCategories],
    ['wayTypes', 'way-type', 'waytype', wayTypeCategories],
    ['roadQualities', 'quality', 'quality', roadQualityCategories],
  ].flatMap((entry) => [false, true].map((sortBarsBySize) => [...entry, sortBarsBySize])))('preserves %s list order with bar mode case %#', (distribution, selector, filter, categories, sortBarsBySize) => {
    const documentRef = fakeDocument();
    const shares = [10, 45, 45];
    const items = categories.slice(0, 3).map((category, index) => ({
      id: category.id, percent: shares[index], distanceKm: shares[index] / 10,
    }));
    const distributions = { surfaces: [], wayTypes: [], roadQualities: [], [distribution]: items };
    const original = structuredClone(distributions);
    renderSurfaces({ distributions }, { documentRef, sortBarsBySize });
    const ids = (suffix) => [...documentRef.querySelector(`#${selector}-${suffix}`).innerHTML
      .matchAll(new RegExp(`data-${filter}-filter="([^"]+)"`, 'g'))].map((match) => match[1]);

    expect(ids('bar')).toEqual(sortBarsBySize
      ? [categories[1].id, categories[2].id, categories[0].id]
      : categories.slice(0, 3).map((category) => category.id));
    expect(ids('stats')).toEqual(categories.map((category) => category.id));
    expect(distributions).toEqual(original);

    renderSurfaces({ distributions: { ...distributions, [distribution]: [] } }, { documentRef, sortBarsBySize });
    expect(ids('bar')).toEqual([]);
    expect(ids('stats')).toEqual(categories.map((category) => category.id));
  });

  it('keeps bar segments in category order by default', () => {
    const documentRef = fakeDocument();
    renderSurfaces({ distributions: {
      surfaces: [{ id: 'asphalt', percent: 10, distanceKm: 1 }, { id: 'gravel', percent: 90, distanceKm: 9 }],
      wayTypes: [], roadQualities: [],
    } }, { documentRef });
    const bar = documentRef.querySelector('#surface-bar').innerHTML;
    expect(bar.indexOf('data-surface-filter="asphalt"')).toBeLessThan(bar.indexOf('data-surface-filter="gravel"'));
  });

  it('shows separate climb and descent counts', () => {
    const documentRef = fakeDocument();
    renderClimbs({ climbs: [], descents: [] }, documentRef);
    expect(documentRef.querySelector('#climbs-count').textContent).toBe(0);
    expect(documentRef.querySelector('#descents-count').textContent).toBe(0);
    expect(documentRef.querySelector('#climbs-list').innerHTML).toContain('empty-climbs');
  });

  it('renders distributions before refreshing route focus', () => {
    const documentRef = fakeDocument();
    const onFiltersRendered = vi.fn(() => {
      expect(documentRef.querySelector('#surface-stats').innerHTML).toContain('surface-stat');
    });
    renderSurfaces({ distributions: { surfaces: [], wayTypes: [], roadQualities: [] } },
      { documentRef, onFiltersRendered });
    expect(onFiltersRendered).toHaveBeenCalledOnce();
  });
});
