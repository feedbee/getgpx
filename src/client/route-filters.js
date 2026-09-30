import { surfaceEmphasis } from './domain/surface.js';

export function createRouteFilters({ getTrack, onChange, documentRef = document }) {
  let hoveredSurfaceId = null;
  let pinnedSurfaceId = null;
  let hoveredWayTypeId = null;
  let pinnedWayTypeId = null;
  let hoveredQualityId = null;
  let pinnedQualityId = null;
  let hoveredRange = null;
  let pinnedRange = null;

  function selectedSurfaceId() {
    return pinnedSurfaceId || hoveredSurfaceId;
  }

  function selectedWayTypeId() {
    return pinnedWayTypeId || hoveredWayTypeId;
  }

  function selectedQualityId() {
    return pinnedQualityId || hoveredQualityId;
  }

  function selectedTerrainRange() {
    return pinnedRange || hoveredRange;
  }

  function selectedRouteFilter() {
    if (selectedQualityId()) return { kind: 'quality', id: selectedQualityId() };
    if (selectedWayTypeId()) return { kind: 'waytype', id: selectedWayTypeId() };
    if (selectedSurfaceId()) return { kind: 'surface', id: selectedSurfaceId() };
    return null;
  }

  function renderControls() {
    const focusedSurface = selectedSurfaceId();
    documentRef.querySelectorAll('[data-surface-filter]').forEach((control) => {
      const emphasis = surfaceEmphasis(control.dataset.surfaceFilter, focusedSurface);
      control.classList.toggle('is-active', emphasis.highlighted);
      control.classList.remove('is-dimmed');
      control.setAttribute('aria-pressed', String(pinnedSurfaceId === control.dataset.surfaceFilter));
    });
    const focusedWayType = selectedWayTypeId();
    documentRef.querySelectorAll('[data-waytype-filter]').forEach((control) => {
      const emphasis = surfaceEmphasis(control.dataset.waytypeFilter, focusedWayType);
      control.classList.toggle('is-active', emphasis.highlighted);
      control.classList.remove('is-dimmed');
      control.setAttribute('aria-pressed', String(pinnedWayTypeId === control.dataset.waytypeFilter));
    });
    const focusedQuality = selectedQualityId();
    documentRef.querySelectorAll('[data-quality-filter]').forEach((control) => {
      const emphasis = surfaceEmphasis(control.dataset.qualityFilter, focusedQuality);
      control.classList.toggle('is-active', emphasis.highlighted);
      control.classList.remove('is-dimmed');
      control.setAttribute('aria-pressed', String(pinnedQualityId === control.dataset.qualityFilter));
    });
    documentRef.querySelectorAll('[data-terrain-range]').forEach((control) => {
      const range = control.dataset.terrainRange;
      control.classList.toggle('is-active', Boolean(selectedTerrainRange() && range === selectedTerrainRange().key));
      control.setAttribute('aria-pressed', String(Boolean(pinnedRange && range === pinnedRange.key)));
    });
    documentRef.querySelector('.surface-section').classList.toggle('has-pinned-surface', Boolean(pinnedSurfaceId || pinnedWayTypeId || pinnedQualityId));
  }

  function reset() {
    hoveredSurfaceId = null;
    pinnedSurfaceId = null;
    hoveredWayTypeId = null;
    pinnedWayTypeId = null;
    hoveredQualityId = null;
    pinnedQualityId = null;
    hoveredRange = null;
    pinnedRange = null;
  }

  const surfaceSection = documentRef.querySelector('.surface-section');
  surfaceSection.addEventListener('pointerover', (event) => {
    const control = event.target.closest('[data-surface-filter]:not(:disabled),[data-waytype-filter]:not(:disabled),[data-quality-filter]:not(:disabled)');
    if (!control || pinnedSurfaceId || pinnedWayTypeId || pinnedQualityId || pinnedRange) return;
    hoveredSurfaceId = control.dataset.surfaceFilter || null;
    hoveredWayTypeId = control.dataset.waytypeFilter || null;
    hoveredQualityId = control.dataset.qualityFilter || null;
    onChange();
  });
  surfaceSection.addEventListener('pointerout', (event) => {
    if (pinnedSurfaceId || pinnedWayTypeId || pinnedQualityId) return;
    const from = event.target.closest('[data-surface-filter]:not(:disabled),[data-waytype-filter]:not(:disabled),[data-quality-filter]:not(:disabled)');
    const to = event.relatedTarget?.closest?.('[data-surface-filter]:not(:disabled),[data-waytype-filter]:not(:disabled),[data-quality-filter]:not(:disabled)');
    if (!from || from === to) return;
    hoveredSurfaceId = null;
    hoveredWayTypeId = null;
    hoveredQualityId = null;
    onChange();
  });
  surfaceSection.addEventListener('pointerleave', () => {
    if (pinnedSurfaceId || pinnedWayTypeId || pinnedQualityId || (!hoveredSurfaceId && !hoveredWayTypeId && !hoveredQualityId)) return;
    hoveredSurfaceId = null;
    hoveredWayTypeId = null;
    hoveredQualityId = null;
    onChange();
  });
  surfaceSection.addEventListener('focusin', (event) => {
    const control = event.target.closest('[data-surface-filter]:not(:disabled),[data-waytype-filter]:not(:disabled),[data-quality-filter]:not(:disabled)');
    if (!control || pinnedSurfaceId || pinnedWayTypeId || pinnedQualityId) return;
    hoveredSurfaceId = control.dataset.surfaceFilter || null;
    hoveredWayTypeId = control.dataset.waytypeFilter || null;
    hoveredQualityId = control.dataset.qualityFilter || null;
    onChange();
  });
  surfaceSection.addEventListener('focusout', (event) => {
    if (pinnedSurfaceId || pinnedWayTypeId || pinnedQualityId || event.relatedTarget?.closest?.('[data-surface-filter],[data-waytype-filter],[data-quality-filter]')) return;
    hoveredSurfaceId = null;
    hoveredWayTypeId = null;
    hoveredQualityId = null;
    onChange();
  });
  surfaceSection.addEventListener('click', (event) => {
    const control = event.target.closest('[data-surface-filter]:not(:disabled),[data-waytype-filter]:not(:disabled),[data-quality-filter]:not(:disabled)');
    if (!control) return;
    const nextSurface = control.dataset.surfaceFilter || null;
    const nextWayType = control.dataset.waytypeFilter || null;
    const nextQuality = control.dataset.qualityFilter || null;
    const isSame = pinnedSurfaceId === nextSurface && pinnedWayTypeId === nextWayType && pinnedQualityId === nextQuality;
    pinnedSurfaceId = isSame ? null : nextSurface;
    pinnedWayTypeId = isSame ? null : nextWayType;
    pinnedQualityId = isSame ? null : nextQuality;
    pinnedRange = null;
    hoveredSurfaceId = null;
    hoveredWayTypeId = null;
    hoveredQualityId = null;
    onChange();
  });
  const terrainSection = documentRef.querySelector('.climbs-section');
  function terrainItem(control) {
    const items = control.dataset.terrainType === 'climb' ? getTrack().climbs : getTrack().descents;
    const item = items[Number(control.dataset.terrainIndex)];
    return item ? { ...item, key: control.dataset.terrainRange } : null;
  }
  terrainSection.addEventListener('pointerover', (event) => {
    const control = event.target.closest('[data-terrain-range]');
    if (!control || pinnedRange || pinnedSurfaceId || pinnedWayTypeId || pinnedQualityId) return;
    hoveredRange = terrainItem(control);
    onChange();
  });
  terrainSection.addEventListener('pointerout', (event) => {
    const control = event.target.closest('[data-terrain-range]');
    if (!control || pinnedRange || event.relatedTarget?.closest?.('[data-terrain-range]') === control) return;
    hoveredRange = null;
    onChange();
  });
  terrainSection.addEventListener('focusin', (event) => {
    const control = event.target.closest('[data-terrain-range]');
    if (!control || pinnedRange || pinnedSurfaceId || pinnedWayTypeId || pinnedQualityId) return;
    hoveredRange = terrainItem(control);
    onChange();
  });
  terrainSection.addEventListener('focusout', (event) => {
    if (pinnedRange || event.relatedTarget?.closest?.('[data-terrain-range]')) return;
    hoveredRange = null;
    onChange();
  });
  terrainSection.addEventListener('click', (event) => {
    const control = event.target.closest('[data-terrain-range]');
    if (!control) return;
    const nextRange = terrainItem(control);
    pinnedRange = pinnedRange?.key === nextRange?.key ? null : nextRange;
    hoveredRange = null;
    pinnedSurfaceId = null;
    pinnedWayTypeId = null;
    pinnedQualityId = null;
    onChange();
  });
  documentRef.querySelectorAll('[data-terrain-tab]').forEach((button) => button.addEventListener('click', () => {
    documentRef.querySelectorAll('[data-terrain-tab]').forEach((item) => item.classList.toggle('active', item === button));
    documentRef.querySelector('#climbs-list').hidden = button.dataset.terrainTab !== 'climbs';
    documentRef.querySelector('#descents-list').hidden = button.dataset.terrainTab !== 'descents';
  }));

  documentRef.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || (!pinnedSurfaceId && !pinnedWayTypeId && !pinnedQualityId && !pinnedRange)) return;
    reset();
    if (documentRef.activeElement instanceof HTMLElement) documentRef.activeElement.blur();
    onChange();
  });

  return { selectedRouteFilter, selectedTerrainRange, renderControls, reset };
}
