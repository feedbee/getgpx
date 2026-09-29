import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const launcher = resolve('scripts/run-with-optional-env.js');
const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function runWithOptionalEnv(dotenv, externalValue) {
  const directory = mkdtempSync(join(tmpdir(), 'getgpx-env-'));
  directories.push(directory);
  const entry = join(directory, 'entry.mjs');
  writeFileSync(entry, 'process.stdout.write(process.env.TRACK_HUB_ENV_PROBE || "unset");');
  if (dotenv !== null) writeFileSync(join(directory, '.env'), `TRACK_HUB_ENV_PROBE=${dotenv}\n`);
  return spawnSync(process.execPath, [launcher, entry], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, TRACK_HUB_ENV_PROBE: externalValue },
  });
}

describe('optional env launcher', () => {
  it('starts quietly when .env is absent', () => {
    const result = runWithOptionalEnv(null);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('unset');
    expect(result.stderr).toBe('');
  });

  it('loads .env when present and preserves externally supplied values', () => {
    expect(runWithOptionalEnv('from-file').stdout).toBe('from-file');
    const result = runWithOptionalEnv('from-file', 'external');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('external');
    expect(result.stderr).toBe('');
  });
});
