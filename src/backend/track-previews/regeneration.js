import { isPublicId } from '../public-id.js';

export function parsePreviewRegenerationOptions(args) {
  const options = { apply: false, force: false };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--apply') options.apply = true;
    else if (flag === '--force') options.force = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--variant') {
      options.variant = args[++index];
      if (!['list', 'social', 'all'].includes(options.variant)) throw new Error('Invalid --variant.');
    }
    else if (flag === '--help') options.help = true;
    else if (flag === '--track') {
      options.publicId = args[++index];
      if (!isPublicId(options.publicId)) throw new Error('Invalid --track public ID.');
    } else if (flag === '--after') {
      options.after = args[++index];
      if (!/^[a-f\d]{24}$/i.test(options.after || '')) throw new Error('Invalid --after MongoDB ID.');
    } else if (flag === '--limit') {
      const value = args[++index];
      options.limit = Number(value);
      if (!/^\d+$/.test(value || '') || !Number.isSafeInteger(options.limit) || options.limit < 1) throw new Error('Invalid --limit.');
    } else throw new Error('Unknown preview regeneration option.');
  }
  if (options.apply && options.dryRun) throw new Error('--apply and --dry-run cannot be combined.');
  delete options.dryRun;
  return options;
}

// A streaming MongoDB cursor and sequential rendering keep memory and provider use bounded.
export async function runPreviewRegeneration({ trackRepository, previews, options, onProgress = () => {} }) {
  const summary = { scanned: 0, eligible: 0, planned: 0, generated: 0, unchanged: 0,
    skipped: 0, conflict: 0, failed: 0, lastId: null };
  for await (const track of trackRepository.iteratePreviewTracks(options)) {
    const variants = options.variant === 'all' ? ['list', 'social'] : [options.variant || 'list'];
    for (const variant of variants) {
      let status;
      if (!previews.canGenerate(track)) status = 'skipped';
      else if (!options.force && previews.isCurrent(track, variant)) status = 'unchanged';
      else {
        summary.eligible++;
        status = options.apply ? await previews.regenerate(track, { force: options.force, variant }) : 'planned';
      }
      summary[status]++;
      onProgress({ publicId: track.publicId, id: String(track._id), variant, status });
    }
    summary.scanned++;
    summary.lastId = String(track._id);
  }
  return summary;
}
