const MAX_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const PNG_END = Buffer.from('49454e44ae426082', 'hex');

function encodedRoute(points) {
  if (!Array.isArray(points) || points.length < 2 || points.some(({ lat, lon }) =>
    !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85.0511 || Math.abs(lon) > 180)) {
    throw new Error('Invalid preview coordinates.');
  }
  let previousLat = 0;
  let previousLon = 0;
  let result = '';
  const encode = (delta) => {
    let value = delta < 0 ? ~(delta << 1) : delta << 1;
    let text = '';
    while (value >= 32) { text += String.fromCharCode((32 | (value & 31)) + 63); value >>>= 5; }
    return text + String.fromCharCode(value + 63);
  };
  for (const { lat, lon } of points) {
    const latitude = Math.round(lat * 1e5);
    const longitude = Math.round(lon * 1e5);
    result += encode(latitude - previousLat) + encode(longitude - previousLon);
    previousLat = latitude;
    previousLon = longitude;
  }
  return encodeURIComponent(result).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16)}`);
}

export function createMapboxPreviewProvider({ token, style, version, fetch = globalThis.fetch }) {
  return {
    provider: 'mapbox',
    style,
    rendererVersion: 3,
    version,
    attribution: [
      { label: '© Mapbox', url: 'https://www.mapbox.com/about/maps/' },
      { label: '© OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' },
    ],
    async render(points) {
      const path = encodedRoute(points);
      const url = new URL(`https://api.mapbox.com/styles/v1/${style}/static/path-15+ffffff-1(${path}),path-6+1769d2-1(${path})/auto/256x256@2x`);
      url.search = new URLSearchParams({ access_token: token, padding: '28', attribution: 'false', logo: 'false', format: 'png' });
      // Mapbox's Static Images URL limit is 8192 characters. Reject rather than cut off a route.
      if (url.href.length > 8192) throw new Error('Preview route exceeds the Mapbox URL limit.');
      const response = await fetch(url.href, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('Mapbox preview request failed.');
      }
      if (!response.headers.get('content-type')?.startsWith('image/png') || Number(response.headers.get('content-length')) > MAX_BYTES) {
        await response.body?.cancel();
        throw new Error('Invalid preview image.');
      }
      const chunks = [];
      let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > MAX_BYTES) throw new Error('Invalid preview image.');
        chunks.push(Buffer.from(chunk));
      }
      const image = Buffer.concat(chunks);
      if (image.length < 45 || !image.subarray(0, 8).equals(PNG_SIGNATURE)
        || !image.subarray(-8).equals(PNG_END) || image.toString('ascii', 12, 16) !== 'IHDR' || image.readUInt32BE(16) !== 512 || image.readUInt32BE(20) !== 512) {
        throw new Error('Invalid preview image.');
      }
      return image;
    },
  };
}
