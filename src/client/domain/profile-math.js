export function pointerRatioInPlot(clientX, containerLeft, containerWidth) {
  return Math.max(0, Math.min(1, (clientX - containerLeft) / containerWidth));
}

export function areaPathFromCoordinates(coordinates, baselineY) {
  if (coordinates.length < 2) return '';
  const line = coordinates.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  return `${line} L${coordinates.at(-1).x.toFixed(1)},${baselineY} L${coordinates[0].x.toFixed(1)},${baselineY} Z`;
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

export function nearestRoutePointIndex(points, target) {
  if (!points.length || !Number.isFinite(target?.lat) || !Number.isFinite(target?.lon)) return -1;
  let bestIndex = -1;
  let bestDistance = Infinity;
  points.forEach((point, index) => {
    const distance = (point.lat - target.lat) ** 2 + (point.lon - target.lon) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
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
