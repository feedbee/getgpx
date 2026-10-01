import { randomBytes } from 'node:crypto';
import { safeErrorDetails } from '../safe-error-details.js';

// Generation is explicit: processing and maintenance jobs call this adapter.
// HTTP reads never invoke it, including when a file is missing or obsolete.
export function createTrackPreviewService({ trackRepository, objectStore, provider, warn, now = () => new Date() }) {
  const waiting = [];
  let rendering = 0;
  const canGenerate = (track) => {
    if (!provider || !track.result?.revision || track.result.preview?.length < 2 || !track.result.preview) return false;
    // Maintenance must not mutate records belonging to another S3 environment.
    try { objectStore.assertKey(track.result.analysisKey); return true; }
    catch { return false; }
  };
  const isCurrent = (track) => {
    const image = track.result?.previewImage;
    return Boolean(provider && image?.key && image.version === provider.version
      && image.provider === provider.provider && image.style === provider.style
      && image.rendererVersion === provider.rendererVersion && image.sourceRevision === track.result.revision);
  };
  async function render(points) {
    if (rendering >= 4) await new Promise((resolve) => waiting.push(resolve));
    else rendering++;
    try { return await provider.render(points); }
    finally {
      if (waiting.length) waiting.shift()();
      else rendering--;
    }
  }
  async function remove(key) {
    if (!key) return;
    await objectStore.delete(key).catch((error) => {
      warn({ event: 'track_preview_cleanup_failed', ...safeErrorDetails(error) });
    });
  }
  async function createForRevision({ trackId, revision, points }) {
    if (!provider || !Array.isArray(points) || points.length < 2) return null;
    try {
      const image = await render(points);
      // Never overwrite a published file, even when force regenerating the same style.
      const key = await objectStore.writePreview({ trackId: String(trackId), revision,
        imageId: randomBytes(8).toString('hex'), image });
      return { key, provider: provider.provider, style: provider.style, rendererVersion: provider.rendererVersion,
        version: provider.version, sourceRevision: revision, width: 512, height: 512, format: 'png',
        attribution: provider.attribution, createdAt: now() };
    } catch (error) {
      warn({ event: 'track_preview_generation_failed', trackId: String(trackId), revision, ...safeErrorDetails(error) });
      return null;
    }
  }
  return {
    configuration: () => ({ enabled: Boolean(provider), attribution: provider?.attribution || [] }),
    canGenerate,
    isCurrent,
    createForRevision,
    async regenerate(track, { force = false } = {}) {
      if (!canGenerate(track)) return 'skipped';
      if (!force && isCurrent(track)) return 'unchanged';
      const revision = track.result.revision;
      const expectedKey = track.result.previewImage?.key || null;
      const previewImage = await createForRevision({ trackId: track._id, revision, points: track.result.preview });
      if (!previewImage) return 'failed';
      let previous;
      try {
        previous = await trackRepository.attachPreview({ trackId: track._id, revision, expectedKey, previewImage });
      } catch (error) {
        // The update may already have committed. Keep the candidate on uncertain acknowledgement.
        warn({ event: 'track_preview_publication_failed', trackId: String(track._id), ...safeErrorDetails(error) });
        return 'failed';
      }
      if (!previous) { await remove(previewImage.key); return 'conflict'; }
      await remove(expectedKey);
      return 'generated';
    },
  };
}
