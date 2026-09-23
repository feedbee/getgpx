import { t, bindText, htmlMessage } from './i18n.js';
import { DEFAULT_ROUTE_TYPE, ROUTE_TYPE_IDS, normalizeRouteType } from '../route-types.js';

// Cycling SVG paths are from Pictogrammers Material Design Icons (Apache 2.0).
// Non-cycling SVG paths are adapted from Tabler Icons (MIT). See THIRD_PARTY_NOTICES.md.
const CYCLIST_PATH = 'M5,20.5A3.5,3.5 0 0,1 1.5,17A3.5,3.5 0 0,1 5,13.5A3.5,3.5 0 0,1 8.5,17A3.5,3.5 0 0,1 5,20.5M5,12A5,5 0 0,0 0,17A5,5 0 0,0 5,22A5,5 0 0,0 10,17A5,5 0 0,0 5,12M14.8,10H19V8.2H15.8L13.86,4.93C13.57,4.43 13,4.1 12.4,4.1C11.93,4.1 11.5,4.29 11.2,4.6L7.5,8.29C7.19,8.6 7,9 7,9.5C7,10.13 7.33,10.66 7.85,10.97L11.2,13V18H13V11.5L10.75,9.85L13.07,7.5M19,20.5A3.5,3.5 0 0,1 15.5,17A3.5,3.5 0 0,1 19,13.5A3.5,3.5 0 0,1 22.5,17A3.5,3.5 0 0,1 19,20.5M19,12A5,5 0 0,0 14,17A5,5 0 0,0 19,22A5,5 0 0,0 24,17A5,5 0 0,0 19,12M16,4.8C17,4.8 17.8,4 17.8,3C17.8,2 17,1.2 16,1.2C15,1.2 14.2,2 14.2,3C14.2,4 15,4.8 16,4.8Z';

const ICONS = Object.freeze({
  bike: `<path d="${CYCLIST_PATH}"/>`,
  roadBike: `<g transform="translate(1 0) scale(.92)"><path d="${CYCLIST_PATH}"/></g><path class="route-type-surface" data-route-surface="road" d="M2 23h20"/>`,
  gravelBike: `<g transform="translate(1 0) scale(.92)"><path d="${CYCLIST_PATH}"/></g><g data-route-surface="gravel"><circle class="route-type-gravel-dot" cx="3" cy="22.5" r=".8"/><circle class="route-type-gravel-dot" cx="7" cy="23.5" r=".8"/><circle class="route-type-gravel-dot" cx="11" cy="22.5" r=".8"/><circle class="route-type-gravel-dot" cx="15" cy="23.5" r=".8"/><circle class="route-type-gravel-dot" cx="19" cy="22.5" r=".8"/></g>`,
  mountainBike: `<g transform="translate(1.5 2) rotate(-10 12 12) scale(.86)"><path d="${CYCLIST_PATH}"/></g><path class="route-type-surface" data-route-surface="mountain" d="M1 23l5-3 4 2.5 5-4 8 4.5"/>`,
  trekking: '<path d="M11 4a1 1 0 1 0 2 0a1 1 0 1 0-2 0M7 21l2-4M13 21v-4l-3-3 1-6 3 4 3 2M10 14l-1.827-1.218a2 2 0 0 1-.831-2.15l.28-1.117A2 2 0 0 1 9.561 8H11l4 1 3-2M17 12v9M16 20h2"/>',
  run: '<path d="M11.007 5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4 17l5 1 .75-1.5M15 21v-4l-4-3 1-6M7 12V9l5-1 3 3 3 1"/>',
  walk: '<path d="M12 4a1 1 0 1 0 2 0a1 1 0 1 0-2 0M7 21l3-4M16 21l-2-4-3-3 1-6M6 12l2-3 4-1 3 3 3 1"/>',
  car: '<path d="M5 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0M15 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0M5 17H3v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0H9m-6-6h15m-6 0V6"/>',
  motorbike: '<path d="M2 16a3 3 0 1 0 6 0a3 3 0 1 0-6 0M16 16a3 3 0 1 0 6 0a3 3 0 1 0-6 0M7.5 14h5l4-4H6m1.5 4 4-4M13 6h2l1.5 3 2 4"/>',
  swimming: '<path d="M15 9a1 1 0 1 0 2 0a1 1 0 1 0-2 0M6 11l4-2 3.5 3-1.5 2M3 16.75a2.4 2.4 0 0 0 1 .25 2.4 2.4 0 0 0 2-1 2.4 2.4 0 0 1 2-1 2.4 2.4 0 0 1 2 1 2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1 2.4 2.4 0 0 1 2-1 2.4 2.4 0 0 1 2 1 2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 1-.25"/>',
  snowflake: '<path d="m10 4 2 1 2-1M12 2v6.5l3 1.72M17.928 6.268l.134 2.232 1.866 1.232M20.66 7l-5.629 3.25.01 3.458M19.928 14.268l-1.866 1.232-.134 2.232M20.66 17l-5.629-3.25-2.99 1.738M14 20l-2-1-2 1M12 22v-6.5l-3-1.72M6.072 17.732 5.938 15.5l-1.866-1.232M3.34 17l5.629-3.25-.01-3.458M4.072 9.732 5.938 8.5l.134-2.232M3.34 7l5.629 3.25 2.99-1.738"/>',
  other: '<path d="M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M8 12v.01M12 12v.01M16 12v.01"/>',
});

const ROUTE_TYPES = Object.freeze({
  cycling: { icon: 'bike' },
  'road-cycling': { icon: 'roadBike' },
  'gravel-cycling': { icon: 'gravelBike' },
  'mountain-biking': { icon: 'mountainBike' },
  hiking: { icon: 'trekking' },
  running: { icon: 'run' },
  walking: { icon: 'walk' },
  driving: { icon: 'car' },
  motorcycling: { icon: 'motorbike' },
  swimming: { icon: 'swimming' },
  'winter-sports': { icon: 'snowflake' },
  other: { icon: 'other' },
});

export function routeTypeDefinition(value) {
  const id = normalizeRouteType(value);
  return { id, icon: ROUTE_TYPES[id].icon, label: t(`activity.${id}`), shortLabel: t(`activity.${id}`) };
}

export function routeTypeIcon(value, className = 'route-type-icon') {
  const type = routeTypeDefinition(value);
  const filled = ['bike', 'roadBike', 'gravelBike', 'mountainBike'].includes(type.icon);
  return `<svg class="${className}${filled ? ' route-type-icon--filled' : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[type.icon]}</svg>`;
}

export function closeRouteTypeDropdownsOutside(target, root = document) {
  let closed = false;
  for (const dropdown of root.querySelectorAll('.route-type-dropdown[open]')) {
    if (dropdown.contains(target)) continue;
    dropdown.open = false;
    closed = true;
  }
  return closed;
}

export function closeRouteTypeDropdownOnEscape(event, root = document) {
  if (event.key !== 'Escape') return false;
  const dropdowns = root.querySelectorAll('.route-type-dropdown[open]');
  if (!dropdowns.length) return false;
  for (const dropdown of dropdowns) dropdown.open = false;
  event.preventDefault();
  event.stopImmediatePropagation();
  return true;
}

export function renderRouteTypeDropdown({ id, name, selected = DEFAULT_ROUTE_TYPE }) {
  const current = routeTypeDefinition(selected);
  const options = ROUTE_TYPE_IDS.map((typeId) => {
    const type = routeTypeDefinition(typeId);
    return `<label class="route-type-option"><input type="radio" name="${name}" value="${typeId}" ${typeId === current.id ? 'checked' : ''} /><span class="route-type-option-icon">${routeTypeIcon(typeId)}</span><span>${htmlMessage(`activity.${type.id}`)}</span></label>`;
  }).join('');
  return `<div class="route-type-field"><span class="route-type-label">${htmlMessage('common.routeType')}</span><details class="route-type-dropdown" id="${id}"><summary><span class="route-type-current-icon">${routeTypeIcon(current.id)}</span><span class="route-type-current-label">${htmlMessage(`activity.${current.id}`)}</span><svg class="route-type-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></summary><div class="route-type-options">${options}</div></details></div>`;
}

export function setRouteTypeDropdown(dropdown, value) {
  const type = routeTypeDefinition(value);
  const input = dropdown.querySelector(`input[value="${type.id}"]`);
  if (input) input.checked = true;
  dropdown.querySelector('.route-type-current-icon').innerHTML = routeTypeIcon(type.id);
  bindText(dropdown.querySelector('.route-type-current-label'), () => t(`activity.${type.id}`));
}

export function selectedRouteType(dropdown) {
  return dropdown.querySelector('input:checked')?.value || DEFAULT_ROUTE_TYPE;
}
