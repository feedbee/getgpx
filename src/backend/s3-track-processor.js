import { randomUUID } from 'node:crypto';
import { trackObjectKeys, hasPublishedResult } from './s3-track-repository.js';
import { analysisFailure } from './analysis-warning.js';
import { safeErrorDetails } from './safe-error-details.js';

function sourcesOf(analysis, status) {
  return {
    gpx: 'SUCCESS',
    valhalla: analysis.enrichmentSource ? 'SUCCESS' : status === 'READY' ? 'SUCCESS' : 'FAILED',
    openStreetMap: analysis.enrichmentSource === 'VALHALLA_OSM' ? 'SUCCESS' : 'FAILED',
  };
}

export function createS3TrackProcessor({ trackRepository, objectStore, enrichmentCacheRepository,
  analyzeSource, enrichAnalysis, cleanup, schedule, warn, enrichmentTimeoutMs, now, preparePreview }) {
  const scheduleProcessing = (track) => schedule(() => process(track).catch((error) => {
    warn({ event: 'track_analysis_job_failed', trackId: String(track._id),
      revision: track.processing?.revision, ...safeErrorDetails(error) });
  }));

  async function process(track) {
    const identity = { trackId: track._id, ownerId: track.ownerId,
      revision: track.processing.revision, workerId: randomUUID() };
    const claimed = await trackRepository.claim(identity, now());
    if (!claimed) return;
    let lost = false;
    const heartbeat = setInterval(() => {
      trackRepository.heartbeat(identity, now()).then((result) => { if (!result.modifiedCount) lost = true; })
        .catch((heartbeatError) => {
          if (!lost) warn({ event: 'track_heartbeat_failed', trackId: String(track._id),
            revision: identity.revision, ...safeErrorDetails(heartbeatError) });
          lost = true;
        });
    }, 30_000);
    heartbeat.unref?.();
    let base;
    let step = 'READING';
    try {
      const source = await objectStore.readSource(claimed.processing.sourceKey);
      step = 'PARSING';
      base = analyzeSource(source, { filename: claimed.processing.originalFilename });
      if (lost || !await trackRepository.setStep(identity, 'ENRICHING', now(),
        hasPublishedResult(claimed) ? null : base.name)) return;
      step = 'ENRICHING';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), enrichmentTimeoutMs);
      let analysis;
      try {
        analysis = await enrichAnalysis(base, { cache: enrichmentCacheRepository, signal: controller.signal,
          warn: (details) => warn({ trackId: String(track._id), revision: identity.revision, ...details }) });
      } finally { clearTimeout(timeout); }
      if (lost) return;
      const analysisSources = sourcesOf(analysis, 'READY');
      const completeness = analysis.enrichmentSource === 'VALHALLA_OSM' ? 'FULL' : 'PARTIAL';
      step = 'WRITING';
      const analysisKey = await objectStore.writeAnalysis({ trackId: String(track._id), revision: identity.revision,
        analysis, analysisSources, completeness });
      const previewImage = await preparePreview?.({ trackId: track._id, revision: identity.revision, points: base.preview }) || null;
      if (lost) { await cleanup([previewImage?.key]); return; }
      step = 'PUBLISHING';
      const previous = await trackRepository.publish(identity, { analysis, analysisKey,
        title: base.name, analysisSources, completeness, previewImage }, now());
      if (previous) {
        const retained = new Set(trackObjectKeys(await trackRepository.findById(track._id) || {}));
        await cleanup(trackObjectKeys(previous).filter((key) => !retained.has(key)));
      } else {
        await cleanup([previewImage?.key]);
      }
    } catch (error) {
      warn({ event: 'track_analysis_failed', trackId: String(track._id), revision: identity.revision,
        step, ...analysisFailure(error) });
      // A lost MongoDB acknowledgement can mean the new object is already active.
      if (step === 'PUBLISHING') return;
      const errorCode = step === 'READING' ? 'TRACK_FILE_UNAVAILABLE' : step === 'PARSING'
        ? error?.code === 'GPX_POINT_LIMIT' ? 'GPX_POINT_LIMIT' : 'INVALID_GPX'
        : step === 'WRITING' ? 'ANALYSIS_STORAGE_UNAVAILABLE' : 'ENRICHMENT_UNAVAILABLE';
      let diagnostic = null;
      if (step === 'ENRICHING' && base && !hasPublishedResult(claimed)) {
        try {
          const analysisSources = sourcesOf(base, 'FAILED');
          const analysisKey = await objectStore.writeAnalysis({ trackId: String(track._id),
            revision: identity.revision, analysis: base, completeness: 'PARTIAL', analysisSources });
          const previewImage = await preparePreview?.({ trackId: track._id, revision: identity.revision, points: base.preview }) || null;
          diagnostic = { analysis: base, analysisKey, analysisSources, previewImage };
        } catch (writeError) {
          warn({ event: 'track_diagnostic_write_failed', trackId: String(track._id),
            revision: identity.revision, ...safeErrorDetails(writeError) });
        }
      }
      await trackRepository.fail(identity, { errorCode, failedStep: step, diagnostic }, now());
    } finally { clearInterval(heartbeat); }
  }

  return scheduleProcessing;
}
