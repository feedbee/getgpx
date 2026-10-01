import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const directory = path.dirname(fileURLToPath(import.meta.url));
const scalarDirectory = path.join(path.dirname(fileURLToPath(import.meta.resolve('@scalar/api-reference'))), 'browser');
const swaggerDirectory = path.dirname(fileURLToPath(import.meta.resolve('swagger-ui-dist')));
const docsPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export function createDocumentationRouter() {
  const router = express.Router();
  router.use('/assets/scalar', express.static(scalarDirectory, { index: false, maxAge: '1h' }));
  for (const name of ['swagger-ui-bundle.js', 'swagger-ui.css']) {
    router.get(`/assets/${name}`, (_request, response) => response.sendFile(name, { root: swaggerDirectory }));
  }
  router.use('/assets/docs', express.static(path.join(directory, 'docs'), { index: false, maxAge: '1h' }));
  for (const [url, view] of [['/docs', 'scalar'], ['/swagger', 'swagger']]) {
    router.get(url, (_request, response) => {
      response.setHeader('Content-Security-Policy', docsPolicy);
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>GetGPX API — ${view === 'scalar' ? 'Scalar' : 'Swagger UI'}</title>
<link rel="icon" href="data:,"><link rel="stylesheet" href="/api/assets/docs/style.css">
${view === 'swagger' ? '<link rel="stylesheet" href="/api/assets/swagger-ui.css">' : ''}
</head><body><nav><a href="/">GetGPX</a><a href="/api/docs">Scalar</a><a href="/api/swagger">Swagger UI</a><a href="/api/v1/openapi.json">OpenAPI v1</a></nav>
<main id="getgpx-api-reference"></main>
<script src="${view === 'scalar' ? '/api/assets/scalar/standalone.js' : '/api/assets/swagger-ui-bundle.js'}"></script>
<script src="/api/assets/docs/${view}.js"></script></body></html>`);
    });
  }
  return router;
}
