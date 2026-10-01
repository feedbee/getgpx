// The versioned HTTP surface. Keep OpenAPI and the approved baseline in sync.
export const trackRoutes = Object.freeze([
  ['post', '/tracks', 'upload'],
  ['get', '/tracks/mine', 'mine'],
  ['get', '/tracks/saved', 'saved'],
  ['post', '/tracks/saved/deletions', 'unsaveMany'],
  ['post', '/tracks/deletions', 'removeMany'],
  ['get', '/tracks/:id/status', 'status'],
  ['get', '/tracks/:id/saved', 'savedState'],
  ['put', '/tracks/:id/saved', 'save'],
  ['delete', '/tracks/:id/saved', 'unsave'],
  ['patch', '/tracks/:id', 'update'],
  ['put', '/tracks/:id/gpx', 'replace'],
  ['post', '/tracks/:id/retry-analysis', 'retry'],
  ['delete', '/tracks/:id', 'remove'],
  ['get', '/tracks/:id/gpx', 'gpx'],
  ['get', '/tracks/:id/analysis', 'analysis'],
  ['get', '/tracks/:id', 'publicTrack'],
]);
