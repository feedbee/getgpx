import { t, formatMeasurement } from './i18n.js';
const messages = {
  INVALID_GPX: 'errors.gpx', ENRICHMENT_UNAVAILABLE: 'errors.enrichment',
  AUTHENTICATION_REQUIRED: 'errors.session', INVALID_SESSION: 'errors.session',
  INVALID_SEARCH_QUERY: 'errors.search', INVALID_CURSOR: 'errors.cursor', TRACK_NOT_FOUND: 'errors.notFound',
  INVALID_TRACK_IDS: 'errors.selection', INVALID_TRACK_TITLE: 'errors.title', INVALID_ROUTE_TYPE: 'errors.routeType',
  INVALID_EXTERNAL_LINKS: 'errors.links', INVALID_GPX_FILE: 'errors.file', UNSUPPORTED_GPX_TYPE: 'errors.file',
  INVALID_GPX_FILENAME: 'errors.filename', GPX_FILE_TOO_LARGE: 'errors.fileSize', REPLACEMENT_IN_PROGRESS: 'errors.replacing',
  ANALYSIS_NOT_RETRYABLE: 'errors.retry', TRACK_LIMIT_REACHED: 'errors.limit', UPLOAD_FAILED: 'errors.upload', REPLACEMENT_FAILED: 'errors.replacement',
};
export function errorMessage(error) {
  if (error?.code === 'INVALID_TRACK_SPEED') return t('errors.speed', { min: formatMeasurement('speed', 1, { digits: 6 }), max: formatMeasurement('speed', 50, { digits: 6 }) });
  return t(messages[error?.code] || 'errors.unknown');
}
export function errorFromPayload(payload) {
  return Object.assign(new Error(), { code: payload?.error?.code || 'UNKNOWN_ERROR' });
}
