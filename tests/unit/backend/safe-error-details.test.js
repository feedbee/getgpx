import { describe, expect, it } from 'vitest';
import { safeErrorDetails } from '../../../src/backend/safe-error-details.js';

describe('safe error details', () => {
  it('keeps actionable provider codes without logging messages, stacks or credentials', () => {
    const error = Object.assign(new Error('secret=do-not-log'), {
      name: 'AccessDenied', Code: 'AccessDenied', $metadata: { httpStatusCode: 403, requestId: 'private' },
    });
    expect(safeErrorDetails(error)).toEqual({ errorName: 'AccessDenied', errorCode: 'AccessDenied', upstreamStatusCode: 403 });
    expect(JSON.stringify(safeErrorDetails(error))).not.toContain('secret');
  });

  it('retains numeric database codes and drops unsafe identifiers', () => {
    expect(safeErrorDetails({ name: 'MongoServerError', code: 11000 })).toEqual({ errorName: 'MongoServerError', errorCode: 11000 });
    expect(safeErrorDetails({ name: 'Error secret=abc', code: 'secret=abc', $metadata: { httpStatusCode: 999 } }))
      .toEqual({ errorName: 'UNKNOWN' });
  });
});
