import { describe, expect, it } from 'vitest';
import { createPreferences, resolvePreferences } from '../../../src/client/preferences.js';
import { distance, elevation, speed, speedFromDisplay, createSpeedDraft } from '../../../src/client/measurements.js';

describe('independent browser preferences', () => {
  it.each([
    [[], 'en', 'metric'], [['bad_tag', 'de', 'pl-PL'], 'pl', 'metric'],
    [['en'], 'en', 'metric'], [['en-US'], 'en', 'metric'],
    [['ru-LR'], 'ru', 'metric'], [['my-MM'], 'en', 'metric'],
    [['en-GB'], 'en', 'metric'], [['en', 'uk-UA', 'en-US'], 'en', 'metric'],
    [['en-001', 'en-US'], 'en', 'metric'],
  ])('resolves %j', (browserLocales, language, measurementSystem) => {
    expect(resolvePreferences({ browserLocales })).toEqual({ language, measurementSystem });
  });
  it('ignores invalid fields independently and never derives units from manual language', () => {
    expect(resolvePreferences({ browserLocales: ['en-US'], stored: { language: 'pl', measurementSystem: 'invalid' } }))
      .toEqual({ language: 'pl', measurementSystem: 'metric' });
    expect(resolvePreferences({ browserLocales: ['en-US'], stored: { measurementSystem: 'imperial' } }))
      .toEqual({ language: 'en', measurementSystem: 'imperial' });
  });
  it('does not write automatic defaults, and persists only the changed field', () => {
    const values = new Map();
    const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    const prefs = createPreferences({ browserLocales: ['en-US'], storage });
    expect(values.size).toBe(0);
    prefs.set('language', 'uk');
    expect([...values.values()].map(JSON.parse)).toEqual([{ language: 'uk' }]);
    prefs.set('measurementSystem', 'metric');
    expect([...values.values()].map(JSON.parse)).toEqual([{ language: 'uk', measurementSystem: 'metric' }]);
  });
  it('survives unavailable storage and keeps session changes', () => {
    const prefs = createPreferences({ storage: { getItem() { throw Error(); }, setItem() { throw Error(); } } });
    expect(prefs.set('language', 'be')).toBe(false);
    expect(prefs.value.language).toBe('be');
  });
});
describe('measurement presentation boundaries', () => {
  const imperial = { language: 'en', measurementSystem: 'imperial' };
  it('uses exact length factors and handles missing and negative values', () => {
    expect(distance(1.609344, imperial)).toBe('1 mi');
    expect(elevation(0.3048, imperial)).toBe('1 ft');
    expect(elevation(-3.048, imperial)).toBe('-10 ft');
    expect(elevation(null, imperial)).toBe('—');
    expect(speed(1.609344, imperial)).toBe('1 mi/h');
    expect(speedFromDisplay(1, imperial)).toBe(1.609344);
  });
  it('promotes rounded short distances at boundaries', () => {
    expect(distance(0.9999, { language: 'en', measurementSystem: 'metric', compact: true })).toBe('1 km');
    expect(distance(1.6093, { ...imperial, compact: true })).toBe('1 mi');
    expect(distance(0, { ...imperial, compact: true })).toBe('0 ft');
  });
  it('keeps the canonical draft across repeated conversions and preserves invalid drafts', () => {
    const draft = createSpeedDraft(23.123456);
    for (let i = 0; i < 100; i++) { draft.display(imperial); draft.display({ measurementSystem: 'metric' }); }
    expect(draft.canonical).toBe(23.123456);
    const shown = draft.display(imperial);
    draft.update(shown, imperial);
    expect(draft.canonical).toBe(23.123456);
    draft.update('abc', imperial);
    expect(draft.display({ measurementSystem: 'metric' })).toBe('abc');
    expect(draft.valid).toBe(false);
  });
});
