import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRouteSummaryView } from '../../../src/client/route-page-summary.js';

const clientConfig = vi.hoisted(() => ({ SORT_DISTRIBUTION_BARS_BY_SIZE: false }));
vi.mock('../../../src/client/config.js', () => clientConfig);
beforeEach(() => { clientConfig.SORT_DISTRIBUTION_BARS_BY_SIZE = false; });

function fakeDocument() {
  const elements = new Map();
  return {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {
        classList: { remove: vi.fn(), toggle: vi.fn() }, setAttribute: vi.fn(),
        handlers: {}, addEventListener(name, callback) { this.handlers[name] = callback; }, checked: false,
        dataset: {}, hidden: false, innerHTML: '', textContent: '',
      });
      return elements.get(selector);
    },
    querySelectorAll: () => [],
  };
}

describe('route page summary', () => {
  it('resorts every bar after range changes and selection toggles when sorting is configured', () => {
    clientConfig.SORT_DISTRIBUTION_BARS_BY_SIZE = true;
    const documentRef = fakeDocument();
    const view = createRouteSummaryView({ documentRef });
    const track = { points: [
      { distanceKm: 0 },
      { distanceKm: 7, surface: { id: 'asphalt', quality: { id: 'good' }, highway: 'primary' } },
      { distanceKm: 8, surface: { id: 'gravel', quality: { id: 'mixed' }, highway: 'cycleway' } },
      { distanceKm: 10, surface: { id: 'gravel', quality: { id: 'mixed' }, highway: 'cycleway' } },
      { distanceKm: 11, surface: { id: 'asphalt', quality: { id: 'good' }, highway: 'primary' } },
    ] };
    const specs = [
      ['surfaces', 'surface', 'surface', 'asphalt', 'gravel'],
      ['wayTypes', 'way-type', 'waytype', 'road', 'cycleway'],
      ['roadQualities', 'quality', 'quality', 'good', 'mixed'],
    ];
    const fullSummary = { distributions: Object.fromEntries(specs.map(([distribution, , , first, second]) => [
      distribution, [{ id: second, distanceKm: 3, percent: 100 * 3 / 11 },
        { id: first, distanceKm: 8, percent: 100 * 8 / 11 }],
    ])) };
    const listOrders = new Map();
    function expectOrder(selectionDominates) {
      for (const [, selector, filter, first, second] of specs) {
        const ids = (suffix) => [...documentRef.querySelector(`#${selector}-${suffix}`).innerHTML
          .matchAll(new RegExp(`data-${filter}-filter="([^"]+)"`, 'g'))].map((match) => match[1]);
        expect(ids('bar')).toEqual(selectionDominates ? [second, first] : [first, second]);
        if (!listOrders.has(selector)) listOrders.set(selector, ids('stats'));
        expect(ids('stats')).toEqual(listOrders.get(selector));
      }
    }
    view.renderRangeDistributions(track, [0, 4], fullSummary);
    expectOrder(false);
    view.renderRangeDistributions(track, [1, 4], fullSummary);
    expectOrder(true);
    const toggle = documentRef.querySelector('#distribution-selection-toggle');
    toggle.checked = false;
    toggle.handlers.change();
    expectOrder(false);
    toggle.checked = true;
    toggle.handlers.change();
    expectOrder(true);
    view.renderRangeDistributions(track, [0, 2], fullSummary);
    expectOrder(false);
    view.renderRangeDistributions(track, [0, 4], fullSummary);
    expectOrder(false);
  });

  it('toggles all distributions and retains the choice across clearing and reselecting a range', () => {
    const documentRef = fakeDocument();
    const onDistributionsRendered = vi.fn();
    const view = createRouteSummaryView({ documentRef, onDistributionsRendered });
    const track = { points: [
      { distanceKm: 0 },
      { distanceKm: 1, surface: { id: 'asphalt', quality: { id: 'good' }, highway: 'primary' } },
      { distanceKm: 2, surface: { id: 'gravel', quality: { id: 'mixed' }, highway: 'cycleway' } },
      { distanceKm: 3, surface: { id: 'gravel', quality: { id: 'mixed' }, highway: 'cycleway' } },
    ] };
    const fullSummary = { distributions: {
      surfaces: [{ id: 'asphalt', distanceKm: 1, percent: 33 }, { id: 'gravel', distanceKm: 2, percent: 67 }],
      wayTypes: [{ id: 'road', distanceKm: 1, percent: 33 }, { id: 'cycleway', distanceKm: 2, percent: 67 }],
      roadQualities: [{ id: 'good', distanceKm: 1, percent: 33 }, { id: 'mixed', distanceKm: 2, percent: 67 }],
    } };
    const toggle = documentRef.querySelector('#distribution-selection-toggle');
    const control = documentRef.querySelector('#distribution-selection-control');
    const distributions = () => ['surface', 'way-type', 'quality'].map((prefix) => ({
      bar: documentRef.querySelector(`#${prefix}-bar`).innerHTML,
      stats: documentRef.querySelector(`#${prefix}-stats`).innerHTML,
    }));
    expect(control.hidden).toBe(true);
    expect(toggle.checked).toBe(true);
    view.renderRangeDistributions(track, [0, 3], fullSummary);
    const full = distributions();
    view.renderRangeDistributions(track, [1, 3], fullSummary);
    const selected = distributions();
    expect(control.hidden).toBe(false);
    expect(selected).not.toEqual(full);
    toggle.checked = false;
    toggle.handlers.change();
    expect(distributions()).toEqual(full);
    expect(onDistributionsRendered).toHaveBeenCalledTimes(3);
    view.renderRangeDistributions(track, [0, 3], fullSummary);
    expect(control.hidden).toBe(true);
    view.renderRangeDistributions(track, [1, 3], fullSummary);
    expect(control.hidden).toBe(false);
    expect(toggle.checked).toBe(false);
    expect(distributions()).toEqual(full);
    toggle.checked = true;
    toggle.handlers.change();
    expect(distributions()).toEqual(selected);
    const freshDocument = fakeDocument();
    createRouteSummaryView({ documentRef: freshDocument });
    expect(freshDocument.querySelector('#distribution-selection-toggle').checked).toBe(true);
  });

  it('recalculates all road distributions for the profile range and restores metadata on reset', () => {
    const documentRef = fakeDocument();
    const view = createRouteSummaryView({ documentRef });
    const points = [
      { distanceKm: 0, surface: { id: 'asphalt', quality: { id: 'good' }, highway: 'primary' } },
      { distanceKm: 5, surface: { id: 'asphalt', quality: { id: 'good' }, highway: 'primary' } },
      { distanceKm: 6, surface: { id: 'gravel', quality: { id: 'mixed' }, highway: 'cycleway' } },
      { distanceKm: 9, surface: { id: 'unpaved', quality: { id: 'rough' }, highway: 'path' } },
    ];
    const fullSummary = { distributions: {
      surfaces: [{ id: 'asphalt', distanceKm: 5, percent: 55.5 }],
      wayTypes: [{ id: 'road', distanceKm: 5, percent: 55.5 }],
      roadQualities: [{ id: 'good', distanceKm: 5, percent: 55.5 }],
    } };
    const original = structuredClone({ points, fullSummary });
    const specs = [
      ['surface', 'surface', ['gravel', 'unpaved'], 'asphalt'],
      ['way-type', 'waytype', ['cycleway', 'path'], 'road'],
      ['quality', 'quality', ['mixed', 'rough'], 'good'],
    ];
    view.renderRangeDistributions({ points }, [1, 3], fullSummary);
    for (const [selector, filter, selected, excluded] of specs) {
      const bar = documentRef.querySelector(`#${selector}-bar`).innerHTML;
      expect(bar).toContain(`data-${filter}-filter="${selected[0]}"`);
      expect(bar).toContain('flex:25');
      expect(bar).toContain(`data-${filter}-filter="${selected[1]}"`);
      expect(bar).toContain('flex:75');
      expect(bar).not.toContain(`data-${filter}-filter="${excluded}"`);
      const stats = documentRef.querySelector(`#${selector}-stats`).innerHTML;
      expect(stats).toContain('<strong>1 km</strong>');
      expect(stats).toContain('<strong>3 km</strong>');
    }
    view.renderRangeDistributions({ points }, [0, 3], fullSummary);
    for (const [selector, filter, , restored] of specs) {
      const bar = documentRef.querySelector(`#${selector}-bar`).innerHTML;
      expect(bar).toContain(`data-${filter}-filter="${restored}"`);
      expect(bar).toContain('flex:55.5');
    }
    expect({ points, fullSummary }).toEqual(original);
  });

  it('handles unknown classifications and zero-distance ranges without invalid percentages', () => {
    const documentRef = fakeDocument();
    const view = createRouteSummaryView({ documentRef });
    const track = { points: [{ distanceKm: 0 }, { distanceKm: 2 }, { distanceKm: 2 }, { distanceKm: 2 }] };
    view.renderRangeDistributions(track, [0, 2]);
    for (const selector of ['surface', 'way-type', 'quality']) {
      expect(documentRef.querySelector(`#${selector}-bar`).innerHTML).toContain('flex:100');
    }
    view.renderRangeDistributions(track, [1, 3]);
    for (const selector of ['surface', 'way-type', 'quality']) {
      expect(documentRef.querySelector(`#${selector}-bar`).innerHTML).toBe('');
      expect(documentRef.querySelector(`#${selector}-stats`).innerHTML).not.toMatch(/NaN|Infinity/);
    }
    const toggle = documentRef.querySelector('#distribution-selection-toggle');
    toggle.checked = false;
    toggle.handlers.change();
    for (const selector of ['surface', 'way-type', 'quality']) {
      expect(documentRef.querySelector(`#${selector}-bar`).innerHTML).toContain('flex:100');
    }
  });

  it('shows a route summary while its detailed analysis is loading', () => {
    const documentRef = fakeDocument();
    const setDetailedView = vi.fn();
    const onFiltersRendered = vi.fn();
    const renderPointsOfInterest = vi.fn();
    const view = createRouteSummaryView({ documentRef, updatePageLanguage: vi.fn(),
      renderPointsOfInterest, setDetailedView, onFiltersRendered });

    view.renderBasicTrackHeader({ title: 'Forest ride', routeType: 'cycling', revision: 'one',
      metrics: { distanceKm: 10, ascentM: 100, descentM: 100 },
        distributions: { surfaces: [], wayTypes: [], roadQualities: [] },
        climbs: [], descents: [], pointsOfInterest: [], sources: {} });

    expect(documentRef.querySelector('#track-name').textContent).toBe('Forest ride');
    expect(renderPointsOfInterest).toHaveBeenCalledWith([]);
    expect(onFiltersRendered).toHaveBeenCalledOnce();
    expect(setDetailedView).toHaveBeenCalledWith('loading');
  });
});
