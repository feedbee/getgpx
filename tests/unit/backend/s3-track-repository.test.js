import { describe, expect, it } from 'vitest';
import { createS3TrackRepository } from '../../../src/backend/s3-track-repository.js';

describe('S3 track repository publication', () => {
  it('updates only supplied fields without touching speed, duration or links', async () => {
    let captured;
    const repository = createS3TrackRepository({ findOneAndUpdate: async (_filter, update) => {
      captured = update.$set; return {};
    } });
    await repository.updateDetails({ trackId: 'track', ownerId: 'owner', title: 'Renamed' });
    expect(captured).toEqual({ title: 'Renamed', titleEdited: true, normalizedName: 'renamed', updatedAt: expect.any(Date) });
  });

});
