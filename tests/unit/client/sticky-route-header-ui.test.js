import { describe, expect, it } from 'vitest';
import { shouldShowCompactRouteHeader } from '../../../src/client/sticky-route-header-ui.js';

describe('compact route header', () => {
  it('appears after the route summary divider passes beneath the top bar', () => {
    expect(shouldShowCompactRouteHeader({ routeHeaderBottom: 71, topbarHeight: 72 })).toBe(true);
    expect(shouldShowCompactRouteHeader({ routeHeaderBottom: 73, topbarHeight: 72 })).toBe(false);
  });

  it('stays hidden outside the route page', () => {
    expect(shouldShowCompactRouteHeader({ routeHeaderBottom: 20, topbarHeight: 72, routePageHidden: true })).toBe(false);
  });
});
