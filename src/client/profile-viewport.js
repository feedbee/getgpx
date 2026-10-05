export function createProfileViewport({ getTrack, onResetMetrics, onDrawProfile, onClearRangeFocus,
  onFitFullRange, onFitRange, onActivePoint, onRangeChange = () => {}, documentRef = document }) {
  let range = [0, 1];
  let zoomHistory = [];

  function setRange(nextRange, { remember = true } = {}) {
    const normalized = [Math.min(...nextRange), Math.max(...nextRange)];
    if (normalized[1] - normalized[0] < 2) return;
    if (remember) zoomHistory.push([...range]);
    range = normalized;
    onResetMetrics();
    onRangeChange(getTrack(), [...range]);
    onDrawProfile(getTrack());
    const isFullRange = range[0] === 0 && range[1] === getTrack().points.length - 1;
    if (isFullRange) {
      onClearRangeFocus();
      onFitFullRange();
    } else onFitRange(getTrack(), range);
    documentRef.querySelector('#zoom-back').disabled = zoomHistory.length === 0;
    documentRef.querySelector('#zoom-reset').disabled = isFullRange;
    onActivePoint(range[0]);
  }

  documentRef.querySelector('#zoom-back').addEventListener('click', () => {
    const previous = zoomHistory.pop();
    if (previous) setRange(previous, { remember: false });
  });
  documentRef.querySelector('#zoom-reset').addEventListener('click', () => {
    zoomHistory = [];
    setRange([0, getTrack().points.length - 1], { remember: false });
  });
  function reset(track) {
    range = [0, track.points.length - 1];
    zoomHistory = [];
    onResetMetrics();
    documentRef.querySelector('#zoom-back').disabled = true;
    documentRef.querySelector('#zoom-reset').disabled = true;
    onRangeChange(track, [...range]);
  }

  return { get range() { return range; }, setRange, reset };
}
