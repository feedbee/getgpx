const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export function createHomepageTrackCache({ load, log }) {
  let value = null;
  let pending = null;
  let timer = null;
  let stopped = false;

  function loadOnce() {
    if (!pending) {
      pending = Promise.resolve().then(load).then((next) => {
        value = next;
        return next;
      }).finally(() => { pending = null; });
    }
    return pending;
  }

  function scheduleNext() {
    if (!stopped) timer = setTimeout(refresh, REFRESH_INTERVAL_MS);
  }

  async function refresh() {
    try {
      await loadOnce();
    } catch (error) {
      log.warn({ event: 'homepage_track_cache_refresh_failed', reason: error?.name || 'UNKNOWN' }, 'Homepage track cache refresh failed');
    } finally {
      scheduleNext();
    }
  }

  return {
    start: refresh,
    getHomepageTracks: () => value ?? loadOnce(),
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
