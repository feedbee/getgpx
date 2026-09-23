import { catalogs } from './locales/catalogs.js';
export const METERS_PER_MILE = 1609.344;
export const METERS_PER_FOOT = 0.3048;
export function number(value, { language = 'en', digits = 1 } = {}) {
  return Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';
}
export function distanceValue(km, { measurementSystem } = {}) { return measurementSystem === 'imperial' ? km * 1000 / METERS_PER_MILE : km; }
export function elevationValue(m, { measurementSystem } = {}) { return measurementSystem === 'imperial' ? m / METERS_PER_FOOT : m; }
export function speedFromDisplay(value, { measurementSystem } = {}) { return measurementSystem === 'imperial' ? value * METERS_PER_MILE / 1000 : value; }
export function unit(kind, { language = 'en', measurementSystem = 'metric' } = {}) {
  const imperial = measurementSystem === 'imperial';
  const key = kind === 'distance' ? imperial ? 'mi' : 'km' : kind === 'speed' ? imperial ? 'mih' : 'kmh' : imperial ? 'ft' : 'm';
  return (catalogs[language] || catalogs.en)[`units.${key}`];
}
export function distance(km, options = {}) {
  if (!Number.isFinite(km)) return '—';
  const value = distanceValue(km, options);
  const shortValue = elevationValue(km * 1000, options);
  const boundary = options.measurementSystem === 'imperial' ? 5280 : 1000;
  if (options.compact && Math.abs(value) < 1 && Math.round(Math.abs(shortValue)) < boundary) return `${number(shortValue, { ...options, digits: 0 })} ${unit('elevation', options)}`;
  return `${number(value, options)} ${unit('distance', options)}`;
}
export function elevation(m, options = {}) {
  return Number.isFinite(m) ? `${number(elevationValue(m, options), { ...options, digits: options.digits ?? 0 })} ${unit('elevation', options)}` : '—';
}
export function speed(kmh, options = {}) {
  return Number.isFinite(kmh) ? `${number(distanceValue(kmh, options), options)} ${unit('speed', options)}` : '—';
}
export function createSpeedDraft(initial) {
  let canonical = initial;
  let raw = null;
  let lastDisplay = null;
  return {
    get canonical() { return canonical; },
    get valid() { return raw === null && Number.isFinite(canonical) && canonical >= 1 && canonical <= 50; },
    display(options) {
      lastDisplay = raw ?? String(Number(distanceValue(canonical, options).toFixed(6)));
      return lastDisplay;
    },
    update(text, options) {
      if (text === lastDisplay) return;
      const parsed = String(text).trim().replace(',', '.');
      if (!parsed || !Number.isFinite(Number(parsed))) { raw = text; return; }
      canonical = speedFromDisplay(Number(parsed), options);
      raw = null;
    },
  };
}
