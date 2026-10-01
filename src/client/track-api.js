const jsonHeaders = { accept: 'application/json' };

export async function readPublicTrackMetadata(trackApi, trackId) {
  try {
    const response = await trackApi.publicTrack(trackId);
    if (!response.ok) return { kind: response.status === 404 ? 'not-found' : 'unavailable' };
    const { data } = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { kind: 'unavailable' };
    return { kind: 'ready', data };
  } catch {
    return { kind: 'unavailable' };
  }
}

export function createTrackApi(fetchImplementation = fetch) {
  const trackUrl = (id, suffix = '') => `/api/v1/tracks/${id}${suffix}`;
  return {
    savedState: (id) => fetchImplementation(trackUrl(id, '/saved'), { headers: jsonHeaders }),
    status: (id) => fetchImplementation(trackUrl(id, '/status'), { headers: jsonHeaders }),
    publicTrack: (id) => fetchImplementation(trackUrl(id), { headers: jsonHeaders }),
    analysis: (url) => fetchImplementation(url, { headers: jsonHeaders }),
    homepage: () => fetchImplementation('/homepage', { headers: jsonHeaders }),
    list: ({ saved, parameters }) => fetchImplementation(`/api/v1/tracks/${saved ? 'saved' : 'mine'}?${parameters}`, { headers: jsonHeaders }),
    upload: ({ file, routeType }) => fetchImplementation('/api/v1/tracks', {
      method: 'POST',
      headers: { ...jsonHeaders, 'content-type': 'application/gpx+xml',
        'x-gpx-filename': encodeURIComponent(file.name), 'x-track-type': routeType },
      body: file,
    }),
    replace: ({ id, file }) => fetchImplementation(trackUrl(id, '/gpx'), {
      method: 'PUT',
      headers: { ...jsonHeaders, 'content-type': 'application/gpx+xml', 'x-gpx-filename': encodeURIComponent(file.name) },
      body: file,
    }),
    update: ({ id, details }) => fetchImplementation(trackUrl(id), {
      method: 'PATCH', headers: { ...jsonHeaders, 'content-type': 'application/json' }, body: JSON.stringify(details),
    }),
    retry: (id) => fetchImplementation(trackUrl(id, '/retry-analysis'), { method: 'POST', headers: jsonHeaders }),
    remove: ({ id, ids, saved }) => fetchImplementation(saved ? '/api/v1/tracks/saved/deletions' : ids ? '/api/v1/tracks/deletions' : trackUrl(id), {
      method: ids || saved ? 'POST' : 'DELETE',
      headers: ids || saved ? { ...jsonHeaders, 'content-type': 'application/json' } : jsonHeaders,
      body: ids || saved ? JSON.stringify({ ids }) : undefined,
    }),
    setSaved: ({ id, saved }) => fetchImplementation(trackUrl(id, '/saved'), {
      method: saved ? 'PUT' : 'DELETE', headers: jsonHeaders,
    }),
  };
}
