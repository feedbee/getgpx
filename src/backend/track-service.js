import { ObjectId } from 'mongodb';
import { DEFAULT_USER_TIERS } from './configuration.js';
import { normalizeTrackName } from './track-repository.js';

const ERROR_MESSAGES = {
  INVALID_GPX: 'Не удалось прочитать GPX-файл. Проверьте файл и попробуйте снова.',
  ENRICHMENT_UNAVAILABLE: 'Не удалось получить данные о дорогах и покрытии. Попробуйте повторить анализ.',
};

const MY_TRACKS_PAGE_SIZE = 24;
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

function encodeCursor(track) {
  return Buffer.from(JSON.stringify({ createdAt: track.createdAt.toISOString(), id: track._id.toString() })).toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const createdAt = new Date(value.createdAt);
    if (!/^[a-f\d]{24}$/i.test(value.id) || Number.isNaN(createdAt.getTime())) throw new Error();
    return { createdAt, id: ObjectId.createFromHexString(value.id) };
  } catch {
    throw new InvalidTrackCursorError();
  }
}

function filenameTitle(filename) {
  return String(filename || '').split(/[\\/]/).at(-1).replace(/\.gpx$/i, '').trim() || 'Маршрут без названия';
}

async function readUtf8(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function statusOf(track) {
  if (!track) return null;
  const active = track.replacement || track;
  const code = active.error?.code || active.analysisError?.code || null;
  return {
    id: track._id.toString(),
    status: active.status || active.analysisStatus,
    step: active.step || active.analysisStep,
    error: code ? { message: ERROR_MESSAGES[code] || 'Не удалось обработать трек.', code } : null,
  };
}

function publicTrack(track, uploader = null) {
  if (!track) return null;
  const analysisLevel = track.analysisStatus === 'READY' ? 'FULL' : track.analysis ? 'BASIC' : 'NONE';
  const hasValhalla = ['VALHALLA', 'VALHALLA_OSM'].includes(track.analysis?.enrichmentSource);
  const hasOsm = track.analysis?.enrichmentSource === 'VALHALLA_OSM';
  const isEnriching = track.analysisStatus === 'PROCESSING' && Boolean(track.analysis);
  const analysisSources = {
    gpx: track.analysis ? 'SUCCESS' : track.analysisStatus === 'PROCESSING' ? 'PENDING' : 'FAILED',
    valhalla: hasValhalla ? 'SUCCESS' : isEnriching ? 'PENDING' : 'FAILED',
    openStreetMap: hasOsm ? 'SUCCESS' : isEnriching ? 'PENDING' : 'FAILED',
  };
  const elevationSource = track.analysis?.elevationSource;
  const elevationAttribution = elevationSource === 'VALHALLA_DEM'
    ? 'маршрут из GPX, высоты по модели рельефа Valhalla'
    : 'маршрут и высоты из GPX';
  let analysisNote = 'Источники: исходный GPX сохранён, но данные маршрута разобрать не удалось.';
  if (analysisLevel === 'BASIC') analysisNote = elevationSource === 'NONE' || elevationSource === 'GPX_PARTIAL'
    ? 'Источники: GPX — маршрут и основные показатели. Высоты и дорожные данные недоступны.'
    : 'Источники: GPX — маршрут, высоты и основные показатели. Дорожные данные недоступны.';
  if (track.analysisStatus === 'PROCESSING' && analysisLevel === 'NONE') analysisNote = 'Источники: GPX сохранён и ожидает обработки.';
  if (track.analysisStatus === 'PROCESSING' && analysisLevel === 'BASIC') analysisNote = elevationSource === 'NONE' || elevationSource === 'GPX_PARTIAL'
    ? 'Источники: GPX — маршрут и основные показатели. Высоты и дорожные данные ещё обрабатываются.'
    : 'Источники: GPX — маршрут, высоты и основные показатели. Дорожные данные ещё обрабатываются.';
  if (analysisLevel === 'FULL' && track.analysis?.enrichmentSource === 'VALHALLA') {
    analysisNote = `Источники: ${elevationAttribution}; Valhalla — типы дорог и оценка покрытий. Детальные теги OpenStreetMap временно недоступны.`;
  } else if (analysisLevel === 'FULL') {
    analysisNote = `Источники: ${elevationAttribution}; Valhalla — сопоставление с дорогами; OpenStreetMap — покрытия и качество дорог.`;
  }
  const id = track._id.toString();
  return {
    id,
    title: track.title,
    status: track.analysisStatus,
    analysisLevel,
    analysisNote,
    analysisSources,
    analysis: track.analysis,
    createdAt: track.createdAt?.toISOString() || null,
    uploader,
    downloadUrl: `/api/tracks/${id}/download`,
  };
}

function trackCard(track) {
  const id = track._id.toString();
  return {
    id, title: track.title, createdAt: track.createdAt.toISOString(),
    status: track.analysisStatus, step: track.analysisStep,
    distanceKm: track.analysis?.distanceKm ?? null,
    ascentM: track.analysis?.ascentM ?? null,
    descentM: track.analysis?.descentM ?? null,
    speedKmh: track.analysis?.effectiveSpeedKmh ?? null,
    estimatedDurationMs: track.analysis?.estimatedDurationMs ?? null,
    preview: track.analysis?.preview ?? null,
    url: `/tracks/${id}`,
    downloadUrl: `/api/tracks/${id}/download`,
  };
}

export function createTrackService({
  trackRepository,
  gpxFileStore,
  enrichmentCacheRepository,
  userRepository,
  analyzeSource,
  enrichAnalysis,
  configuration = { userTiers: DEFAULT_USER_TIERS },
  enrichmentTimeoutMs = EXTERNAL_ANALYSIS_TIMEOUT_MS,
  schedule = (job) => setImmediate(job),
}) {
  if (!trackRepository || !gpxFileStore || !analyzeSource || !enrichAnalysis) {
    throw new Error('Track service dependencies are required.');
  }

  async function enrich(track) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), enrichmentTimeoutMs);
    try {
      const analysis = await enrichAnalysis(track.analysis, { cache: enrichmentCacheRepository, signal: controller.signal });
      await trackRepository.completeAnalysis({
        trackId: track._id,
        ownerId: track.ownerId,
        revision: track.analysisRevision,
        analysis,
      });
    } catch {
      await trackRepository.failAnalysis({
        trackId: track._id,
        ownerId: track.ownerId,
        revision: track.analysisRevision,
        failedStep: 'ENRICHING',
        errorCode: 'ENRICHMENT_UNAVAILABLE',
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function process(track) {
    const parsing = await trackRepository.setAnalysisStep({
      trackId: track._id,
      ownerId: track.ownerId,
      revision: track.analysisRevision,
      step: 'PARSING',
    });
    if (!parsing) return;
    try {
      const source = await readUtf8(gpxFileStore.openDownload(track.sourceFileId));
      const analysis = analyzeSource(source, { filename: track.originalFilename });
      const enriching = await trackRepository.saveBaseAnalysis({
        trackId: track._id,
        ownerId: track.ownerId,
        revision: track.analysisRevision,
        title: analysis.name,
        analysis,
      });
      if (enriching) await enrich(enriching);
    } catch {
      await trackRepository.failAnalysis({
        trackId: track._id,
        ownerId: track.ownerId,
        revision: track.analysisRevision,
        failedStep: 'PARSING',
        errorCode: 'INVALID_GPX',
      });
    }
  }

  async function enrichReplacement(track) {
    const pending = track.replacement;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), enrichmentTimeoutMs);
    try {
      const analysis = await enrichAnalysis(pending.analysis, { cache: enrichmentCacheRepository, signal: controller.signal });
      const previous = await trackRepository.completeReplacement({
        trackId: track._id,
        ownerId: track.ownerId,
        revision: pending.revision,
        title: pending.title,
        normalizedName: normalizeTrackName(pending.title),
        analysis,
      });
      if (previous) await gpxFileStore.delete(previous.sourceFileId).catch(() => undefined);
    } catch {
      await trackRepository.failReplacement({
        trackId: track._id, ownerId: track.ownerId, revision: pending.revision,
        failedStep: 'ENRICHING', errorCode: 'ENRICHMENT_UNAVAILABLE',
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function processReplacement(track) {
    const pending = track.replacement;
    const parsing = await trackRepository.setReplacementStep({
      trackId: track._id, ownerId: track.ownerId, revision: pending.revision, step: 'PARSING',
    });
    if (!parsing) return;
    try {
      const source = await readUtf8(gpxFileStore.openDownload(pending.sourceFileId));
      const analysis = analyzeSource(source, { filename: pending.originalFilename });
      const enriching = await trackRepository.saveReplacementBase({
        trackId: track._id, ownerId: track.ownerId, revision: pending.revision, title: analysis.name, analysis,
      });
      if (enriching) await enrichReplacement(enriching);
    } catch {
      await trackRepository.failReplacement({
        trackId: track._id, ownerId: track.ownerId, revision: pending.revision,
        failedStep: 'PARSING', errorCode: 'INVALID_GPX',
      });
    }
  }

  return {
    async upload({ ownerId, tier = 'BASIC', filename, source }) {
      const limit = configuration.userTiers[tier]?.limits?.tracks
        ?? configuration.userTiers.BASIC.limits.tracks;
      if (await trackRepository.countOwned(ownerId) >= limit) throw new TrackLimitReachedError(limit);
      const sourceFileId = await gpxFileStore.save({ filename, ownerId, source });
      let track;
      try {
        track = await trackRepository.createProcessing({
          ownerId,
          sourceFileId,
          originalFilename: filename,
          title: filenameTitle(filename),
        });
      } catch (error) {
        await gpxFileStore.delete(sourceFileId).catch(() => undefined);
        throw error;
      }
      schedule(() => process(track));
      return statusOf(track);
    },

    async getStatus({ trackId, ownerId }) {
      return statusOf(await trackRepository.findOwnedById(trackId, ownerId));
    },

    async getManagement({ trackId, ownerId }) {
      const track = await trackRepository.findOwnedById(trackId, ownerId);
      if (!track) return null;
      return {
        id: track._id.toString(), title: track.title,
        speedKmh: track.analysis?.effectiveSpeedKmh ?? null,
        analysis: statusOf(track),
        replacement: track.replacement ? statusOf(track) : null,
        canRetry: track.replacement
          ? track.replacement.status === 'FAILED' && Boolean(track.replacement.analysis)
          : (track.analysisStatus === 'FAILED' && Boolean(track.analysis))
            || (track.analysisStatus === 'READY' && track.analysis?.enrichmentSource === 'VALHALLA'),
        missingOsmTags: track.analysisStatus === 'READY' && track.analysis?.enrichmentSource === 'VALHALLA',
        retrySource: track.analysisStatus === 'READY' && track.analysis?.enrichmentSource === 'VALHALLA'
          ? 'openStreetMap' : 'valhalla',
      };
    },

    async updateDetails({ trackId, ownerId, title, speedKmh }) {
      const track = await trackRepository.findOwnedById(trackId, ownerId);
      if (!track?.analysis) return null;
      const updated = await trackRepository.updateDetails({
        trackId, ownerId, title, speedKmh,
        estimatedDurationMs: (track.analysis.distanceKm / speedKmh) * 3_600_000,
      });
      if (!updated) return null;
      const uploader = userRepository?.findPublicProfileById
        ? await userRepository.findPublicProfileById(updated.ownerId)
        : null;
      return publicTrack(updated, uploader);
    },

    async replaceFile({ trackId, ownerId, filename, source }) {
      const sourceFileId = await gpxFileStore.save({ filename, ownerId, source });
      const existing = await trackRepository.findOwnedById(trackId, ownerId);
      if (!existing || existing.replacement?.status === 'PROCESSING') {
        await gpxFileStore.delete(sourceFileId).catch(() => undefined);
        return null;
      }
      const track = await trackRepository.beginReplacement({ trackId, ownerId, sourceFileId, originalFilename: filename });
      if (!track) {
        await gpxFileStore.delete(sourceFileId).catch(() => undefined);
        return null;
      }
      if (existing.replacement?.sourceFileId) await gpxFileStore.delete(existing.replacement.sourceFileId).catch(() => undefined);
      schedule(() => processReplacement(track));
      return statusOf(track);
    },

    async deleteTrack({ trackId, ownerId }) {
      const track = await trackRepository.deleteOwned(trackId, ownerId);
      if (!track) return false;
      await Promise.allSettled([
        gpxFileStore.delete(track.sourceFileId),
        track.replacement?.sourceFileId ? gpxFileStore.delete(track.replacement.sourceFileId) : Promise.resolve(),
      ]);
      return true;
    },

    async deleteTracks({ trackIds, ownerId }) {
      const deletedIds = [];
      for (const trackId of trackIds) {
        const track = await trackRepository.deleteOwned(trackId, ownerId);
        if (!track) continue;
        await Promise.allSettled([
          gpxFileStore.delete(track.sourceFileId),
          track.replacement?.sourceFileId ? gpxFileStore.delete(track.replacement.sourceFileId) : Promise.resolve(),
        ]);
        deletedIds.push(trackId);
      }
      return deletedIds;
    },

    async listMyTracks({ ownerId, query = '', cursor = '' }) {
      const tracks = await trackRepository.listOwned({ ownerId, query, before: decodeCursor(cursor), limit: MY_TRACKS_PAGE_SIZE });
      const hasMore = tracks.length > MY_TRACKS_PAGE_SIZE;
      const page = tracks.slice(0, MY_TRACKS_PAGE_SIZE);
      return { items: page.map(trackCard), nextCursor: hasMore ? encodeCursor(page.at(-1)) : null };
    },

    async getPublicTrack(trackId) {
      const track = await trackRepository.findById(trackId);
      if (!track) return null;
      const uploader = userRepository?.findPublicProfileById
        ? await userRepository.findPublicProfileById(track.ownerId)
        : null;
      return publicTrack(track, uploader);
    },

    async getPublicDownload(trackId) {
      const track = await trackRepository.findById(trackId);
      if (!track) return null;
      return {
        filename: track.originalFilename,
        stream: gpxFileStore.openDownload(track.sourceFileId),
      };
    },

    async retryAnalysis({ trackId, ownerId }) {
      const existing = await trackRepository.findOwnedById(trackId, ownerId);
      if (existing?.replacement) {
        const track = await trackRepository.restartReplacementEnrichment({ trackId, ownerId });
        if (!track) return null;
        schedule(() => enrichReplacement(track));
        return statusOf(track);
      }
      const track = await trackRepository.restartEnrichment({ trackId, ownerId });
      if (!track) return null;
      schedule(() => enrich(track));
      return statusOf(track);
    },
  };
}
