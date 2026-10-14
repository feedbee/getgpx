import { describe, expect, it } from 'vitest';
import { comparisonUrl, comparisonIdsFromUrl, createComparisonSelection, loadComparisonTrack } from '../../../src/client/track-comparison.js';

describe('comparison selection', () => {
  it('persists unique ids and removes a selected track', () => {
    const storage = { value: '["a","a",null,"../bad"]', getItem() { return this.value; }, setItem(key, value) { this.value = value; } };
    const selection = createComparisonSelection(storage);
    expect(selection.ids).toEqual(['a']);
    selection.toggle('b');
    expect(JSON.parse(storage.value)).toEqual(['a', 'b']);
    selection.toggle('a');
    expect(selection.ids).toEqual(['b']);
  });
  it('survives malformed or denied storage and bounds the selection', () => {
    const selection = createComparisonSelection({ getItem() { throw Error(); }, setItem() { throw Error(); } });
    for (let i = 0; i < 8; i++) expect(selection.toggle(`track${i}`)).toBe(true);
    expect(selection.toggle('extra')).toBe(false);
    expect(selection.ids).toHaveLength(8);
    expect(selection.persisted).toBe(false);
    const snapshot = selection.ids;
    snapshot.push('injected');
    expect(selection.ids).toHaveLength(8);
    expect(selection.toggle('../bad')).toBe(false);
    expect(createComparisonSelection({ getItem: () => '{' }).ids).toEqual([]);
  });
});

describe('comparison loading', () => {
  it('loads metadata separately and rejects mismatched analysis', async () => {
    const metadata = { revision: 2, analysisUrl: '/analysis', title: 'Test', metrics: {} };
    const api = { publicTrack: async () => ({ ok: true, json: async () => ({ data: metadata }) }),
      analysis: async () => ({ ok: true, json: async () => ({ revision: 1, points: [] }) }) };
    await expect(loadComparisonTrack(api, 'a')).rejects.toThrow();
  });
  it('rejects unavailable metadata without requesting analysis', async () => {
    const api = { publicTrack: async () => ({ ok: false, status: 404 }) };
    await expect(loadComparisonTrack(api, 'a')).rejects.toThrow();
  });
});

describe('comparison analysis read boundary', () => {
  const metadata = { revision: 2, analysisUrl: '/analysis', title: '<Track>', metrics: { distanceKm: 1, speedKmh: 20 } };
  const analysis = { revision: 2, metrics: { distanceKm: 999 }, points: [
    { lat: 52, lon: 21, distanceKm: 0, elevationM: 100, gradePercent: 0 },
    { lat: 52.01, lon: 21, distanceKm: 1, elevationM: 110, gradePercent: 1 },
  ], climbs: [], descents: [], pointsOfInterest: [] };
  it('uses metadata metrics and prepares geometry for all map modes', async () => {
    const api = { publicTrack: async () => ({ ok: true, json: async () => ({ data: metadata }) }),
      analysis: async () => ({ ok: true, json: async () => analysis }) };
    const { track } = await loadComparisonTrack(api, 'a');
    expect(track.name).toBe('<Track>');
    expect(track.distanceKm).toBe(1);
    expect(track.points[1].ele).toBe(110);
    expect(track.points[0].surface.quality.id).toBe('unknown');
  });
  it('rereads metadata after a revision changes', async () => {
    let reads = 0;
    const api = { publicTrack: async () => ({ ok: true, json: async () => ({ data: metadata }) }),
      analysis: async () => ({ ok: true, json: async () => ({ ...analysis, revision: ++reads === 1 ? 1 : 2 }) }) };
    expect((await loadComparisonTrack(api, 'a')).metadata.revision).toBe(2);
    expect(reads).toBe(2);
  });
  it('retains summary information when geometry is unavailable', async () => {
    let summary;
    const api = { publicTrack: async () => ({ ok: true, json: async () => ({ data: metadata }) }), analysis: async () => ({ ok: false }) };
    await expect(loadComparisonTrack(api, 'a', data => { summary = data; })).rejects.toThrow();
    expect(summary.title).toBe('<Track>');
  });
});

describe('comparison capacity and bulk selection', () => {
  it('adds checked tracks without toggling existing choices and applies the same limit', () => {
    const selection = createComparisonSelection();
    selection.toggle('first');
    expect(selection.canAdd(['first', 'second'])).toBe(true);
    expect(selection.add(['first', 'second'])).toBe(true);
    expect(selection.ids).toEqual(['first', 'second']);
    expect(selection.canAdd([])).toBe(false);
    expect(selection.add(Array.from({ length: 9 }, (_, index) => `track${index}`))).toBe(false);
    expect(selection.ids).toEqual(['first', 'second']);
  });
  it('disables additions when the combined selection exceeds capacity but permits removal', () => {
    const selection = createComparisonSelection();
    selection.add(Array.from({ length: 8 }, (_, index) => `track${index}`));
    expect(selection.canAdd(['track0'])).toBe(true);
    expect(selection.canAdd(['new'])).toBe(false);
    expect(selection.toggle('track0')).toBe(true);
    expect(selection.canAdd(['new'])).toBe(true);
  });
});

describe('comparison order', () => {
  it('persists colors while updating numbers to the reordered positions', () => {
    const values = new Map();
    const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    const selection = createComparisonSelection(storage);
    selection.add(['first', 'second', 'third']);
    const identity = selection.identity('second');
    expect(selection.reorder(['second', 'third', 'first'])).toBe(true);
    const restored = createComparisonSelection(storage);
    expect(restored.ids).toEqual(['second', 'third', 'first']);
    expect(restored.identity('second')).toEqual({ ...identity, number: 1 });
    expect(restored.identity('first').number).toBe(3);
  });
  it('rejects orders with missing, duplicate or unselected tracks', () => {
    const selection = createComparisonSelection();
    selection.add(['first', 'second']);
    for (const order of [['first'], ['first', 'first'], ['second', 'unknown']]) {
      expect(selection.reorder(order)).toBe(false);
      expect(selection.ids).toEqual(['first', 'second']);
    }
  });
});

describe('comparison URLs', () => {
  it('round trips an ordered selection without browser storage', () => {
    const ids = ['second', 'first'];
    const url = comparisonUrl(ids);
    expect(url).toBe('/compare?tracks=second,first');
    expect(createComparisonSelection(undefined, comparisonIdsFromUrl(url.split('?')[1])).ids).toEqual(ids);
  });
  it('uses only URL tracks, validating duplicates, invalid IDs and the limit', () => {
    expect(comparisonIdsFromUrl('?tracks=first,first,../bad,second')).toEqual(['first', 'second']);
    expect(comparisonIdsFromUrl('?tracks=' + Array.from({ length: 10 }, (_, i) => `t${i}`).join(','))).toHaveLength(8);
    expect(createComparisonSelection({ getItem: () => '["stored"]' }, comparisonIdsFromUrl('')).ids).toEqual([]);
  });
});
