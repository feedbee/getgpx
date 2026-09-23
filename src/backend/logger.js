import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  base: { service: 'getgpx' },
  redact: ['req.headers.authorization', 'req.headers.cookie', 'authorization', 'cookie', 'token', 'sessionToken'],
});
