import { describe, expect, it, vi } from 'vitest';
import { parsePreviewRegenerationOptions, runPreviewRegeneration } from '../../../src/backend/track-previews/regeneration.js';

describe('preview regeneration command', () => {
  it('defaults to a dry run and validates bounded selection and resume arguments', () => {
    expect(parsePreviewRegenerationOptions([])).toEqual({ apply: false, force: false });
    expect(parsePreviewRegenerationOptions(['--apply', '--force', '--track', 'route', '--limit', '10', '--after', '0123456789abcdef01234567']))
      .toEqual({ apply: true, force: true, publicId: 'route', limit: 10, after: '0123456789abcdef01234567' });
    for (const args of [['--limit', '0'], ['--limit', '1.5'], ['--after', '../x'], ['--track', '../x'], ['--unknown'], ['--apply', '--dry-run']]) {
      expect(() => parsePreviewRegenerationOptions(args)).toThrow();
    }
  });
  it('reports missing and stale previews without invoking generation in a dry run', async () => {
    const regenerate = vi.fn();
    const tracks = [{ _id: 'one', publicId: 'missing' }, { _id: 'two', publicId: 'current' }];
    const summary = await runPreviewRegeneration({ trackRepository: { iteratePreviewTracks: () => tracks },
      previews: { canGenerate: () => true, isCurrent: (track) => track.publicId === 'current', regenerate }, options: {} });
    expect(summary).toMatchObject({ scanned: 2, eligible: 1, planned: 1, unchanged: 1, generated: 0, lastId: 'two' });
    expect(regenerate).not.toHaveBeenCalled();
  });
  it('continues after individual failures and reruns only unfinished work by default', async () => {
    const tracks = [{ _id: 'one', publicId: 'first' }, { _id: 'two', publicId: 'second' }];
    const current = new Set();
    let failFirst = true;
    const previews = { canGenerate: () => true, isCurrent: (track) => current.has(track.publicId),
      regenerate: async (track) => {
        if (failFirst && track.publicId === 'first') return 'failed';
        current.add(track.publicId); return 'generated';
      } };
    const dependencies = { trackRepository: { iteratePreviewTracks: () => tracks }, previews, options: { apply: true } };
    expect(await runPreviewRegeneration(dependencies)).toMatchObject({ generated: 1, failed: 1 });
    failFirst = false;
    expect(await runPreviewRegeneration(dependencies)).toMatchObject({ generated: 1, unchanged: 1, failed: 0 });
  });
});
