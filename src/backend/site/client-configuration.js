/** Capture only explicitly supported presentation settings at server startup. */
export function createClientConfiguration(environment = process.env) {
  const configuration = JSON.stringify({
    sortDistributionBarsBySize: environment.SORT_DISTRIBUTION_BARS_BY_SIZE === 'true',
  });
  return (html) => html.replace(
    /(<script\b[^>]*\bid="getgpx-client-config"[^>]*>)[\s\S]*?(<\/script>)/,
    (_match, opening, closing) => `${opening}${configuration}${closing}`,
  );
}

/** Apply the startup settings to both social pages and the fallback app shell. */
export function createClientConfigurationMiddleware(environment = process.env) {
  const configureHtml = createClientConfiguration(environment);
  return (_request, response, next) => {
    const send = response.send;
    response.send = function (body) {
      if (typeof body === 'string' && this.get('Content-Type')?.includes('text/html')) {
        const configured = configureHtml(body);
        if (configured !== body) this.set('Cache-Control', 'private, no-store');
        body = configured;
      }
      return send.call(this, body);
    };
    next();
  };
}
