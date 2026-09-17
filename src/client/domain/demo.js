export function createDemoTrack() {
  const anchors = [
    [49.2704, 19.9816, 1008], [49.2637, 19.9810, 1125], [49.2575, 19.9744, 1260],
    [49.2510, 19.9650, 1415], [49.2452, 19.9584, 1542], [49.2386, 19.9485, 1665],
    [49.2329, 19.9382, 1760], [49.2253, 19.9310, 1882], [49.2181, 19.9271, 2005],
    [49.2105, 19.9252, 2112], [49.2037, 19.9235, 1988], [49.1971, 19.9217, 1874],
  ];
  const points = [];
  anchors.slice(0, -1).forEach((start, anchorIndex) => {
    const end = anchors[anchorIndex + 1];
    for (let step = 0; step < 12; step += 1) {
      const ratio = step / 12;
      points.push({
        lat: start[0] + (end[0] - start[0]) * ratio + Math.sin(step * 1.7) * 0.00012,
        lon: start[1] + (end[1] - start[1]) * ratio + Math.cos(step * 1.2) * 0.00018,
        ele: start[2] + (end[2] - start[2]) * ratio + Math.sin(step * 1.5) * 7,
        time: new Date(Date.UTC(2026, 8, 13, 5, anchorIndex * 10 + step)),
        surfaceTags: anchorIndex < 3 ? { surface: 'asphalt', highway: 'service' }
          : anchorIndex < 6 ? { surface: 'compacted', highway: 'track', tracktype: 'grade1' }
            : anchorIndex < 9 ? { surface: 'gravel', highway: 'path' }
              : { surface: 'ground', highway: 'path', smoothness: 'bad' },
      });
    }
  });
  points.push({ lat: anchors.at(-1)[0], lon: anchors.at(-1)[1], ele: anchors.at(-1)[2], time: new Date('2026-09-13T06:55:00Z'), surfaceTags: { surface: 'ground', highway: 'path' } });
  return { name: 'Orla Perć · Zawrat — Krzyżne', points };
}
