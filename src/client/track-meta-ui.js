export function resolveTrackUploader(track, currentUser, ownershipVerified) {
  return track?.uploader || (ownershipVerified ? currentUser : null);
}

export function formatTrackAttribution(track, locale = 'ru-RU', timeZone) {
  if (!track?.createdAt) return '';
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone,
  }).format(new Date(track.createdAt));
  return track.uploader?.displayName
    ? `${track.uploader.displayName} · ${date}`
    : `Загружено · ${date}`;
}
