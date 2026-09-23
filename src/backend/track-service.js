import { ObjectId } from 'mongodb';
import { DEFAULT_USER_TIERS } from './configuration.js';
import { normalizeTrackName } from './track-repository.js';
import { normalizeRouteType } from '../route-types.js';
import { analysisFailure } from './analysis-warning.js';
import { logger } from './logger.js';
import { profileStep } from './request-profile.js';

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

function publicIdOf(track) {
  return track.publicId ?? track._id.toString();
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

function encodeSavedCursor(relation) {
  return Buffer.from(JSON.stringify({ savedAt: relation.savedAt.toISOString(), id: relation._id.toString() })).toString('base64url');
}

function decodeSavedCursor(cursor) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const savedAt = new Date(value.savedAt);
    if (!/^[a-f\d]{24}$/i.test(value.id) || Number.isNaN(savedAt.getTime())) throw new Error();
    return { savedAt, id: ObjectId.createFromHexString(value.id) };
  } catch {
    throw new InvalidTrackCursorError();
  }
}

function filenameTitle(filename) {
  return String(filename || '').split(/[\\/]/).at(-1).replace(/\.gpx$/i, '').trim();
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
    id: publicIdOf(track),
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
  const id = publicIdOf(track);
  return {
    id,
    title: track.title,
    routeType: normalizeRouteType(track.routeType),
    status: track.analysisStatus,
    analysisLevel,
    analysisNote,
    analysisSources,
    analysis: track.analysis,
    externalLinks: track.externalLinks || {},
    createdAt: track.createdAt?.toISOString() || null,
    uploader,
    downloadUrl: `/api/tracks/${id}/download`,
  };
}

function trackCard(track) {
  const id = publicIdOf(track);
  return {
    id, title: track.title, routeType: normalizeRouteType(track.routeType), createdAt: track.createdAt.toISOString(),
    status: track.analysisStatus, step: track.analysisStep,
    distanceKm: track.analysis?.distanceKm ?? null,
    ascentM: track.analysis?.ascentM ?? null,
    descentM: track.analysis?.descentM ?? null,
    speedKmh: track.analysis?.effectiveSpeedKmh ?? null,
    estimatedDurationMs: track.analysis?.estimatedDurationMs ?? null,
    preview: track.analysis?.preview ?? null,
    externalLinks: track.externalLinks || {},
    url: `/tracks/${id}`,
    downloadUrl: `/api/tracks/${id}/download`,
  };
}

function savedTrackCard(relation) {
  return {
    ...trackCard(relation.track),
    savedAt: relation.savedAt.toISOString(),
    author: relation.author?.displayName
      ? { displayName: relation.author.displayName, avatarUrl: relation.author.avatarUrl || null }
      : null,
  };
}

function homepageTrack(track, includeAnalysis) {
  const id = publicIdOf(track);
  const result = {
    id,
    title: track.title,
    routeType: normalizeRouteType(track.routeType),
    distanceKm: track.analysis?.distanceKm ?? null,
    ascentM: track.analysis?.ascentM ?? null,
    pointsOfInterestCount: track.analysis?.pointsOfInterest?.length ?? 0,
    url: `/tracks/${id}`,
  };
  if (includeAnalysis) result.analysis = track.analysis;
  return result;
}

export function createTrackService({
  trackRepository,
  gpxFileStore,
  enrichmentCacheRepository,
  savedTrackRepository,
  userRepository,
  analyzeSource,
  enrichAnalysis,
  configuration = { userTiers: DEFAULT_USER_TIERS },
  enrichmentTimeoutMs = EXTERNAL_ANALYSIS_TIMEOUT_MS,
  schedule = (job) => setImmediate(job),
  warn = (details) => logger.warn(details, 'Track analysis warning'),
}) {
  if (!trackRepository || !gpxFileStore || !analyzeSource || !enrichAnalysis) {
    throw new Error('Track service dependencies are required.');
  }

  function scheduleAnalysis(job, track) {
    schedule(() => Promise.resolve().then(job).catch((error) => {
      warn({ event: 'track_analysis_job_failed', trackId: String(track._id),
        revision: track.analysisRevision, ...analysisFailure(error) });
    }));
  }

  async function enrich(track) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), enrichmentTimeoutMs);
    try {
      const analysis = await enrichAnalysis(track.analysis, { cache: enrichmentCacheRepository, signal: controller.signal,
        warn: (details) => warn({ trackId: String(track._id), revision: track.analysisRevision, ...details }) });
      await trackRepository.completeAnalysis({
        trackId: track._id,
        ownerId: track.ownerId,
        revision: track.analysisRevision,
        analysis,
      });
    } catch (error) {
      warn({ event: 'track_analysis_failed', trackId: String(track._id), revision: track.analysisRevision,
        step: 'ENRICHING', pointCount: track.analysis?.points?.length, ...analysisFailure(error, controller.signal) });
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
    let enriching;
    try {
      const source = await readUtf8(gpxFileStore.openDownload(track.sourceFileId));
      const analysis = analyzeSource(source, { filename: track.originalFilename });
      enriching = await trackRepository.saveBaseAnalysis({
        trackId: track._id,
        ownerId: track.ownerId,
        revision: track.analysisRevision,
        title: analysis.name,
        analysis,
      });
    } catch (error) {
      warn({ event: 'track_analysis_failed', trackId: String(track._id), revision: track.analysisRevision,
        step: 'PARSING', ...analysisFailure(error) });
      await trackRepository.failAnalysis({
        trackId: track._id,
        ownerId: track.ownerId,
        revision: track.analysisRevision,
        failedStep: 'PARSING',
        errorCode: 'INVALID_GPX',
      });
    }
    if (enriching) await enrich(enriching);
  }

  async function enrichReplacement(track) {
    const pending = track.replacement;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), enrichmentTimeoutMs);
    try {
      const analysis = await enrichAnalysis(pending.analysis, { cache: enrichmentCacheRepository, signal: controller.signal,
        warn: (details) => warn({ trackId: String(track._id), revision: pending.revision, replacement: true, ...details }) });
      const previous = await trackRepository.completeReplacement({
        trackId: track._id,
        ownerId: track.ownerId,
        revision: pending.revision,
        title: pending.title,
        normalizedName: normalizeTrackName(pending.title),
        analysis,
      });
      if (previous) await gpxFileStore.delete(previous.sourceFileId).catch(() => undefined);
    } catch (error) {
      warn({ event: 'track_analysis_failed', trackId: String(track._id), revision: pending.revision,
        replacement: true, step: 'ENRICHING', pointCount: pending.analysis?.points?.length,
        ...analysisFailure(error, controller.signal) });
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
    let enriching;
    try {
      const source = await readUtf8(gpxFileStore.openDownload(pending.sourceFileId));
      const analysis = analyzeSource(source, { filename: pending.originalFilename });
      enriching = await trackRepository.saveReplacementBase({
        trackId: track._id, ownerId: track.ownerId, revision: pending.revision, title: analysis.name, analysis,
      });
    } catch (error) {
      warn({ event: 'track_analysis_failed', trackId: String(track._id), revision: pending.revision,
        replacement: true, step: 'PARSING', ...analysisFailure(error) });
      await trackRepository.failReplacement({
        trackId: track._id, ownerId: track.ownerId, revision: pending.revision,
        failedStep: 'PARSING', errorCode: 'INVALID_GPX',
      });
    }
    if (enriching) await enrichReplacement(enriching);
  }

  return {
    async getHomepageTracks(homepageTrackIds = configuration.homepageTrackIds, profile) {
      const configuredIds = homepageTrackIds?.map((id) => ObjectId.createFromHexString(id));
      const tracks = await profileStep(profile, 'homepage.listTracks', () => trackRepository.listHomepage(configuredIds));
      return profileStep(profile, 'homepage.prepareResponse', () => tracks.map((track, index) => homepageTrack(track, index === 0)));
    },

    async upload({ ownerId, tier = 'BASIC', filename, routeType, source, profile }) {
      const limit = configuration.userTiers[tier]?.limits?.tracks
        ?? configuration.userTiers.BASIC.limits.tracks;
      if (await profileStep(profile, 'upload.countTracks', () => trackRepository.countOwned(ownerId)) >= limit) {
        throw new TrackLimitReachedError(limit);
      }
      const sourceFileId = await profileStep(profile, 'upload.saveFile', () => gpxFileStore.save({ filename, ownerId, source }));
      let track;
      try {
        track = await profileStep(profile, 'upload.createTrack', () => trackRepository.createProcessing({
          ownerId,
          sourceFileId,
          originalFilename: filename,
          title: filenameTitle(filename),
          routeType,
        }));
      } catch (error) {
        await gpxFileStore.delete(sourceFileId).catch(() => undefined);
        throw error;
      }
      scheduleAnalysis(() => process(track), track);
      return statusOf(track);
    },

    async getStatus({ publicId, ownerId }) {
      return statusOf(await trackRepository.findOwnedByPublicId(publicId, ownerId));
    },

    async getManagement({ publicId, ownerId }) {
      const track = await trackRepository.findOwnedByPublicId(publicId, ownerId);
      if (!track) return null;
      return {
        id: publicIdOf(track), title: track.title, routeType: normalizeRouteType(track.routeType),
        speedKmh: track.analysis?.effectiveSpeedKmh ?? null,
        externalLinks: track.externalLinks || {},
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

    async updateDetails({ publicId, ownerId, title, speedKmh, routeType, externalLinks }) {
      const track = await trackRepository.findOwnedByPublicId(publicId, ownerId);
      if (!track?.analysis) return null;
      const updated = await trackRepository.updateDetails({
        trackId: track._id, ownerId, title, speedKmh, routeType, externalLinks,
        estimatedDurationMs: (track.analysis.distanceKm / speedKmh) * 3_600_000,
      });
      if (!updated) return null;
      const uploader = userRepository?.findPublicProfileById
        ? await userRepository.findPublicProfileById(updated.ownerId)
        : null;
      return publicTrack(updated, uploader);
    },

    async replaceFile({ publicId, ownerId, filename, source }) {
      const sourceFileId = await gpxFileStore.save({ filename, ownerId, source });
      const existing = await trackRepository.findOwnedByPublicId(publicId, ownerId);
      if (!existing || existing.replacement?.status === 'PROCESSING') {
        await gpxFileStore.delete(sourceFileId).catch(() => undefined);
        return null;
      }
      const track = await trackRepository.beginReplacement({ trackId: existing._id, ownerId, sourceFileId, originalFilename: filename });
      if (!track) {
        await gpxFileStore.delete(sourceFileId).catch(() => undefined);
        return null;
      }
      if (existing.replacement?.sourceFileId) await gpxFileStore.delete(existing.replacement.sourceFileId).catch(() => undefined);
      scheduleAnalysis(() => processReplacement(track), track);
      return statusOf(track);
    },

    async deleteTrack({ publicId, ownerId }) {
      const existing = await trackRepository.findOwnedByPublicId(publicId, ownerId);
      const track = existing ? await trackRepository.deleteOwned(existing._id, ownerId) : null;
      if (!track) return false;
      await Promise.allSettled([
        gpxFileStore.delete(track.sourceFileId),
        track.replacement?.sourceFileId ? gpxFileStore.delete(track.replacement.sourceFileId) : Promise.resolve(),
        savedTrackRepository.removeForTrack(track._id),
      ]);
      return true;
    },

    async deleteTracks({ publicIds, ownerId }) {
      const deletedIds = [];
      for (const publicId of publicIds) {
        const existing = await trackRepository.findOwnedByPublicId(publicId, ownerId);
        const track = existing ? await trackRepository.deleteOwned(existing._id, ownerId) : null;
        if (!track) continue;
        await Promise.allSettled([
          gpxFileStore.delete(track.sourceFileId),
          track.replacement?.sourceFileId ? gpxFileStore.delete(track.replacement.sourceFileId) : Promise.resolve(),
          savedTrackRepository.removeForTrack(track._id),
        ]);
        deletedIds.push(publicId);
      }
      return deletedIds;
    },

    async listMyTracks({ ownerId, query = '', cursor = '' }) {
      const tracks = await trackRepository.listOwned({ ownerId, query, before: decodeCursor(cursor), limit: MY_TRACKS_PAGE_SIZE });
      const hasMore = tracks.length > MY_TRACKS_PAGE_SIZE;
      const page = tracks.slice(0, MY_TRACKS_PAGE_SIZE);
      const favoriteIds = new Set((await savedTrackRepository.savedTrackIds({ userId: ownerId, trackIds: page.map((track) => track._id) })).map(String));
      return { items: page.map((track) => ({ ...trackCard(track), isFavorite: favoriteIds.has(String(track._id)) })), nextCursor: hasMore ? encodeCursor(page.at(-1)) : null };
    },

    async listSavedTracks({ userId, query = '', cursor = '' }) {
      const relations = await savedTrackRepository.list({ userId, query, before: decodeSavedCursor(cursor), limit: MY_TRACKS_PAGE_SIZE });
      const hasMore = relations.length > MY_TRACKS_PAGE_SIZE;
      const page = relations.slice(0, MY_TRACKS_PAGE_SIZE);
      return { items: page.map(savedTrackCard), nextCursor: hasMore ? encodeSavedCursor(page.at(-1)) : null };
    },

    async getSavedState({ publicId, userId }) {
      const track = await trackRepository.findByPublicId(publicId);
      if (!track) return false;
      return savedTrackRepository.isSaved({ userId, trackId: track._id });
    },

    async saveTrack({ publicId, userId }) {
      const track = await trackRepository.findByPublicId(publicId);
      if (!track) return false;
      await savedTrackRepository.save({ userId, trackId: track._id });
      return true;
    },

    async unsaveTrack({ publicId, userId }) {
      const track = await trackRepository.findByPublicId(publicId);
      if (!track) return false;
      await savedTrackRepository.remove({ userId, trackId: track._id });
      return true;
    },

    async unsaveTracks({ publicIds, userId }) {
      const found = await Promise.all(publicIds.map(async (publicId) => ({
        publicId, track: await trackRepository.findByPublicId(publicId),
      })));
      const existing = found.filter(({ track }) => track);
      const savedIds = new Set((await savedTrackRepository.savedTrackIds({ userId, trackIds: existing.map(({ track }) => track._id) })).map(String));
      const favorites = existing.filter(({ track }) => savedIds.has(String(track._id)));
      if (favorites.length) await savedTrackRepository.removeMany({ userId, trackIds: favorites.map(({ track }) => track._id) });
      return favorites.map(({ publicId }) => publicId);
    },

    async getPublicTrack(publicId, profile) {
      const track = await profileStep(profile, 'track.find', () => trackRepository.findByPublicId(publicId));
      if (!track) return null;
      const uploader = userRepository?.findPublicProfileById
        ? await profileStep(profile, 'track.findAuthor', () => userRepository.findPublicProfileById(track.ownerId))
        : null;
      return profileStep(profile, 'track.prepareResponse', () => publicTrack(track, uploader));
    },

    async getPublicDownload(publicId) {
      const track = await trackRepository.findByPublicId(publicId);
      if (!track) return null;
      return {
        filename: track.originalFilename,
        stream: gpxFileStore.openDownload(track.sourceFileId),
      };
    },

    async retryAnalysis({ publicId, ownerId }) {
      const existing = await trackRepository.findOwnedByPublicId(publicId, ownerId);
      if (!existing) return null;
      const trackId = existing._id;
      if (existing?.replacement) {
        const track = await trackRepository.restartReplacementEnrichment({ trackId, ownerId });
        if (!track) return null;
        scheduleAnalysis(() => enrichReplacement(track), track);
        return statusOf(track);
      }
      const track = await trackRepository.restartEnrichment({ trackId, ownerId });
      if (!track) return null;
      scheduleAnalysis(() => enrich(track), track);
      return statusOf(track);
    },
  };
}
