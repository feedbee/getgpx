const DEFAULTS = {
  minLengthM: 500,
  minAverageGrade: 3,
  minScore: 1500,
  smoothingRadiusM: 60,
  splitDescentM: 25,
};

function smoothElevations(points, radiusM) {
  if (!radiusM) return points.map((point) => point.ele);
  return points.map((point, index) => {
    let sum = 0;
    let count = 0;
    for (let cursor = index; cursor >= 0; cursor -= 1) {
      if ((point.distanceKm - points[cursor].distanceKm) * 1000 > radiusM) break;
      if (Number.isFinite(points[cursor].ele)) { sum += points[cursor].ele; count += 1; }
    }
    for (let cursor = index + 1; cursor < points.length; cursor += 1) {
      if ((points[cursor].distanceKm - point.distanceKm) * 1000 > radiusM) break;
      if (Number.isFinite(points[cursor].ele)) { sum += points[cursor].ele; count += 1; }
    }
    return count ? sum / count : point.ele;
  });
}

export function classifyClimb(score) {
  if (score >= 64_000) return { label: 'HC', color: '#8e2632' };
  if (score >= 48_000) return { label: 'Кат. 1', color: '#c83f3f' };
  if (score >= 32_000) return { label: 'Кат. 2', color: '#e57732' };
  if (score >= 16_000) return { label: 'Кат. 3', color: '#e9ad2f' };
  if (score >= 8_000) return { label: 'Кат. 4', color: '#91aa39' };
  return { label: 'Без категории', color: '#87a834' };
}

function buildClimb(points, smoothed, startIndex, endIndex, options) {
  const lengthM = Math.round((points[endIndex].distanceKm - points[startIndex].distanceKm) * 1000);
  if (lengthM <= 0) return null;
  const netGainM = smoothed[endIndex] - smoothed[startIndex];
  const averageGrade = (netGainM / lengthM) * 100;
  const score = Math.round(lengthM * averageGrade);
  if (lengthM < options.minLengthM || averageGrade < options.minAverageGrade || score < options.minScore) return null;

  let gainM = 0;
  for (let index = startIndex + 1; index <= endIndex; index += 1) {
    gainM += Math.max(0, points[index].ele - points[index - 1].ele);
  }
  return {
    startIndex,
    endIndex,
    startKm: points[startIndex].distanceKm,
    endKm: points[endIndex].distanceKm,
    lengthM,
    gainM: Math.round(gainM),
    averageGrade,
    score,
    ...classifyClimb(score),
  };
}

export function detectClimbs(points, overrides = {}) {
  const options = { ...DEFAULTS, ...overrides };
  if (points.length < 2 || points.some((point) => !Number.isFinite(point.ele))) return [];
  const smoothed = smoothElevations(points, options.smoothingRadiusM);
  const climbs = [];
  let startIndex = 0;
  let peakIndex = 0;

  const finishCandidate = () => {
    const climb = buildClimb(points, smoothed, startIndex, peakIndex, options);
    if (climb) climbs.push(climb);
  };

  for (let index = 1; index < points.length; index += 1) {
    if (smoothed[index] < smoothed[startIndex]) {
      startIndex = index;
      peakIndex = index;
    } else if (smoothed[index] > smoothed[peakIndex]) {
      peakIndex = index;
    }

    if (smoothed[peakIndex] - smoothed[index] >= options.splitDescentM) {
      finishCandidate();
      startIndex = index;
      peakIndex = index;
    }
  }
  finishCandidate();
  return climbs;
}

export function detectDescents(points, overrides = {}) {
  const inverted = points.map((point) => ({ ...point, ele: Number.isFinite(point.ele) ? -point.ele : point.ele }));
  return detectClimbs(inverted, overrides).map((descent) => ({
    ...descent,
    dropM: descent.gainM,
  }));
}
