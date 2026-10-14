import { readPublicTrackMetadata } from './track-api.js';
import { analysisForView } from './track-data.js';
import { prepareRenderableTrack } from './route-detail-ui.js';

export const COMPARISON_MAX_TRACKS = 8;
export const COMPARISON_STORAGE_KEY = 'getgpx.comparison.v1';
export const COMPARISON_IDENTITIES_STORAGE_KEY = 'getgpx.comparison-identities.v1';
export const COMPARISON_COLORS = ['#2463a6', '#bd4931', '#28815c', '#8557a6', '#ae7416', '#b33c79', '#197f89', '#666142'];
const validId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_]{1,64}$/.test(id);

export function comparisonUrl(ids) {
  return ids.length ? `/compare?tracks=${ids.map(encodeURIComponent).join(',')}` : '/compare';
}

export function comparisonIdsFromUrl(search) {
  return [...new Set((new URLSearchParams(search).get('tracks') || '').split(',').filter(validId))].slice(0, COMPARISON_MAX_TRACKS);
}

export function createComparisonSelection(storage, initialIds) {
  let ids = [];
  try {
    const saved = JSON.parse(storage?.getItem(COMPARISON_STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) ids = [...new Set(saved.filter(validId))].slice(0, COMPARISON_MAX_TRACKS);
  } catch { /* Storage can be unavailable; retain a page-session selection. */ }
  if (initialIds !== undefined) ids = [...new Set(initialIds.filter(validId))].slice(0, COMPARISON_MAX_TRACKS);
  let colorSlots = Object.create(null);
  try {
    const saved = JSON.parse(storage?.getItem(COMPARISON_IDENTITIES_STORAGE_KEY) || '{}');
    const used = new Set();
    for (const id of ids) {
      const number = saved?.[id];
      if (Number.isInteger(number) && number >= 1 && number <= COMPARISON_MAX_TRACKS && !used.has(number)) {
        colorSlots[id] = number;
        used.add(number);
      }
    }
  } catch { /* Invalid identity data does not discard the selected tracks. */ }
  function assignColors() {
    colorSlots = Object.assign(Object.create(null), Object.fromEntries(ids.filter(id => colorSlots[id]).map(id => [id, colorSlots[id]])));
    for (const id of ids) {
      if (colorSlots[id]) continue;
      colorSlots[id] = Array.from({ length: COMPARISON_MAX_TRACKS }, (_, index) => index + 1)
        .find(number => !Object.values(colorSlots).includes(number));
    }
  }
  assignColors();
  let persisted = true;
  function save(nextIds) {
    ids = nextIds;
    assignColors();
    try {
      if (!storage) throw new Error('Storage unavailable');
      storage.setItem(COMPARISON_IDENTITIES_STORAGE_KEY, JSON.stringify(colorSlots));
      storage.setItem(COMPARISON_STORAGE_KEY, JSON.stringify(ids));
      persisted = true;
    } catch { persisted = false; }
    return true;
  }
  function canAdd(nextIds) {
    return Array.isArray(nextIds) && nextIds.length > 0 && nextIds.length <= COMPARISON_MAX_TRACKS
      && nextIds.every(validId) && new Set([...ids, ...nextIds]).size <= COMPARISON_MAX_TRACKS;
  }
  return {
    get persisted() { return persisted; },
    get ids() { return [...ids]; },
    canAdd,
    identity(id) { return { number: ids.indexOf(id) + 1, color: COMPARISON_COLORS[colorSlots[id] - 1] }; },
    reorder(nextIds) {
      if (!Array.isArray(nextIds) || nextIds.length !== ids.length || new Set(nextIds).size !== ids.length
        || nextIds.some(id => !ids.includes(id))) return false;
      return save([...nextIds]);
    },
    add(nextIds) {
      return canAdd(nextIds) ? save([...new Set([...ids, ...nextIds])]) : false;
    },
    toggle(id) {
      if (!validId(id)) return false;
      return ids.includes(id) ? save(ids.filter(value => value !== id)) : this.add([id]);
    },
  };
}

export async function loadComparisonTrack(api, id, onMetadata = () => {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await readPublicTrackMetadata(api, id);
    if (result.kind === 'ready') onMetadata(result.data);
    if (result.kind !== 'ready' || !result.data.analysisUrl) throw new Error('Track unavailable');
    const response = await api.analysis(result.data.analysisUrl);
    if (!response.ok) throw new Error('Analysis unavailable');
    const analysis = await response.json();
    if (analysis.revision !== result.data.revision) continue;
    if (!analysis.points?.length) throw new Error('Geometry unavailable');
    return { metadata: result.data, track: prepareRenderableTrack(analysisForView(analysis, result.data)) };
  }
  throw new Error('Track revision changed');
}
