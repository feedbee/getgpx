export const PLOT_INSET_RATIO = 0.025;

export function pointerRatioInPlot(clientX, containerLeft, containerWidth) {
  const plotLeft = containerLeft + containerWidth * PLOT_INSET_RATIO;
  const plotWidth = containerWidth * (1 - PLOT_INSET_RATIO * 2);
  return Math.max(0, Math.min(1, (clientX - plotLeft) / plotWidth));
}

export function pointIndexAtRatio(points, startIndex, endIndex, ratio) {
  if (ratio <= 0) return startIndex;
  if (ratio >= 1) return endIndex;
  const startKm = points[startIndex].distanceKm;
  const targetKm = startKm + (points[endIndex].distanceKm - startKm) * ratio;
  let low = startIndex;
  let high = endIndex;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].distanceKm < targetKm) low = middle + 1;
    else high = middle;
  }
  if (low === startIndex) return low;
  return targetKm - points[low - 1].distanceKm <= points[low].distanceKm - targetKm ? low - 1 : low;
}

export function elevationGainLoss(points, startIndex = 0, endIndex = points.length - 1) {
  let ascentM = 0;
  let descentM = 0;
  for (let index = Math.max(1, startIndex + 1); index <= Math.min(endIndex, points.length - 1); index += 1) {
    const previousElevation = points[index - 1]?.ele;
    const elevation = points[index]?.ele;
    if (!Number.isFinite(previousElevation) || !Number.isFinite(elevation)) continue;
    const delta = elevation - previousElevation;
    if (delta > 0) ascentM += delta;
    else descentM += Math.abs(delta);
  }
  return { ascentM: Math.round(ascentM), descentM: Math.round(descentM) };
}
