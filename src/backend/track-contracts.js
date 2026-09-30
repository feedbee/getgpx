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
