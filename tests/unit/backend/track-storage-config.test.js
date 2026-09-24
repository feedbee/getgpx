import { describe, expect, it } from 'vitest';
import { loadTrackStorageConfig } from '../../../src/backend/track-storage-config.js';

describe('track storage configuration', () => {
  it('requires the bucket and region and defaults to stream delivery', () => {
    expect(() => loadTrackStorageConfig({})).toThrow();
    expect(loadTrackStorageConfig({ TRACK_S3_BUCKET: 'track-files', AWS_REGION: 'eu-central-1' })).toMatchObject({
      bucket: 'track-files', region: 'eu-central-1', prefix: 'dev', delivery: 'stream', previewMaxPoints: 200,
    });
  });

  it('rejects invalid prefixes, budgets and incomplete credentials', () => {
    const env = { TRACK_S3_BUCKET: 'track-files', AWS_REGION: 'eu-central-1' };
    expect(() => loadTrackStorageConfig({ ...env, TRACK_S3_PREFIX: '../prod' })).toThrow();
    expect(() => loadTrackStorageConfig({ ...env, TRACK_PREVIEW_MAX_POINTS: '1' })).toThrow();
    expect(() => loadTrackStorageConfig({ ...env, AWS_ACCESS_KEY_ID: 'key' })).toThrow();
  });
});
