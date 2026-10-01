import { terrainForView } from './track-data.js';
import { t, bindText, escapeHtml, formatMeasurement, htmlMessage, percent } from './i18n.js';
import { roadQualityCategories, surfaceCategories, wayTypeCategories } from './domain/surface.js';

export function renderClimbs(track, documentRef = document) {
  bindText(documentRef.querySelector('#climbs-count'), () => track.climbs.length);
  bindText(documentRef.querySelector('#descents-count'), () => track.descents.length);
  const rows = (items, type) => items.length ? items.map((item, index) => {
    const key = `${type}-${index}`;
    return `<button class="terrain-row" type="button" data-terrain-range="${key}" data-terrain-type="${type}" data-terrain-index="${index}" aria-pressed="false" style="--terrain-color:${item.color}"><b>#${index + 1}</b><i></i><span>${escapeHtml(t(item.label))}</span><span>△ ${percent(item.averageGrade)}</span><span>${type === 'climb' ? '↗' : '↘'} ${formatMeasurement('elevation', type === 'climb' ? item.gainM : item.dropM)}</span><span>↔ ${formatMeasurement('distance', item.lengthM / 1000, { digits: 2 })}</span></button>`;
  }).join('') : `<p class="empty-climbs">${htmlMessage('terrain.empty')}</p>`;
  documentRef.querySelector('#climbs-list').innerHTML = rows(terrainForView(track.climbs), 'climb');
  documentRef.querySelector('#descents-list').innerHTML = rows(terrainForView(track.descents, [], true), 'descent');
}

export function renderSurfaces(trackSummary, { documentRef = document, onFiltersRendered = () => {} } = {}) {
  const categoryRows = (items, categories) => categories.map((category) => ({
    ...category, ...(items || []).find((item) => item.id === category.id),
    distanceKm: (items || []).find((item) => item.id === category.id)?.distanceKm ?? 0,
    percent: (items || []).find((item) => item.id === category.id)?.percent ?? 0,
  }));
  const summary = categoryRows(trackSummary.distributions.surfaces, surfaceCategories);
  const wayTypes = categoryRows(trackSummary.distributions.wayTypes, wayTypeCategories);
  const quality = categoryRows(trackSummary.distributions.roadQualities, roadQualityCategories);
  documentRef.querySelector('#surface-bar').innerHTML = summary.filter((item) => item.percent > 0).map((item) =>
    `<button type="button" data-surface-filter="${item.id}" style="--surface-color:${item.color};flex:${item.percent}" title="${escapeHtml(t(item.label))}: ${percent(item.percent)}" aria-label="${escapeHtml(t(item.label))}: ${escapeHtml(t('profile.percentRoute', { percent: percent(item.percent) }))}" aria-pressed="false"></button>`).join('');
  documentRef.querySelector('#surface-stats').innerHTML = summary.map((item) => `
    <button class="surface-stat distribution-row" type="button" data-surface-filter="${item.id}" data-selected-label="${escapeHtml(t('surface.selected'))}" data-map-label="${escapeHtml(t('surface.onMap'))}" aria-pressed="false" ${item.distanceKm === 0 ? 'disabled' : ''}>
      <i style="--surface-color:${item.color}"></i><span>${escapeHtml(t(item.label))}</span>
      <strong>${formatMeasurement('distance', item.distanceKm)}</strong><small>${percent(item.percent, 0)}</small></button>`).join('');
  documentRef.querySelector('#way-type-bar').innerHTML = wayTypes.filter((item) => item.percent > 0).map((item) =>
    `<button type="button" data-waytype-filter="${item.id}" style="--surface-color:${item.color};flex:${item.percent}" title="${escapeHtml(t(item.label))}: ${percent(item.percent)}" aria-label="${escapeHtml(t(item.label))}: ${escapeHtml(t('profile.percentRoute', { percent: percent(item.percent) }))}" aria-pressed="false"></button>`).join('');
  documentRef.querySelector('#way-type-stats').innerHTML = wayTypes.map((item) => `
    <button class="distribution-row" type="button" data-waytype-filter="${item.id}" aria-pressed="false" ${item.distanceKm === 0 ? 'disabled' : ''}><i style="--surface-color:${item.color}"></i><span>${escapeHtml(t(item.label))}</span><strong>${formatMeasurement('distance', item.distanceKm)}</strong><small>${percent(item.percent, 0)}</small></button>`).join('');
  documentRef.querySelector('#surface-legend').innerHTML = surfaceCategories.map((item) =>
    `<span><i style="--surface-color:${item.color}"></i>${escapeHtml(t(item.label))}</span>`).join('');
  documentRef.querySelector('#waytype-legend').innerHTML = wayTypeCategories.map((item) =>
    `<span><i style="--surface-color:${item.color}"></i>${escapeHtml(t(item.label))}</span>`).join('');
  documentRef.querySelector('#quality-legend').innerHTML = roadQualityCategories.map((item) =>
    `<span><i style="--surface-color:${item.color}"></i>${escapeHtml(t(item.label))}</span>`).join('');
  documentRef.querySelector('#quality-bar').innerHTML = quality.filter((item) => item.percent > 0).map((item) =>
    `<button type="button" data-quality-filter="${item.id}" style="--surface-color:${item.color};flex:${item.percent}" title="${escapeHtml(t(item.label))}: ${percent(item.percent)}" aria-label="${escapeHtml(t(item.label))}: ${escapeHtml(t('profile.percentRoute', { percent: percent(item.percent) }))}" aria-pressed="false"></button>`).join('');
  documentRef.querySelector('#quality-stats').innerHTML = quality.map((item) => `
    <button class="distribution-row" type="button" data-quality-filter="${item.id}" aria-pressed="false" ${item.distanceKm === 0 ? 'disabled' : ''}><i style="--surface-color:${item.color}"></i><span>${escapeHtml(t(item.label))}</span><strong>${formatMeasurement('distance', item.distanceKm)}</strong><small>${percent(item.percent, 0)}</small></button>`).join('');
  documentRef.querySelectorAll('[data-surface-filter],[data-waytype-filter],[data-quality-filter]')
    .forEach((control) => { control.dataset.summaryEmpty = String(control.disabled); });
  onFiltersRendered();
}

