const SERVICE_HOSTS = Object.freeze({
  komoot: ['komoot.com'],
  strava: ['strava.com'],
  garmin: ['garmin.com'],
  rideWithGps: ['ridewithgps.com'],
});

function belongsToService(hostname, allowedDomains) {
  const normalized = hostname.toLowerCase();
  return allowedDomains.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}

export function normalizeExternalTrackLinks(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.some((key) => !Object.hasOwn(SERVICE_HOSTS, key))) return null;

  const links = {};
  for (const key of keys) {
    if (typeof value[key] !== 'string') return null;
    const candidate = value[key].trim();
    if (!candidate) continue;
    if (candidate.length > 2_048) return null;
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'https:' || !belongsToService(url.hostname, SERVICE_HOSTS[key])) return null;
      links[key] = url.href;
    } catch {
      return null;
    }
  }
  return links;
}
