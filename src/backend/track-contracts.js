export const EXTERNAL_ANALYSIS_TIMEOUT_MS = 50_000;

export class InvalidTrackCursorError extends Error {
  constructor() {
    super('Invalid track cursor.');
    this.code = 'INVALID_CURSOR';
  }
}

export class TrackLimitReachedError extends Error {
  constructor(limit) {
    super(`Track limit of ${limit} reached.`);
    this.code = 'TRACK_LIMIT_REACHED';
    this.limit = limit;
  }
}

export const TRACK_UPLOAD_LIMITS = Object.freeze({ maxBytes: 25 * 1024 * 1024, maxPoints: 100_000 });

export function normalizeTrackName(name) {
  return name.normalize('NFKC').trim().toLocaleLowerCase('ru-RU');
}

export class GpxFileTooLargeError extends Error {
  constructor(maxBytes) {
    super(`GPX file exceeds the ${maxBytes} byte limit.`);
    this.name = 'GpxFileTooLargeError';
    this.code = 'GPX_FILE_TOO_LARGE';
  }
}
