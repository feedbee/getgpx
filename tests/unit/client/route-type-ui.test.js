import { beforeEach } from 'vitest';
import { preferences } from '../../../src/client/i18n.js';
beforeEach(() => { preferences.set('language', 'ru'); preferences.set('measurementSystem', 'metric'); });
import { describe, expect, it, vi } from 'vitest';
import { ROUTE_TYPE_IDS, normalizeRouteType } from '../../../src/route-types.js';
import {
  closeRouteTypeDropdownOnEscape,
  closeRouteTypeDropdownsOutside,
  renderRouteTypeDropdown,
  routeTypeDefinition,
  routeTypeIcon,
} from '../../../src/client/route-type-ui.js';

describe('route type UI', () => {
  it('defines every supported single route type with long and short labels', () => {
    expect(ROUTE_TYPE_IDS).toEqual([
      'cycling', 'road-cycling', 'gravel-cycling', 'mountain-biking',
      'hiking', 'running', 'walking', 'driving', 'motorcycling', 'swimming',
      'winter-sports', 'other',
    ]);
    for (const id of ROUTE_TYPE_IDS) {
      expect(routeTypeDefinition(id)).toMatchObject({ id, label: expect.any(String), shortLabel: expect.any(String) });
      expect(routeTypeIcon(id)).toContain('<svg');
    }
  });

  it('falls back to Other for absent legacy values', () => {
    expect(normalizeRouteType(undefined)).toBe('other');
    expect(routeTypeDefinition('unknown')).toMatchObject({ id: 'other', shortLabel: 'Другое' });
  });

  it('renders one keyboard-accessible icon choice per type in a custom dropdown', () => {
    const markup = renderRouteTypeDropdown({ id: 'route-type', name: 'routeType', selected: 'hiking' });
    expect(markup.match(/type="radio"/g)).toHaveLength(ROUTE_TYPE_IDS.length);
    expect(markup).toContain('value="hiking" checked');
    expect(markup).toContain('class="route-type-dropdown"');
    expect(markup).toContain('class="route-type-icon"');
  });

  it('uses concise labels while keeping descriptive picker labels', () => {
    expect(routeTypeDefinition('road-cycling')).toMatchObject({ label: 'Шоссейный велоспорт', shortLabel: 'Шоссейный велоспорт' });
    expect(routeTypeDefinition('gravel-cycling')).toMatchObject({ label: 'Гравийный велоспорт', shortLabel: 'Гравийный велоспорт' });
    expect(routeTypeDefinition('mountain-biking')).toMatchObject({ label: 'Горный велосипед', shortLabel: 'Горный велосипед' });
  });

  it('derives cycling disciplines from the same ready-made cyclist icon and adds terrain cues', () => {
    const icons = ['cycling', 'road-cycling', 'gravel-cycling', 'mountain-biking'].map((id) => routeTypeIcon(id));
    expect(new Set(icons)).toHaveProperty('size', 4);
    for (const icon of icons) expect(icon).toContain('route-type-icon--filled');
    expect(icons[1]).toContain('data-route-surface="road"');
    expect(icons[2]).toContain('data-route-surface="gravel"');
    expect(icons[3]).toContain('data-route-surface="mountain"');
    expect(icons[3]).toContain('rotate(-10');
  });

  it('closes an open route type dropdown on Escape and consumes the event', () => {
    const dropdown = { open: true };
    const event = { key: 'Escape', preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
    const root = { querySelectorAll: () => [dropdown] };

    expect(closeRouteTypeDropdownOnEscape(event, root)).toBe(true);
    expect(dropdown.open).toBe(false);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it('closes only dropdowns that were clicked outside', () => {
    const target = {};
    const outside = { open: true, contains: () => false };
    const inside = { open: true, contains: () => true };
    const root = { querySelectorAll: () => [outside, inside] };

    expect(closeRouteTypeDropdownsOutside(target, root)).toBe(true);
    expect(outside.open).toBe(false);
    expect(inside.open).toBe(true);
  });
});
