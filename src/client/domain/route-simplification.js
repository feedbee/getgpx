// Work in one local planar scale so latitude and longitude do not distort turns.
function project(points) {
  const cosine = Math.max(0.01, Math.cos(points.reduce((sum, point) => sum + point.lat, 0) / points.length * Math.PI / 180));
  let longitude = points[0].lon;
  return points.map((point, index) => {
    if (index) {
      let difference = point.lon - points[index - 1].lon;
      if (difference > 180) difference -= 360;
      if (difference < -180) difference += 360;
      longitude += difference;
    }
    return { x: longitude * cosine, y: point.lat };
  });
}

function distanceSquared(point, first, last) {
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return (point.x - first.x) ** 2 + (point.y - first.y) ** 2;
  const fraction = Math.max(0, Math.min(1, ((point.x - first.x) * dx + (point.y - first.y) * dy) / lengthSquared));
  return (point.x - first.x - fraction * dx) ** 2 + (point.y - first.y - fraction * dy) ** 2;
}

function selectedIndexes(projected, toleranceSquared) {
  const keep = new Uint8Array(projected.length);
  keep[0] = 1;
  keep[keep.length - 1] = 1;
  const stack = [[0, projected.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maximum = toleranceSquared;
    let selected = -1;
    for (let index = first + 1; index < last; index += 1) {
      const distance = distanceSquared(projected[index], projected[first], projected[last]);
      if (distance > maximum) {
        maximum = distance;
        selected = index;
      }
    }
    if (selected !== -1) {
      keep[selected] = 1;
      stack.push([first, selected], [selected, last]);
    }
  }
  const result = [];
  for (let index = 0; index < keep.length; index += 1) if (keep[index]) result.push(index);
  return result;
}

export function simplifyRoute(points, maxPoints) {
  if (points.length <= maxPoints || points.length < 3) return points;
  if (!Number.isSafeInteger(maxPoints) || maxPoints < 2) throw new RangeError('Invalid route point budget.');
  const projected = project(points);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { x, y } of projected) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  let lower = 0;
  let upper = Math.hypot(maxX - minX, maxY - minY);
  let best = [0, points.length - 1];
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const tolerance = (lower + upper) / 2;
    const indexes = selectedIndexes(projected, tolerance * tolerance);
    if (indexes.length > maxPoints) lower = tolerance;
    else { upper = tolerance; best = indexes; }
  }
  return best.map((index) => points[index]);
}

export function createRoutePreview(points, maxPoints = 200) {
  if (!points.length) return null;
  const selected = simplifyRoute(points, maxPoints);
  const all = project(points);
  const positions = new Map(points.map((point, index) => [point, all[index]]));
  const projected = selected.map((point) => positions.get(point));
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const { x, y } of all) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const span = Math.max(maxX - minX, maxY - minY, Number.EPSILON);
  const width = (maxX - minX) / span * 90;
  const height = (maxY - minY) / span * 90;
  return {
    viewBox: '0 0 100 100',
    points: projected.map(({ x, y }) => [
      Number((5 + (90 - width) / 2 + (x - minX) / span * 90).toFixed(2)),
      Number((95 - (90 - height) / 2 - (y - minY) / span * 90).toFixed(2)),
    ]),
  };
}
