import { t, preferences } from './i18n.js';
export function resolveTrackUploader(track, currentUser, ownershipVerified) {
  return track?.author || (ownershipVerified ? currentUser : null);
}

export function formatTrackAttribution(track, locale = preferences.value.language, timeZone) {
  if (!track?.createdAt) return '';
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone,
  }).format(new Date(track.createdAt));
  return track.author?.displayName
    ? `${track.author.displayName} · ${date}`
    : t('tracks.uploaded', { date }, locale);
}
