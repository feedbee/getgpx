export function createApiAccessPolicy({ origin } = {}) {
  const canonicalOrigin = origin ? new URL(origin).origin : null;
  return (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.vary('Origin');
    response.vary('Sec-Fetch-Site');
    const actualOrigin = canonicalOrigin || `${request.protocol}://${request.get('host')}`;
    const suppliedOrigin = request.get('origin');
    const site = request.get('sec-fetch-site');
    const navigation = request.get('sec-fetch-mode') === 'navigate' && ['GET', 'HEAD'].includes(request.method);
    if ((suppliedOrigin && suppliedOrigin !== actualOrigin)
      || (['same-site', 'cross-site'].includes(site) && !navigation)) {
      return response.status(403).json({ error: { code: 'CROSS_ORIGIN_FORBIDDEN' } });
    }
    next();
  };
}
