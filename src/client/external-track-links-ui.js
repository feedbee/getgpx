import garminLogo from './assets/service-logos/garmin.png';
import komootLogo from './assets/service-logos/komoot.png';
import rideWithGpsLogo from './assets/service-logos/ride-with-gps.jpg';
import stravaLogo from './assets/service-logos/strava.png';

const SERVICES = Object.freeze([
  {
    id: 'komoot',
    label: 'Komoot',
    logo: komootLogo,
  },
  {
    id: 'strava',
    label: 'Strava',
    logo: stravaLogo,
  },
  {
    id: 'garmin',
    label: 'Garmin',
    logo: garminLogo,
  },
  {
    id: 'rideWithGps',
    label: 'Ride with GPS',
    logo: rideWithGpsLogo,
  },
]);

export function availableExternalTrackLinks(links = {}) {
  return SERVICES.flatMap((service) => links[service.id]
    ? [{ ...service, url: links[service.id] }]
    : []);
}

export function renderExternalTrackLinks(container, links, documentRef = null) {
  const available = availableExternalTrackLinks(links);
  if (!available.length) {
    container.replaceChildren();
    container.hidden = true;
    return;
  }
  const ownerDocument = documentRef || document;
  const anchors = available.map((service) => {
    const anchor = ownerDocument.createElement('a');
    anchor.className = `external-track-link external-track-link-${service.id}`;
    anchor.href = service.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    const actionLabel = `Открыть трек в ${service.label}`;
    anchor.setAttribute('aria-label', actionLabel);
    anchor.title = actionLabel;
    const mark = ownerDocument.createElement('span');
    mark.setAttribute('aria-hidden', 'true');
    const image = ownerDocument.createElement('img');
    image.src = service.logo;
    image.alt = '';
    image.width = 30;
    image.height = 30;
    mark.append(image);
    const label = ownerDocument.createElement('span');
    label.textContent = service.label;
    anchor.append(mark, label);
    return anchor;
  });
  container.replaceChildren(...anchors);
  container.hidden = anchors.length === 0;
}
