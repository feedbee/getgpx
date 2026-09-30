import { describe, expect, it, vi } from 'vitest';
import { renderClimbs, renderSurfaces } from '../../../src/client/route-summary-ui.js';

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
