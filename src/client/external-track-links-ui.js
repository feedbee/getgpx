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

const SERVICE_FIELD_DETAILS = Object.freeze({
  komoot: { suffix: 'komoot', placeholder: 'https://www.komoot.com/tour/…' },
  strava: { suffix: 'strava', placeholder: 'https://www.strava.com/routes/…' },
  garmin: { suffix: 'garmin', placeholder: 'https://connect.garmin.com/modern/course/…' },
  rideWithGps: { suffix: 'ride-with-gps', placeholder: 'https://ridewithgps.com/routes/…' },
});

export function renderExternalLinkFields(idPrefix, { legend = true } = {}) {
  const fields = SERVICES.map((service) => {
    const details = SERVICE_FIELD_DETAILS[service.id];
    return `<label class="service-link-field" for="${idPrefix}-${details.suffix}"><span><img class="service-field-icon" src="${service.logo}" alt="" width="18" height="18" />${service.label}</span><input id="${idPrefix}-${details.suffix}" name="${service.id}" type="url" inputmode="url" placeholder="${details.placeholder}" /></label>`;
  }).join('');
  return `<fieldset class="external-links-fields">${legend ? '<legend>Ссылки на трек в других сервисах</legend>' : ''}${fields}</fieldset>`;
}

export function availableExternalTrackLinks(links = {}) {
  return SERVICES.flatMap((service) => links[service.id]
    ? [{ ...service, url: links[service.id] }]
    : []);
}

export function renderExternalTrackLinks(container, links, documentRef = null, { compact = false, inline = false } = {}) {
  const available = availableExternalTrackLinks(links);
  if (!available.length) {
    container.replaceChildren();
    container.hidden = true;
    return;
  }
  const ownerDocument = documentRef || document;
  const anchors = available.map((service) => {
    const anchor = ownerDocument.createElement('a');
    anchor.className = `external-track-link external-track-link-${service.id}${compact ? ' external-track-link-compact' : ''}${inline ? ' external-track-link-inline' : ''}`;
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
    if (compact) anchor.append(mark);
    else {
      const label = ownerDocument.createElement('span');
      label.textContent = service.label;
      anchor.append(mark, label);
    }
    return anchor;
  });
  container.replaceChildren(...anchors);
  container.hidden = anchors.length === 0;
}
