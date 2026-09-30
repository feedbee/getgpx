import { describe, expect, it, vi } from 'vitest';
import { createRouteSummaryView } from '../../../src/client/route-page-summary.js';

function fakeDocument() {
  const elements = new Map();
  return {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {
        classList: { remove: vi.fn(), toggle: vi.fn() }, setAttribute: vi.fn(),
        dataset: {}, hidden: false, innerHTML: '', textContent: '',
      });
      return elements.get(selector);
    },
    querySelectorAll: () => [],
  };
}

describe('route page summary', () => {
  it('shows a route summary while its detailed analysis is loading', () => {
    const documentRef = fakeDocument();
    const setDetailedView = vi.fn();
    const onFiltersRendered = vi.fn();
    const renderPointsOfInterest = vi.fn();
    const view = createRouteSummaryView({ documentRef, updatePageLanguage: vi.fn(),
      renderPointsOfInterest, setDetailedView, onFiltersRendered });

    view.renderBasicTrackHeader({ title: 'Forest ride', routeType: 'cycling', resultKind: 'ACTIVE',
      summary: { metrics: { distanceKm: 10, ascentM: 100, descentM: 100 },
        distributions: { surfaces: [], wayTypes: [], roadQualities: [] },
        climbs: [], descents: [], pointsOfInterest: [], analysisSources: {} } });

    expect(documentRef.querySelector('#track-name').textContent).toBe('Forest ride');
    expect(renderPointsOfInterest).toHaveBeenCalledWith([]);
    expect(onFiltersRendered).toHaveBeenCalledOnce();
    expect(setDetailedView).toHaveBeenCalledWith('loading');
  });
});
