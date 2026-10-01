import { classifyClimb } from './domain/climbs.js';
import { surfaceCategories, roadQualityCategories } from './domain/surface.js';

export function terrainForView(items = [], points = [], descent = false) {
  const indexAt = (km) => {
    let index = 0;
    while (index + 1 < points.length && points[index].distanceKm < km) index++;
    return index;
  };
  return items.map((item) => ({ ...item, ...classifyClimb(item.score),
    averageGrade: item.averageGradePercent,
    [descent ? 'dropM' : 'gainM']: item.elevationChangeM,
    startIndex: indexAt(item.startKm), endIndex: indexAt(item.endKm),
  }));
}

// Convert transport data into the website's drawing model at the UI boundary.
export function analysisForView(data, metadata) {
  const points = data.points.map((point) => ({ ...point, ele: point.elevationM, grade: point.gradePercent,
    ...(point.surface ? { surface: { ...point.surface,
      ...surfaceCategories.find((item) => item.id === point.surface.id),
      quality: roadQualityCategories.find((item) => item.id === point.surface.quality)
        || roadQualityCategories.find((item) => item.id === 'unknown'),
    } } : {}),
  }));
  const metrics = metadata?.metrics || data.metrics;
  return { ...metrics, name: metadata?.title || data.sourceName || '', nameGenerated: !metadata?.title,
    effectiveSpeedKmh: metrics.speedKmh, points, pointsOfInterest: data.pointsOfInterest,
    climbs: terrainForView(data.climbs, points), descents: terrainForView(data.descents, points, true),
  };
}
