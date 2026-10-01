import express from 'express';
import { createTrackHandlers } from './track-handlers.js';
import { trackRoutes } from './routes.js';
import { responseSerializer } from './serialization.js';
import contract from './openapi.json' with { type: 'json' };

export function createV1Router(trackService, authService, options) {
  const router = express.Router();
  const handlers = createTrackHandlers(trackService, authService, options);
  router.get('/openapi.json', (_request, response) => response.json(contract));
  for (const path of new Set(trackRoutes.map(([, path]) => path))) {
    const resource = router.route(path);
    const operations = trackRoutes.filter(([, candidate]) => candidate === path);
    for (const [method, , handler] of operations) {
      const operation = contract.paths[path.replace(':id', '{id}')][method];
      const middleware = [responseSerializer(operation)];
      if (method === 'patch' || handler === 'removeMany' || handler === 'unsaveMany') {
        middleware.push(express.json({ limit: '16kb' }));
      }
      resource[method](...middleware, handlers[handler]);
    }
    const methods = operations.map(([method]) => method.toUpperCase());
    if (methods.includes('GET')) methods.push('HEAD');
    resource.all((_request, response) => response.set('Allow', methods.join(', '))
      .status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } }));
  }
  router.all('/openapi.json', (_request, response) => response.set('Allow', 'GET, HEAD')
    .status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } }));
  return router;
}
