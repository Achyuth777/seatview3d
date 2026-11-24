import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyContextConfig, type FastifyInstance } from 'fastify';
import { EVENTS } from '../src/booking/catalog';
import { BookingError, type BookingService } from '../src/booking/types';
import { registerPlatform, type PlatformDeps } from './platform/routes';

const STATUS: Record<BookingError['code'], number> = {
  SEAT_UNAVAILABLE: 409,
  HOLD_EXPIRED: 410,
  UNKNOWN_EVENT: 404,
  UNKNOWN_SEAT: 400,
  TOO_MANY_SEATS: 400,
  EMPTY_HOLD: 400,
  INVALID_CUSTOMER: 400,
};

const UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const EVENT_ID = '^[a-z0-9-]{1,64}$';
const SEAT_ID = '^[A-Za-z0-9-]{1,32}$';

export interface AppOptions {
  /** Structured JSON logs. `stream` lets tests capture output. */
  logger?: boolean | { level: string; stream?: { write(line: string): void } };
  /** Per-IP requests per minute for API routes / for POST /api/holds. Omit to disable (tests). */
  rateLimit?: { max: number; holdsMax: number };
  /** Exact origins allowed cross-origin; empty/omitted = same-origin only. */
  allowedOrigins?: string[];
  trustProxy?: boolean;
  /** Readiness check (e.g. database ping). */
  ready?: () => Promise<void>;
  /** Serve the built frontend from this directory. */
  staticDir?: string;
  /** Discovery, accounts and admin routes. */
  platform?: PlatformDeps;
  /** The public origin is https (production): browsers are told to upgrade any http subresource. */
  httpsOrigin?: boolean;
}

/** REST API mirroring the BookingService interface, plus optional static frontend hosting. */
export function buildApp(service: BookingService, opts: AppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: opts.logger ? { ...(typeof opts.logger === 'object' ? opts.logger : {}), base: { service: 'seatview' }, serializers: SAFE_SERIALIZERS } : false,
    // Every request gets an ID (a caller's x-request-id is reused when well-formed) that is logged and returned.
    genReqId: (req) => {
      const given = req.headers['x-request-id'];
      return typeof given === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(given) ? given : randomUUID();
    },
    requestIdLogLabel: 'requestId',
    bodyLimit: 16 * 1024,
    trustProxy: opts.trustProxy ?? false,
  });
  app.addHook('onSend', async (req, reply) => { reply.header('x-request-id', req.id); });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof BookingError) {
      return reply.status(STATUS[err.code]).send({ code: err.code, message: err.message, seatIds: err.seatIds });
    }
    const e = err as { validation?: unknown; statusCode?: number; code?: string; message: string };
    if (e.validation) return reply.status(400).send({ code: 'BAD_REQUEST', message: e.message });
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      // Framework/plugin client errors: 413 body too large, 415 media type, 429 rate limited, …
      return reply.status(e.statusCode).send({ code: e.code ?? 'BAD_REQUEST', message: e.message });
    }
    req.log.error({ err: { type: err instanceof Error ? err.name : 'Error', message: err instanceof Error ? err.message : String(err) }, event: 'request_failed' }, 'request failed');
    return reply.status(500).send({ code: 'SERVER_ERROR', message: 'Internal error' });
  });

  void app.register(helmet, {
    // Default CSP (self + inline styles); 'self' covers the API and the built app on one origin.
    // Film posters from a licensed feed are the only remote images.
    contentSecurityPolicy: {
      // upgrade-insecure-requests only when the site itself is served over https: Safari applies it even to
      // http://127.0.0.1, rewriting every script URL to https and leaving a blank page.
      directives: { imgSrc: ["'self'", 'data:', 'https:'], upgradeInsecureRequests: opts.httpsOrigin ? [] : null },
    },
    crossOriginEmbedderPolicy: false,
  });
  void app.register(compress, { threshold: 1024 });
  if (opts.allowedOrigins?.length) {
    void app.register(cors, { origin: opts.allowedOrigins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], credentials: true });
  }
  if (opts.rateLimit) {
    void app.register(rateLimit, {
      global: false,
      errorResponseBuilder: (_req, ctx) => ({
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: `Too many requests; try again in ${ctx.after}.`,
      }),
    });
  }
  const limit = (max?: number): FastifyContextConfig => ({
    rateLimit: opts.rateLimit ? { max: max ?? opts.rateLimit.max, timeWindow: '1 minute' } : false,
  });

  // Liveness: the process is up. Readiness: it can serve traffic (database reachable).
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/ready', async (_req, reply) => {
    try {
      await opts.ready?.();
      return { ready: true };
    } catch {
      return reply.status(503).send({ ready: false });
    }
  });

  app.register(async (api) => {
    if (opts.platform) registerPlatform(api, opts.platform, limit, opts.rateLimit?.holdsMax, opts.allowedOrigins);
    api.get('/api/events', { config: limit() }, async () => EVENTS);

    api.get<{ Params: { eventId: string }; Querystring: { holdId?: string } }>(
      '/api/events/:eventId/availability',
      {
        config: limit(),
        schema: {
          params: { type: 'object', properties: { eventId: { type: 'string', pattern: EVENT_ID } } },
          querystring: {
            type: 'object',
            additionalProperties: false,
            properties: { holdId: { type: 'string', pattern: UUID } },
          },
        },
      },
      async (req, reply) => {
        const a = await service.getAvailability(req.params.eventId, req.query.holdId);
        reply.header('cache-control', 'no-store');
        return { sold: [...a.sold], heldByOthers: [...a.heldByOthers] };
      },
    );

    api.post<{ Body: { eventId: string; seatIds: string[]; holdId?: string } }>(
      '/api/holds',
      {
        config: limit(opts.rateLimit?.holdsMax),
        schema: {
          body: {
            type: 'object',
            required: ['eventId', 'seatIds'],
            additionalProperties: false,
            properties: {
              eventId: { type: 'string', pattern: EVENT_ID },
              seatIds: { type: 'array', items: { type: 'string', pattern: SEAT_ID }, maxItems: 50 },
              holdId: { type: 'string', pattern: UUID },
            },
          },
        },
      },
      async (req, reply) => {
        const { eventId, seatIds, holdId } = req.body;
        const hold = await service.hold(eventId, seatIds, holdId);
        return reply.status(holdId ? 200 : 201).send(hold);
      },
    );

    api.get<{ Params: { reference: string }; Querystring: { email: string } }>(
      '/api/bookings/:reference',
      {
        config: limit(opts.rateLimit?.holdsMax),
        schema: {
          params: { type: 'object', properties: { reference: { type: 'string', maxLength: 16 } } },
          querystring: {
            type: 'object',
            required: ['email'],
            additionalProperties: false,
            properties: { email: { type: 'string', maxLength: 320 } },
          },
        },
      },
      async (req, reply) => {
        const booking = await service.findBooking(req.params.reference, req.query.email);
        reply.header('cache-control', 'no-store');
        if (!booking) return reply.status(404).send({ code: 'NOT_FOUND', message: 'No booking with that reference and email.' });
        return booking;
      },
    );

    const holdParams = {
      params: { type: 'object', properties: { holdId: { type: 'string', pattern: UUID } } },
    } as const;

    api.delete<{ Params: { holdId: string } }>(
      '/api/holds/:holdId',
      { config: limit(), schema: holdParams },
      async (req, reply) => {
        await service.release(req.params.holdId);
        return reply.status(204).send();
      },
    );

    api.post<{ Params: { holdId: string }; Body: { customer: { name: string; email: string } } }>(
      '/api/holds/:holdId/confirm',
      {
        config: limit(opts.rateLimit?.holdsMax),
        schema: {
          ...holdParams,
          body: {
            type: 'object',
            required: ['customer'],
            additionalProperties: false,
            properties: {
              customer: {
                type: 'object',
                required: ['name', 'email'],
                additionalProperties: false,
                properties: { name: { type: 'string', maxLength: 200 }, email: { type: 'string', maxLength: 320 } },
              },
            },
          },
        },
      },
      async (req, reply) => {
        const booking = await service.confirm(req.params.holdId, req.body.customer);
        return reply.status(201).send(booking);
      },
    );
  });

  if (opts.staticDir) {
    if (!existsSync(opts.staticDir)) {
      throw new Error(`Static directory ${opts.staticDir} not found; run "npm run build" first.`);
    }
    void app.register(fastifyStatic, {
      root: opts.staticDir,
      // Hashed assets never change → cache for a year; index.html must always be revalidated.
      setHeaders: (reply, path) => {
        reply.header(
          'cache-control',
          /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
  }

  app.setNotFoundHandler((req, reply) => {
    // Client-side routes (/movies, /event/…, /profile) load the app shell when serving the build.
    if (opts.staticDir && req.method === 'GET' && !req.url.startsWith('/api') && (req.headers.accept ?? '').includes('text/html')) {
      return reply.header('cache-control', 'no-cache').sendFile(req.url.startsWith('/admin') ? 'admin.html' : 'index.html');
    }
    return reply.status(404).send({ code: 'NOT_FOUND', message: `Route ${req.method} ${req.url.split('?')[0]} not found` });
  });

  return app;
}

/**
 * Request logs carry method, path (never the query string, which can hold an email), status and request ID.
 * No headers, cookies, bodies or client addresses are logged.
 */
const SAFE_SERIALIZERS = {
  req: (r: { method: string; url: string }) => ({ method: r.method, path: r.url.split('?')[0] }),
  res: (r: { statusCode: number }) => ({ statusCode: r.statusCode }),
};
