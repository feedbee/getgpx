import pino from 'pino';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'warn',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  base: { service: 'getgpx' },
  redact: ['req.headers.authorization', 'req.headers.cookie', 'authorization', 'cookie', 'token', 'sessionToken'],
});

export function createRequestLogger(log = logger) {
  return pinoHttp({
    logger: log,
    wrapSerializers: false,
    genReqId: () => randomUUID(),
    customProps: (request) => ({ requestId: request.id }),
    customAttributeKeys: { responseTime: 'durationMs' },
    serializers: {
      req: (request) => ({ method: request.method, path: new URL(request.originalUrl || request.url || '/', 'http://localhost').pathname,
        route: request.route?.path }),
      res: (response) => ({ statusCode: response.statusCode }),
    },
    autoLogging: { ignore: (request) => request.url?.startsWith('/health/') },
    customLogLevel: (_request, response) => response.statusCode >= 500 ? 'warn' : 'info',
  });
}
