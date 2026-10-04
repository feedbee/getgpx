import { pointIndexAtRatio, pointerRatioInPlot } from './domain/profile-math.js';

export function bindProfileInteractions({ getTrack, getViewRange, getPoiSelection, getActivePointIndex,
  onHoverPoi, onLeavePoi, onTogglePoi, onOpenPoint = () => {}, getPointMenuOpen = () => false, onActivePoint, onPointContext, onViewRange, documentRef = document }) {
  const profile = documentRef.querySelector('#profile-wrap');
  let selectionStart = null;
  profile.addEventListener('pointermove', (event) => {
    if (getPointMenuOpen() || !getTrack()) return;
    const poiMarker = event.target.closest('[data-profile-poi-index]');
    if (poiMarker) {
      onHoverPoi(Number(poiMarker.dataset.profilePoiIndex));
      return;
    }
    if (getPoiSelection().hoveredIndex !== null && getPoiSelection().pinnedIndex === null) onLeavePoi();
    if (getPoiSelection().pinnedIndex !== null) return;
    const rect = profile.getBoundingClientRect();
    const ratio = pointerRatioInPlot(event.clientX, rect.left, rect.width);
    const index = pointIndexAtRatio(getTrack().points, getViewRange()[0], getViewRange()[1], ratio);
    if (selectionStart) {
      const startX = Math.max(0, Math.min(1200, selectionStart.x));
      const currentX = ratio * 1200;
      const selection = documentRef.querySelector('#profile-selection');
      selection.setAttribute('x', Math.min(startX, currentX));
      selection.setAttribute('width', Math.abs(currentX - startX));
      selection.classList.add('visible');
    } else {
      onActivePoint(index, { showContext: true });
    }
  });
  profile.addEventListener('pointerleave', () => {
    onLeavePoi();
    if (!getPointMenuOpen() && !selectionStart && getPoiSelection().pinnedIndex === null) onPointContext(null);
  });
  profile.addEventListener('click', (event) => {
    const marker = event.target.closest('[data-profile-poi-index]');
    if (marker) onTogglePoi(Number(marker.dataset.profilePoiIndex));
    if (event.target.closest('#profile-dot')) openActivePoint();
  });
  profile.addEventListener('pointerdown', (event) => {
    if (!getTrack() || getPointMenuOpen() || event.target.closest('#profile-dot') || event.target.closest('[data-profile-poi-index]')) return;
    if (getPoiSelection().pinnedIndex !== null) return;
    if (event.button !== 0) return;
    const rect = profile.getBoundingClientRect();
    const ratio = pointerRatioInPlot(event.clientX, rect.left, rect.width);
    selectionStart = { ratio, x: ratio * 1200, pointerId: event.pointerId };
    profile.setPointerCapture?.(event.pointerId);
  });
  profile.addEventListener('pointerup', (event) => {
    if (!selectionStart) return;
    const rect = profile.getBoundingClientRect();
    const endRatio = pointerRatioInPlot(event.clientX, rect.left, rect.width);
    const startRatio = selectionStart.ratio;
    selectionStart = null;
    documentRef.querySelector('#profile-selection').classList.remove('visible');
    if (Math.abs(endRatio - startRatio) < 0.025) {
      onActivePoint(pointIndexAtRatio(getTrack().points, getViewRange()[0], getViewRange()[1], endRatio));
      return;
    }
    const from = pointIndexAtRatio(getTrack().points, getViewRange()[0], getViewRange()[1], Math.min(startRatio, endRatio));
    const to = pointIndexAtRatio(getTrack().points, getViewRange()[0], getViewRange()[1], Math.max(startRatio, endRatio));
    onViewRange([from, to]);
  });
  function openActivePoint() {
    onOpenPoint(getActivePointIndex(), { trigger: documentRef.querySelector('#profile-dot'), focusTarget: profile });
  }
  profile.addEventListener('pointercancel', () => {
    selectionStart = null;
    documentRef.querySelector('#profile-selection').classList.remove('visible');
  });
  profile.addEventListener('keydown', (event) => {
    if (!getTrack()) return;
    if (['Enter', ' '].includes(event.key)) { event.preventDefault(); openActivePoint(); return; }
    if (getPointMenuOpen()) return;
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    if (getPoiSelection().pinnedIndex !== null) return;
    event.preventDefault();
    onActivePoint(getActivePointIndex() + (event.key === 'ArrowRight' ? 1 : -1));
  });
}
