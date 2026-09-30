import { t, bindText, formatMeasurement } from './i18n.js';
import { poiName, poiType } from './analysis-presentation.js';
import { emptyPoiSelection, updatePoiSelection } from './domain/poi-selection.js';

export function createPoiController({ getTrack, getActivePointIndex, onActivePoint, onMapSelection, documentRef = document }) {
  let selection = { ...emptyPoiSelection };

  function selectedPoiIndex() {
    return selection.pinnedIndex ?? selection.hoveredIndex;
  }

  function renderPoiSelection() {
    const index = selectedPoiIndex();
    documentRef.querySelectorAll('[data-poi-index]').forEach((row) => {
      row.classList.toggle('is-active', Number(row.dataset.poiIndex) === index);
      row.setAttribute('aria-pressed', String(Number(row.dataset.poiIndex) === selection.pinnedIndex));
    });
    documentRef.querySelectorAll('[data-profile-poi-index]').forEach((marker) => {
      marker.classList.toggle('is-active', Number(marker.dataset.profilePoiIndex) === index);
    });
    onMapSelection(index);
  }

  function applyPoiSelection(nextSelection, { restorePointIndex = null } = {}) {
    selection = nextSelection;
    renderPoiSelection();
    const index = selectedPoiIndex();
    const routePointIndex = getTrack()?.pointsOfInterest?.[index]?.routePointIndex;
    if (Number.isInteger(routePointIndex) && routePointIndex >= 0) {
      onActivePoint(routePointIndex, { showContext: true });
    } else if (Number.isInteger(restorePointIndex)) {
      onActivePoint(restorePointIndex);
    }
  }

  function hover(index) {
    applyPoiSelection(updatePoiSelection(selection, {
      type: 'hover', index, currentPointIndex: getActivePointIndex(),
    }));
  }

  function leave() {
    const restorePointIndex = selection.returnPointIndex;
    applyPoiSelection(updatePoiSelection(selection, { type: 'leave' }), { restorePointIndex });
  }

  function toggle(index) {
    const restorePointIndex = selection.returnPointIndex;
    applyPoiSelection(updatePoiSelection(selection, {
      type: 'toggle', index, currentPointIndex: getActivePointIndex(),
    }), { restorePointIndex });
  }

  function renderPointsOfInterest(pointsOfInterest = []) {
    const section = documentRef.querySelector('#points-of-interest');
    const navLink = documentRef.querySelector('#poi-nav-link');
    const list = documentRef.querySelector('#poi-list');
    section.hidden = pointsOfInterest.length === 0;
    navLink.hidden = pointsOfInterest.length === 0;
    list.replaceChildren();
    if (!pointsOfInterest.length) return;

    bindText(documentRef.querySelector('#poi-count'), () => t('poi.count', { count: pointsOfInterest.length }));
    pointsOfInterest.forEach((point, index) => {
      const row = documentRef.createElement('button');
      row.type = 'button';
      row.className = 'poi-row';
      row.dataset.poiIndex = String(index);
      row.disabled = !getTrack();
      row.setAttribute('aria-pressed', 'false');
      const number = documentRef.createElement('b');
      bindText(number, () => String(index + 1));
      const copy = documentRef.createElement('span');
      const name = documentRef.createElement('strong');
      bindText(name, () => poiName(point, index));
      copy.append(name);
      const detail = poiType(point);
      if (detail) {
        const meta = documentRef.createElement('small');
        bindText(meta, () => poiType(point));
        copy.append(meta);
      }
      if (Number.isFinite(point.distanceKm)) {
        const distance = documentRef.createElement('small');
        bindText(distance, () => formatMeasurement('distance', point.distanceKm));
        copy.append(distance);
      }
      row.append(number, copy);
      list.append(row);
    });
  }

  const poiSection = documentRef.querySelector('.poi-section');
  poiSection.addEventListener('pointerover', (event) => {
    const row = event.target.closest('[data-poi-index]');
    if (row) hover(Number(row.dataset.poiIndex));
  });
  poiSection.addEventListener('pointerout', (event) => {
    const row = event.target.closest('[data-poi-index]');
    if (row && !row.contains(event.relatedTarget)) leave();
  });
  poiSection.addEventListener('focusin', (event) => {
    const row = event.target.closest('[data-poi-index]');
    if (row) hover(Number(row.dataset.poiIndex));
  });
  poiSection.addEventListener('focusout', (event) => {
    if (!event.relatedTarget?.closest?.('[data-poi-index]')) leave();
  });
  poiSection.addEventListener('click', (event) => {
    const row = event.target.closest('[data-poi-index]');
    if (row) toggle(Number(row.dataset.poiIndex));
  });

  return { get selection() { return selection; }, renderPointsOfInterest, hover, leave, toggle,
    reset() { selection = { ...emptyPoiSelection }; } };
}
