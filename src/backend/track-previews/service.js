import { randomBytes } from 'node:crypto';
import { safeErrorDetails } from '../safe-error-details.js';

// Missing previews are generated once per revision/variant; maintenance updates existing styles.
export function createTrackPreviewService({ trackRepository, objectStore, provider, warn, now = () => new Date() }) {
  const waiting = [];
  const inFlight = new Map();
  const failures = new Map();
  const fieldFor = (variant) => {
    if (!['list', 'social'].includes(variant)) throw new Error('Unsupported preview variant.');
    return variant === 'social' ? 'shareImage' : 'previewImage';
  };
  let rendering = 0;
  const canGenerate = (track) => {
    if (!provider || !track.result?.revision || track.result.preview?.length < 2 || !track.result.preview) return false;
    // Maintenance must not mutate records belonging to another S3 environment.
    try { objectStore.assertKey(track.result.analysisKey); return true; }
    catch { return false; }
  };
  const isCurrent = (track, variant = 'list') => {
    const image = track.result?.[fieldFor(variant)];
    return Boolean(provider && image?.key && image.version === provider.version
      && image.provider === provider.provider && image.style === provider.style
      && image.rendererVersion === provider.rendererVersion && image.sourceRevision === track.result.revision);
  };
  async function render(points, variant) {
    if (rendering >= 4 && waiting.length >= 32) throw new Error('Preview queue full.');
    if (rendering >= 4) await new Promise((resolve) => waiting.push(resolve));
    else rendering++;
    try { return await provider.render(points, { variant }); }
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
  async function createForRevision({ trackId, revision, points, variant = 'list' }) {
    fieldFor(variant);
    if (!provider || !Array.isArray(points) || points.length < 2) return null;
    try {
      const image = await render(points, variant);
      // Never overwrite a published file, even when force regenerating the same style.
      const key = await objectStore.writePreview({ trackId: String(trackId), revision,
        imageId: randomBytes(8).toString('hex'), image });
      return { key, provider: provider.provider, style: provider.style, rendererVersion: provider.rendererVersion,
        version: provider.version, sourceRevision: revision, width: variant === 'social' ? 1200 : 512, height: variant === 'social' ? 630 : 512, format: 'png',
        variant, attribution: provider.attribution, createdAt: now() };
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
    async ensure(track, { variant = 'list', missingObject = false } = {}) {
      const field = fieldFor(variant);
      if (!missingObject && track.result?.[field]?.key) return track;
      if (!canGenerate(track)) return track;
      const id = `${track._id}:${track.result.revision}:${variant}`;
      if (inFlight.has(id)) return inFlight.get(id);
      if (Date.now() < (failures.get(id) || 0)) return track;
      const job = (async () => {
        const status = await this.regenerate(track, { force: missingObject, variant });
        if (status === 'failed') {
          if (failures.size >= 256) failures.delete(failures.keys().next().value);
          failures.set(id, Date.now() + 60_000);
        } else failures.delete(id);
        return await trackRepository.findById(track._id) || null;
      })();
      inFlight.set(id, job);
      try { return await job; } finally { inFlight.delete(id); }
    },
    async regenerate(track, { force = false, variant = 'list' } = {}) {
      const field = fieldFor(variant);
      if (!canGenerate(track)) return 'skipped';
      if (!force && isCurrent(track, variant)) return 'unchanged';
      const revision = track.result.revision;
      const expectedKey = track.result[field]?.key || null;
      const previewImage = await createForRevision({ trackId: track._id, revision, points: track.result.preview, variant });
      if (!previewImage) return 'failed';
      let previous;
      try {
        previous = await trackRepository.attachPreview({ trackId: track._id, revision, expectedKey, previewImage, variant });
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
