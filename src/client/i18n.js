import { IntlMessageFormat } from 'intl-messageformat';
import { catalogs } from './locales/catalogs.js';
import { browserPreferences } from './preferences.js';
import { distance, elevation, speed, unit, number } from './measurements.js';

export const preferences = browserPreferences();
const formats = new Map();
export function t(key, parameters = {}, language = preferences.value.language) {
  const catalogLanguage = language.split('-')[0];
  const message = catalogs[catalogLanguage]?.[key] ?? catalogs.en[key];
  if (!message) throw new Error(`Unknown translation key: ${key}`);
  const id = `${language}:${key}`;
  if (!formats.has(id)) formats.set(id, new IntlMessageFormat(message, language, undefined, { ignoreTag: true }));
  return String(formats.get(id).format(Object.fromEntries(Object.entries(parameters).map(([name, value]) => [name, value && typeof value === 'object' && value.measurement ? formatMeasurement(value.measurement, value.value, value.options) : value]))));
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
export function htmlMessage(key, parameters = {}) {
  return `<span class="localized-text" data-message="${key}" data-message-parameters="${escapeHtml(JSON.stringify(parameters))}">${escapeHtml(t(key, parameters))}</span>`;
}
export function messageAttribute(attribute, key, parameters = {}) {
  return `${attribute}="${escapeHtml(t(key, parameters))}" data-message-${attribute}="${key}" data-parameters-${attribute}="${escapeHtml(JSON.stringify(parameters))}"`;
}
export function bindText(element, render) {
  if (element) element.textContent = render();
}
export function setMessage(element, key, parameters = {}) { bindText(element, () => t(key, parameters)); }
export function formatMeasurement(kind, value, options = {}) {
  const format = { distance, elevation, speed, number }[kind];
  return format(value, { ...preferences.value, ...options });
}
export function metricMarkup(kind, value, options = {}) {
  return `<span class="localized-text" data-measurement="${kind}" data-value="${Number.isFinite(value) ? value : ''}" data-digits="${options.digits ?? (kind === 'elevation' ? 0 : 1)}" data-compact="${Boolean(options.compact)}">${formatMeasurement(kind, value, options)}</span>`;
}
export function currentUnit(kind) { return unit(kind, preferences.value); }
export function percent(value, digits = 1) {
  return Number.isFinite(value) ? new Intl.NumberFormat(preferences.value.language, { style: 'percent', maximumFractionDigits: digits }).format(value / 100) : '—';
}
export function date(value, options = {}) {
  return new Intl.DateTimeFormat(preferences.value.language, { day: 'numeric', month: 'long', year: 'numeric', ...options }).format(new Date(value));
}
export function bindAttribute(element, attribute, render) {
  if (element) element.setAttribute(attribute, render());
}
export function unitMarkup(kind) { return `<span class="localized-text" data-unit="${kind}">${currentUnit(kind)}</span>`; }
