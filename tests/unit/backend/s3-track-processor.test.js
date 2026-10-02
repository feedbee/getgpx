import { describe, expect, it, vi } from 'vitest';
import { createS3TrackProcessor } from '../../../src/backend/s3-track-processor.js';

function fixture() {
  const track = { _id: 'track', ownerId: 'owner', processing: { revision: 'one', sourceKey: 'source' } };
  let current = structuredClone(track);
  let finishRender;
  const candidate = { key: 'unique-diagnostic-preview.png' };
  const repository = {
    claim: vi.fn(async () => structuredClone(current)), setStep: vi.fn(async () => current),
    fail: vi.fn(async (identity, { diagnostic }) => {
      if (!current || current.processing.revision !== identity.revision) return null;
      current.result = diagnostic;
      return current;
    }),
  };
  const cleanup = vi.fn(async () => {});
  let job;
  const schedule = createS3TrackProcessor({ trackRepository: repository,
    objectStore: { readSource: async () => 'gpx', writeAnalysis: async () => 'shared-analysis' },
    analyzeSource: () => ({ name: 'Ride', preview: [{ lat: 1, lon: 2 }] }),
    enrichAnalysis: async () => { throw new Error('enrichment failed'); },
    preparePreview: () => new Promise((resolve) => { finishRender = () => resolve(candidate); }),
    cleanup, schedule: (value) => { job = value; }, warn: vi.fn(), now: () => new Date(), enrichmentTimeoutMs: 1000 });
  schedule(track);
  return { repository, cleanup, candidate, run: () => job(),
    waitForRender: async () => { while (!finishRender) await Promise.resolve(); },
    finish: () => finishRender(), remove: () => { current = null; },
    replace: () => { current.processing.revision = 'two'; }, current: () => current };
}

describe('diagnostic preview publication', () => {
  it.each(['deletion', 'revision change'])('cleans only the unique PNG after a %s during rendering rejects publication', async (race) => {
    const state = fixture();
    const running = state.run();
    await state.waitForRender();
    if (race === 'deletion') state.remove(); else state.replace();
    state.finish();
    await running;
    expect(state.repository.fail).toHaveBeenCalledOnce();
    expect(state.cleanup.mock.calls).toEqual([[[state.candidate.key]]]);
    if (race === 'revision change') expect(state.current().result).toBeUndefined();
  });

  it('retains the diagnostic PNG when publication commits but its acknowledgement is lost', async () => {
    const state = fixture();
    const commit = state.repository.fail.getMockImplementation();
    state.repository.fail.mockImplementation(async (...args) => {
      await commit(...args);
      throw new Error('MongoDB acknowledgement lost');
    });
    const running = state.run();
    await state.waitForRender();
    state.finish();
    await running;
    expect(state.current().result.previewImage).toEqual(state.candidate);
    expect(state.cleanup).not.toHaveBeenCalled();
  });
});
