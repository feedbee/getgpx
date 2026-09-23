import { t } from './i18n.js';
import { classifyClimb } from './domain/climbs.js';
import { surfaceCategories, roadQualityCategories, classifyWayType, roadTypeLabel } from './domain/surface.js';
const known = (items, id) => items.find(item => item.id === id) || items.find(item => item.id === 'unknown');
// Legacy cached labels are ignored using their stable classifier IDs, never by text.
export function neutralAnalysis(track) {
  return {
    ...track,
    points: track.points.map(point => point.surface ? { ...point, surface: {
      ...point.surface, label: known(surfaceCategories, point.surface.id).label,
      quality: { ...point.surface.quality, label: known(roadQualityCategories, point.surface.quality?.id).label },
    } } : point),
    climbs: track.climbs?.map(item => ({ ...item, label: classifyClimb(item.score).label })),
    descents: track.descents?.map(item => ({ ...item, label: classifyClimb(item.score).label })),
  };
}
export function poiName(point, index) { return point.nameGenerated || !point.name ? t('poi.unnamed', { number: index + 1 }) : point.name; }
export function poiType(point) {
  const id = String(point.type || point.symbol || '').toUpperCase().replaceAll('_', ' ');
  const keys = { WATER: 'poi.water', FOOD: 'poi.food', 'AID STATION': 'poi.aid' };
  return keys[id] ? t(keys[id]) : point.type || point.symbol;
}
export function roadLabel(highway) { return t(roadTypeLabel(highway)); }
export function wayLabel(surface) { return t(classifyWayType(surface.highway).label); }
