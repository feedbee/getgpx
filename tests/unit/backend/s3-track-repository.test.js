import { describe, expect, it } from 'vitest';
import { createS3TrackRepository } from '../../../src/backend/s3-track-repository.js';

describe('S3 track repository publication', () => {
  it('keeps editable metadata when a replacement GPX is published', async () => {
    const track = {
      _id: 'track-1', ownerId: 'owner-1', title: 'My route', normalizedName: 'my route',
      routeType: 'gravel-cycling', externalLinks: { komoot: 'https://www.komoot.com/tour/123' },
      active: { metrics: { effectiveSpeedKmh: 25 } },
      attempt: { kind: 'REPLACE', sourceKey: 'new-source', originalFilename: 'new.gpx' },
    };
    const repository = createS3TrackRepository({
      findOne: async () => track,
      updateOne: async (_filter, update) => {
        Object.assign(track, update.$set);
        return { modifiedCount: 1 };
      },
    });

    await repository.publish({ trackId: 'track-1', ownerId: 'owner-1', revision: 'new', workerId: 'worker-1' }, {
      title: 'Title from replacement GPX', analysisKey: 'new-analysis',
      analysis: { distanceKm: 30, effectiveSpeedKmh: 18 }, analysisSources: {},
    });

    expect(track).toMatchObject({ title: 'My route', normalizedName: 'my route',
      routeType: 'gravel-cycling', externalLinks: { komoot: 'https://www.komoot.com/tour/123' },
      active: { originalFilename: 'new.gpx', metrics: { distanceKm: 30, effectiveSpeedKmh: 25,
        estimatedDurationMs: 4_320_000 }, summary: { metrics: { effectiveSpeedKmh: 25,
        estimatedDurationMs: 4_320_000 } } } });
  });
});
