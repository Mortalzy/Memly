import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { toNodeHandler } from 'better-auth/node';
import type { Logger } from 'pino';
import type { PrismaClient } from '@memly/database';
import type { Config } from './config.ts';
import { createAuth, requireSession } from './modules/auth/auth.ts';
import { createRoutes } from './http/routes.ts';
import { AppError, errorHandler } from './http/errors.ts';

export function createApp(db: PrismaClient, config: Config, logger: Logger) {
  const app = express();
  const auth = createAuth(db, config);
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY === '1' ? 1 : false);
  app.use(helmet());
  app.use((_req, res, next) => {
    // Derive the auth IP from Express's configured proxy trust, never from a client header.
    _req.headers['x-memly-client-ip'] = _req.ip;
    res.locals.requestId = randomUUID();
    res.setHeader('X-Request-ID', res.locals.requestId);
    res.setHeader('Cache-Control', 'no-store');
    const start = Date.now();
    res.on('finish', () =>
      logger.info(
        { requestId: res.locals.requestId, status: res.statusCode, durationMs: Date.now() - start },
        'HTTP request',
      ),
    );
    next();
  });
  // All browser mutations require an exact trusted Origin and JSON. No wildcard CORS.
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (
        !req.headers.origin ||
        !config.origins.includes(req.headers.origin) ||
        req.headers['sec-fetch-site'] === 'cross-site'
      ) {
        throw new AppError(403, 'ORIGIN_REJECTED', 'Источник запроса не разрешён');
      }
      if (!req.is('application/json'))
        throw new AppError(415, 'JSON_REQUIRED', 'Ожидается application/json');
    }
    next();
  });
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/api/ready', async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  app.get('/api/config', (_req, res) => {
    res.json({ emailEnabled: config.smtpEnabled });
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Слишком много запросов. Попробуйте через минуту.',
            requestId: res.locals.requestId,
          },
        });
      },
    }),
  );
  // Better Auth consumes the stream itself, before express.json().
  app.all('/api/auth/*splat', toNodeHandler(auth));
  app.use(express.json({ limit: '4mb' }));
  app.use('/api/v1', requireSession(auth), createRoutes(db));
  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Маршрут не найден')));
  app.use(errorHandler(logger));
  return { app, auth };
}
