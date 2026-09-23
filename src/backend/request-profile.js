import { performance } from 'node:perf_hooks';

export function createRequestProfiler(log) {
  if (!log?.isLevelEnabled('debug')) return null;
  return async (step, operation) => {
    const started = performance.now();
    try {
      return await operation();
    } finally {
      log.debug({ step, durationMs: Number((performance.now() - started).toFixed(2)) }, 'Request step completed');
    }
  };
}

export function profileStep(profile, step, operation) {
  return profile ? profile(step, operation) : operation();
}
