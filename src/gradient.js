export function gradientColor(grade) {
  if (grade < 0) return '#4f8f9d';
  if (grade < 3) return '#84a83f';
  if (grade < 6) return '#d6b737';
  if (grade < 9) return '#e47d32';
  if (grade < 12) return '#d64b3c';
  return '#8f2938';
}

export function calculateSegmentGrades(points, windowM = 100) {
  if (points.length < 2) return points.map(() => 0);
  return points.map((point, index) => {
    let before = index;
    let after = index;
    while (before > 0 && (point.distanceKm - points[before].distanceKm) * 1000 < windowM) before -= 1;
    while (after < points.length - 1 && (points[after].distanceKm - point.distanceKm) * 1000 < windowM) after += 1;
    if (before === after) return 0;
    const distanceM = (points[after].distanceKm - points[before].distanceKm) * 1000;
    return distanceM > 0 ? Number((((points[after].ele - points[before].ele) / distanceM) * 100).toFixed(2)) : 0;
  });
}

export function groupGradientRuns(points) {
  if (!points.length) return [];
  if (points.length === 1) return [{ startIndex: 0, endIndex: 0, color: gradientColor(points[0].grade ?? 0) }];
  const runs = [];
  let startIndex = 0;
  let color = gradientColor(points[1].grade ?? 0);
  for (let index = 2; index < points.length; index += 1) {
    const nextColor = gradientColor(points[index].grade ?? 0);
    if (nextColor !== color) {
      runs.push({ startIndex, endIndex: index - 1, color });
      startIndex = index - 1;
      color = nextColor;
    }
  }
  runs.push({ startIndex, endIndex: points.length - 1, color });
  return runs;
}
