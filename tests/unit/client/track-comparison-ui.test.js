import { describe, expect, it, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
const lifecycle = vi.hoisted(() => ({ load: vi.fn(), map: { draw: vi.fn(), reorder: vi.fn(), highlight: vi.fn(), fitTrack: vi.fn(), invalidateSize: vi.fn() } }));
vi.mock('../../../src/client/comparison-map.js', () => ({ createComparisonMap: () => lifecycle.map }));
vi.mock('../../../src/client/track-comparison.js', async importOriginal => ({ ...await importOriginal(), loadComparisonTrack: (...args) => lifecycle.load(...args) }));
import { setupTrackComparison } from '../../../src/client/track-comparison-ui.js';

function setup() {
  const nodes = new Map();
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, { hidden: false, events: {}, classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
      animate: vi.fn(), setAttribute: vi.fn(), querySelector: child => node(`${selector} ${child}`),
      addEventListener(event, handler) { this.events[event] = handler; } });
    return nodes.get(selector);
  }
  const storage = { value: '[]', getItem() { return this.value; }, setItem(key, value) { this.value = value; } };
  const location = { assign: vi.fn() };
  const control = setupTrackComparison({ trackApi: {}, isComparisonPage: false, documentRef: { querySelector: node },
    windowRef: { localStorage: storage, addEventListener: vi.fn(), setTimeout: vi.fn(), location } });
  return { control, node, storage, location };
}

describe('comparison actions', () => {
  it('shows an icon alone when empty, then a label and badge from the first selection', () => {
    const { control, node } = setup();
    expect(node('#comparison-link').hidden).toBe(false);
    expect(node('#comparison-link').innerHTML).not.toContain('<span>');
    expect(node('#comparison-link').animate).not.toHaveBeenCalled();
    control.setTrack('first');
    node('#comparison-toggle').events.click();
    expect(node('#comparison-link').innerHTML).toContain('comparison-count">1');
    expect(node('#comparison-link').href).toBe('/compare?tracks=first');
    expect(node('#comparison-toggle').setAttribute).toHaveBeenCalledWith('aria-pressed', 'true');
    expect(node('#comparison-link .comparison-count').animate).toHaveBeenCalledTimes(1);
    expect(node('#comparison-link').animate).toHaveBeenCalledTimes(1);
    control.setTrack('second');
    node('#comparison-toggle').events.click();
    expect(node('#comparison-link').hidden).toBe(false);
    expect(node('#comparison-link').innerHTML).toContain('comparison-count">2');
    expect(node('#comparison-link .comparison-count').animate).toHaveBeenCalledTimes(2);
    node('#comparison-toggle').events.click();
    expect(node('#comparison-toggle').setAttribute).toHaveBeenCalledWith('aria-pressed', 'false');
    expect(node('#comparison-link').href).toBe('/compare?tracks=first');
  });
  it('adds checked tracks to the existing selection and disables when capacity is exhausted', () => {
    const { control, node, storage, location } = setup();
    expect(node('#bulk-compare-tracks').disabled).toBe(true);
    control.setCheckedTracks(Array.from({ length: 7 }, (_, index) => ({ id: `track${index}` })));
    node('#bulk-compare-tracks').events.click();
    control.setCheckedTracks([{ id: 'last' }, { id: 'extra' }]);
    expect(node('#bulk-compare-tracks').disabled).toBe(true);
    control.setCheckedTracks([{ id: 'last' }]);
    expect(node('#bulk-compare-tracks').disabled).toBe(false);
    node('#bulk-compare-tracks').events.click();
    expect(JSON.parse(storage.value)).toEqual([...Array.from({ length: 7 }, (_, index) => `track${index}`), 'last']);
    expect(node('#bulk-compare-tracks').disabled).toBe(true);
    expect(location.assign).not.toHaveBeenCalled();
  });
  it('does not claim the limit is exceeded when checked tracks are already selected', () => {
    const { control, node } = setup();
    control.setCheckedTracks([{ id: 'first' }]);
    node('#bulk-compare-tracks').events.click();
    expect(node('#bulk-compare-tracks').disabled).toBe(true);
    expect(node('#bulk-compare-tracks').title).toBe('');
  });
  it('disables a new track at the limit while keeping removal enabled', () => {
    const { control, node } = setup();
    control.setCheckedTracks(Array.from({ length: 8 }, (_, index) => ({ id: `track${index}` })));
    node('#bulk-compare-tracks').events.click();
    control.setTrack('new');
    expect(node('#comparison-toggle').disabled).toBe(true);
    control.setTrack('track0');
    expect(node('#comparison-toggle').disabled).toBe(false);
    node('#comparison-toggle').events.click();
    control.setTrack('new');
    expect(node('#comparison-toggle').disabled).toBe(false);
  });
});

function setupPage() {
  const nodes = new Map();
  let documentRef;
  function node(selector, parent = null) {
    if (nodes.has(selector)) return nodes.get(selector);
    const element = { dataset: {}, children: [], events: {}, style: { setProperty: vi.fn() },
      classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() }, setAttribute: vi.fn(),
      querySelector(child) {
        const element = node(`${selector} ${child}`, this);
        const attribute = child.match(/^\[(data-[a-z-]+)\]$/)?.[1];
        if (attribute) {
          const markup = this.innerHTML?.match(new RegExp(`<button[^>]*${attribute}[^>]*>`))?.[0] || '';
          element.hidden = /\bhidden\b/.test(markup);
          element.disabled = /\bdisabled\b/.test(markup);
        }
        return element;
      },
      querySelectorAll() { return this.children; },
      hasAttribute(attribute) { return selector.endsWith(`[${attribute}]`); },
      closest() { return parent; },
      contains(target) { return target === this || target?.closest() === this; },
      focus() { if (!this.hidden && !this.disabled) documentRef.activeElement = this; },
      replaceChildren() { this.children = []; documentRef.activeElement = null; },
      append(...children) { this.children.push(...children); }, after: vi.fn(),
      addEventListener(event, handler) { this.events[event] = handler; },
    };
    nodes.set(selector, element);
    return element;
  }
  let rowIndex = 0;
  documentRef = { activeElement: null, querySelector: node,
    querySelectorAll: () => node('main #comparison-list').children,
    createElement(tag) { return node(tag === 'main' ? 'main' : `row-${rowIndex++}`); } };
  // The UI uses both global and page-local selectors for the same list.
  const list = node('main #comparison-list');
  nodes.set('#comparison-list', list);
  const windowRef = { localStorage: { getItem: () => null, setItem: vi.fn() },
    addEventListener: vi.fn(), setTimeout: vi.fn(), location: { search: '?tracks=first,second' },
    history: { replaceState: vi.fn() } };
  const pending = new Map();
  const failures = new Map();
  lifecycle.load.mockImplementation((api, id) => new Promise((resolve, reject) => { pending.set(id, resolve); failures.set(id, reject); }));
  setupTrackComparison({ trackApi: {}, isComparisonPage: true, documentRef, windowRef });
  return { list, documentRef, pending, failures, node };
}

describe('comparison page lifecycle', () => {
  it('shows the track owner after metadata loads using the favorite-list attribution', async () => {
    const { list, pending } = setupPage();
    pending.get('first')({ metadata: { title: 'First', author: { displayName: '<Owner>', avatarUrl: 'https://example.test/avatar.png' } }, track: { points: [] } });
    await Promise.resolve();
    const author = list.children[0].querySelector('.comparison-author').children[0];
    expect(author.className).toBe('track-card-author');
    const avatar = author.children[0];
    expect(avatar.src).toBe('https://example.test/avatar.png');
    expect(avatar.referrerPolicy).toBe('no-referrer');
    expect(author.children[1].textContent).toBe('<Owner>');
  });
  it('offers a crossed-out eye to hide and an open eye to show a track', () => {
    const { list } = setupPage();
    expect(list.children[0].innerHTML).toContain('comparison-row-footer');
    expect(list.children[0].innerHTML).toContain('comparison-eye-slash');
    list.children[0].querySelector('[data-visibility]').events.click();
    expect(list.children[0].innerHTML).not.toContain('comparison-eye-slash');
    expect(list.children[0].innerHTML).toContain('data-visibility aria-pressed="true"');
    list.children[0].querySelector('[data-visibility]').events.click();
    expect(list.children[0].innerHTML).toContain('comparison-eye-slash');
  });
  it('keeps loading in the heading without adding a status row', async () => {
    const { list, pending } = setupPage();
    expect(list.children[0].innerHTML).toContain('comparison-loading is-loading');
    expect(list.children[0].querySelector('.comparison-state').textContent).toBe('');
    pending.get('first')({ metadata: { title: 'First' }, track: { points: [] } });
    await Promise.resolve();
    expect(list.children[0].innerHTML).toContain('comparison-loading"');
    expect(list.children[0].innerHTML).not.toContain('comparison-loading is-loading');
    expect(list.children[0].querySelector('.comparison-state').textContent).toBe('');
  });
  it('preserves the focused action when an analysis completion rebuilds rows', async () => {
    const { list, documentRef, pending } = setupPage();
    const action = list.children[0].querySelector('[data-visibility]');
    action.focus();
    pending.get('second')({ metadata: { title: 'Second' }, track: { points: [] } });
    await Promise.resolve();
    expect(documentRef.activeElement).toBe(list.children[0].querySelector('[data-visibility]'));
    expect(documentRef.activeElement).not.toBe(action);
    expect(lifecycle.map.highlight).toHaveBeenLastCalledWith('first');
  });
  it('moves focus to the neighboring row action when removing the focused row', () => {
    const { list, documentRef } = setupPage();
    const remove = list.children[0].querySelector('[data-remove]');
    remove.focus();
    remove.events.click();
    expect(documentRef.activeElement).toBe(list.children[0].querySelector('[data-remove]'));
    expect(list.children[0].dataset.comparisonId).toBe('second');
  });
  it('focuses the row when retry turns the focused retry button hidden', async () => {
    const { list, documentRef, failures } = setupPage();
    failures.get('second')(new Error('Unavailable'));
    await Promise.resolve();
    const retry = list.children[1].querySelector('[data-retry]');
    retry.focus();
    retry.events.click();
    expect(list.children[1].querySelector('[data-retry]').hidden).toBe(true);
    expect(documentRef.activeElement).toBe(list.children[1]);
  });
  it('keeps a hidden loading track hidden when another track is removed', async () => {
    const { list, pending } = setupPage();
    list.children[0].querySelector('[data-visibility]').events.click();
    list.children[1].querySelector('[data-remove]').events.click();
    expect(list.children[0].innerHTML).toContain('data-visibility aria-pressed="true"');
    lifecycle.map.draw.mockClear();
    pending.get('first')({ metadata: { title: 'First' }, track: { points: [] } });
    await Promise.resolve();
    expect(lifecycle.map.draw).toHaveBeenLastCalledWith([], 'tracks', { fit: true });
  });
});
