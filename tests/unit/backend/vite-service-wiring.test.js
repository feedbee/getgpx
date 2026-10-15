import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from 'vite';
import { createS3TrackService } from '../../../src/backend/s3-track-service.js';
import configuration from '../../../vite.config.js';

const dependencies = vi.hoisted(() => ({ userRepository: { findPublicProfileById: vi.fn() } }));
vi.mock('vite', () => ({ defineConfig: value => value, loadEnv: vi.fn() }));
vi.mock('../../../src/backend/database.js', () => ({ createDatabase: () => ({ connect: async () => {}, close: vi.fn() }) }));
vi.mock('../../../src/backend/authentication.js', () => ({ createAuthentication: async () => ({
  userRepository: dependencies.userRepository, service: {},
  middleware: (req, res, next) => next(), sessionMiddleware: (req, res, next) => next(),
}) }));
vi.mock('../../../src/backend/s3-track-persistence.js', () => ({ createS3TrackPersistence: async () => ({}) }));
vi.mock('../../../src/backend/track-storage-config.js', () => ({ loadTrackStorageConfig: () => ({}) }));
vi.mock('../../../src/backend/track-previews/provider.js', () => ({ createTrackPreviewProvider: () => null }));
vi.mock('../../../src/backend/s3-track-service.js', () => ({ createS3TrackService: vi.fn(() => ({})) }));

describe('Vite service wiring', () => {
  it('provides public owner profiles to track reads as production does', async () => {
    vi.mocked(loadEnv).mockReturnValue({});
    const config = configuration({ command: 'serve', mode: 'development' });
    const plugin = config.plugins.find(plugin => plugin.name === 'authentication-api');
    await plugin.configureServer({ middlewares: { use: vi.fn() }, httpServer: new EventEmitter() });
    expect(createS3TrackService).toHaveBeenCalledWith(expect.objectContaining({ userRepository: dependencies.userRepository }));
  });
});
