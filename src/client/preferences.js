import { languages, measurementSystems } from './locales/registry.js';
export const PREFERENCE_KEY = 'getgpx.preferences.v1';
function validLocales(values) {
  return (Array.isArray(values) ? values : []).flatMap(value => {
    try { return [new Intl.Locale(value)]; } catch { return []; }
  });
}
function valid(field, value) {
  return field === 'language' ? Object.hasOwn(languages, value) : field === 'measurementSystem' && measurementSystems.includes(value);
}
export function resolvePreferences({ browserLocales = [], stored = {} } = {}) {
  const locales = validLocales(browserLocales);
  const automaticLanguage = locales.find(locale => Object.hasOwn(languages, locale.language))?.language || 'en';
  return {
    language: valid('language', stored?.language) ? stored.language : automaticLanguage,
    measurementSystem: valid('measurementSystem', stored?.measurementSystem) ? stored.measurementSystem : 'metric',
  };
}
export function createPreferences({ browserLocales = [], storage } = {}) {
  let manual = {};
  try {
    const saved = JSON.parse(storage?.getItem(PREFERENCE_KEY) || '{}');
    for (const field of ['language', 'measurementSystem']) if (valid(field, saved?.[field])) manual[field] = saved[field];
  } catch { /* Storage is optional; keep session preferences available. */ }
  let value = resolvePreferences({ browserLocales, stored: manual });
  return {
    get value() { return { ...value }; },
    set(field, choice) {
      if (!valid(field, choice)) return false;
      manual = { ...manual, [field]: choice };
      value = resolvePreferences({ browserLocales, stored: manual });
      let persisted = false;
      try { if (storage) { storage.setItem(PREFERENCE_KEY, JSON.stringify(manual)); persisted = true; } } catch { /* Session remains usable. */ }
      return persisted;
    },
  };
}
export function browserPreferences(browser = globalThis.navigator, browserWindow = globalThis.window) {
  let browserLocales = [];
  let storage;
  try { browserLocales = browser?.languages?.length ? browser.languages : [browser?.language]; } catch { /* Detection can be unavailable. */ }
  try { storage = browserWindow?.localStorage; } catch { /* Privacy mode may deny access. */ }
  return createPreferences({ browserLocales, storage });
}
