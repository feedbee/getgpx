import { describe, expect, it, vi } from 'vitest';
import { createTrackPreviewService } from '../../../src/backend/track-previews/service.js';

function fixture() {
  let track = { _id: '0123456789abcdef01234567', publicId: 'route', result: { revision: 'one', analysisKey: 'dev/tracks/0123456789abcdef01234567/one/analysis.json', preview: [{ lat: 50, lon: 20 }, { lat: 51, lon: 21 }] } };
  const objects = new Map();
  const repository = { findByPublicId: async () => track,
    attachPreview: async ({ revision, expectedKey, previewImage }) => {
      if (!track || track.result.revision !== revision || (track.result.previewImage?.key || null) !== expectedKey) return null;
      const previous = structuredClone(track);
      track.result.previewImage = previewImage;
      return previous;
    } };
  const store = {
    assertKey: (key) => { if (!key?.startsWith('dev/tracks/')) throw new Error('Foreign prefix'); return key; },
    writePreview: async ({ trackId, revision, imageId, image }) => {
      const key = `dev/tracks/${trackId}/${revision}/preview-${imageId}.png`;
      objects.set(key, image); return key;
    }, delete: async (key) => objects.delete(key) };
  const provider = { provider: 'mapbox', style: 'mapbox/streets-v12', rendererVersion: 3,
    version: 'aaaaaaaaaaaaaaaa', render: vi.fn(async () => Buffer.from('png')), attribution: [] };
  const service = createTrackPreviewService({ trackRepository: repository, objectStore: store, provider, warn: vi.fn() });
  return { service, provider, objects, track, repository, remove: () => { track = null; } };
}

describe('permanent track preview generation', () => {
  it('creates a revision image with reproducible provenance and no read-side generator', async () => {
    const { service, objects, track, provider } = fixture();
    const image = await service.createForRevision({ trackId: track._id, revision: 'one', points: track.result.preview });
    expect(objects.has(image.key)).toBe(true);
    expect(image).toMatchObject({ provider: 'mapbox', style: 'mapbox/streets-v12', rendererVersion: 3,
      version: provider.version, sourceRevision: 'one', width: 512, height: 512, createdAt: expect.any(Date) });
    expect(track.result.previewImage).toBeUndefined();
    expect(service.get).toBeUndefined();
  });
  it('skips an up-to-date image and regenerates only after the style version changes', async () => {
    const { service, provider, objects, track } = fixture();
    expect(await service.regenerate(track)).toBe('generated');
    expect(await service.regenerate(track)).toBe('unchanged');
    provider.version = 'bbbbbbbbbbbbbbbb';
    expect(await service.regenerate(track)).toBe('generated');
    expect(objects.size).toBe(1);
    expect(track.result.previewImage.version).toBe(provider.version);
    expect(provider.render).toHaveBeenCalledTimes(2);
  });
  it('uses a new object for forced regeneration, including the same style version', async () => {
    const { service, objects, track } = fixture();
    await service.regenerate(track);
    const previousKey = track.result.previewImage.key;
    await service.regenerate(track, { force: true });
    expect(track.result.previewImage.key).not.toBe(previousKey);
    expect(objects.has(previousKey)).toBe(false);
    expect(objects.size).toBe(1);
  });
  it('cleans up a candidate when the track is deleted or its GPX revision changes', async () => {
    for (const deleted of [true, false]) {
      const { service, provider, objects, track, remove } = fixture();
      provider.render.mockImplementation(async () => {
        if (deleted) remove(); else track.result.revision = 'two';
        return Buffer.from('png');
      });
      expect(await service.regenerate(structuredClone(track))).toBe('conflict');
      expect(objects.size).toBe(0);
    }
  });
  it('keeps the previous image available after a provider failure', async () => {
    const { service, provider, objects, track } = fixture();
    await service.regenerate(track);
    const previous = structuredClone(track.result.previewImage);
    provider.render.mockRejectedValue(new Error('secret upstream URL'));
    expect(await service.regenerate(track, { force: true })).toBe('failed');
    expect(track.result.previewImage).toEqual(previous);
    expect(objects.has(previous.key)).toBe(true);
  });
  it('does not regenerate tracks from another storage environment', async () => {
    const { service, provider, track } = fixture();
    track.result.analysisKey = track.result.analysisKey.replace('dev/', 'prod/');
    expect(await service.regenerate(track)).toBe('skipped');
    expect(provider.render).not.toHaveBeenCalled();
  });
  it('does not delete a candidate after an ambiguous MongoDB acknowledgement', async () => {
    const { service, track, objects, repository } = fixture();
    const attach = repository.attachPreview;
    repository.attachPreview = async (options) => {
      await attach(options);
      throw new Error('acknowledgement lost');
    };
    expect(await service.regenerate(track)).toBe('failed');
    expect(objects.has(track.result.previewImage.key)).toBe(true);
  });
});
