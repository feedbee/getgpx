import { describe, expect, it } from 'vitest';
import { availableExternalTrackLinks, renderExternalTrackLinks } from '../../../src/client/external-track-links-ui.js';

describe('external track links', () => {
  it('keeps configured services in a stable display order and omits empty links', () => {
    expect(availableExternalTrackLinks({
      garmin: 'https://connect.garmin.com/modern/course/3',
      komoot: 'https://www.komoot.com/tour/1',
      strava: '',
    })).toEqual([
      expect.objectContaining({ id: 'komoot', label: 'Komoot', url: 'https://www.komoot.com/tour/1' }),
      expect.objectContaining({ id: 'garmin', label: 'Garmin', url: 'https://connect.garmin.com/modern/course/3' }),
    ]);
  });

  it('hides the block when no services are available', () => {
    const container = { hidden: false, replaceChildren: (...children) => { container.children = children; } };

    renderExternalTrackLinks(container, {});

    expect(container.hidden).toBe(true);
    expect(container.children).toEqual([]);
  });

  it('renders safe new-window links with accessible service names', () => {
    const container = { hidden: true, replaceChildren: (...children) => { container.children = children; } };
    const documentRef = {
      createElement: (tagName) => ({
        tagName,
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        append(...children) { this.children = children; },
      }),
    };

    renderExternalTrackLinks(container, { rideWithGps: 'https://ridewithgps.com/routes/4' }, documentRef);

    expect(container.hidden).toBe(false);
    expect(container.children[0]).toMatchObject({
      tagName: 'a',
      href: 'https://ridewithgps.com/routes/4',
      target: '_blank',
      rel: 'noopener noreferrer',
      title: 'Открыть трек в Ride with GPS',
      attributes: { 'aria-label': 'Открыть трек в Ride with GPS' },
    });
    expect(container.children[0].children[0].children[0]).toMatchObject({
      tagName: 'img',
      alt: '',
      width: 30,
      height: 30,
    });
    expect(container.children[0].children[0].children[0].src).toContain('ride-with-gps.jpg');
  });
});
