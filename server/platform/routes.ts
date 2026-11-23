import type { FastifyContextConfig, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { httpError, type CatalogStore, type CinemaPatch } from './catalogStore';
import { SESSION_DAYS, type Accounts, type PublicUser } from './accounts';

export interface PlatformDeps {
  catalog: CatalogStore;
  accounts: Accounts;
  feedProviderId: string | null;
}

const COOKIE = 'sv_session';
const ID = '^[A-Za-z0-9_-]{1,80}$';
const idParam = (...names: string[]) => ({
  type: 'object',
  properties: Object.fromEntries(names.map((n) => [n, { type: 'string', pattern: ID }])),
});
const str = (maxLength: number) => ({ type: 'string', maxLength });
const nullable = (maxLength: number) => ({ type: ['string', 'null'], maxLength });

function readCookie(req: FastifyRequest): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return undefined;
}

function setCookie(req: FastifyRequest, reply: FastifyReply, token: string, maxAge: number) {
  const secure = req.protocol === 'https' ? '; Secure' : '';
  reply.header('set-cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

/** Accounts, library, discovery and admin routes. Every permission is enforced here, on the server. */
export function registerPlatform(app: FastifyInstance, deps: PlatformDeps, limit: (max?: number) => FastifyContextConfig, strictMax?: number, allowedOrigins: string[] = []) {
  const { catalog, accounts } = deps;
  const config = limit();
  const strict = limit(strictMax);

  app.addHook('onRequest', async (req) => {
    if (!/^\/api\/(auth|me|admin)(\/|$|\?)/.test(req.url) || ['GET', 'HEAD'].includes(req.method)) return;
    const origin = req.headers.origin;
    if (!origin) return;
    let host = '';
    try { host = new URL(origin).host; } catch { /* rejected below */ }
    if (host !== req.headers.host && !allowedOrigins.includes(origin)) throw httpError(403, 'BAD_ORIGIN', 'Cross-site request refused.');
  });

  const requireUser = async (req: FastifyRequest): Promise<PublicUser> => {
    const user = await accounts.userForToken(readCookie(req));
    if (!user) throw httpError(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
    return user;
  };
  const requireAdmin = async (req: FastifyRequest): Promise<PublicUser> => {
    const user = await requireUser(req);
    if (user.role !== 'admin') throw httpError(403, 'ADMIN_ONLY', 'Admin access required.');
    return user;
  };
  const noStore = (reply: FastifyReply) => reply.header('cache-control', 'no-store');

  app.get<{ Querystring: { city: string; date?: string } }>('/api/discovery', {
    config,
    schema: { querystring: { type: 'object', required: ['city'], additionalProperties: false, properties: { city: { type: 'string', pattern: ID }, date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } } } },
  }, async (req, reply) => {
    // Never cached by the browser: a refresh, outage note or removed show must appear on the next load.
    noStore(reply);
    return catalog.discovery(req.query.city, req.query.date);
  });
  app.get<{ Params: { id: string } }>('/api/cinemas/:id', { config, schema: { params: idParam('id') } }, async (req) => catalog.cinema(req.params.id));
  app.get<{ Params: { id: string } }>('/api/auditoriums/:id', { config, schema: { params: idParam('id') } }, async (req) => catalog.auditorium(req.params.id));

  const credentials = {
    body: { type: 'object', required: ['email', 'password'], additionalProperties: false, properties: { email: str(254), password: str(200), name: str(100) } },
  };
  app.post<{ Body: { email: string; password: string; name?: string } }>('/api/auth/register', { config: strict, schema: credentials }, async (req, reply) => {
    const { user, token } = await accounts.register({ email: req.body.email, password: req.body.password, name: req.body.name ?? '' });
    setCookie(req, reply, token, SESSION_DAYS * 86_400);
    return reply.status(201).send({ user });
  });
  app.post<{ Body: { email: string; password: string } }>('/api/auth/login', { config: strict, schema: credentials }, async (req, reply) => {
    const { user, token } = await accounts.login(req.body.email, req.body.password);
    setCookie(req, reply, token, SESSION_DAYS * 86_400);
    noStore(reply);
    return { user };
  });
  app.post('/api/auth/logout', { config }, async (req, reply) => {
    const token = readCookie(req);
    if (token) await accounts.logout(token);
    setCookie(req, reply, '', 0);
    return reply.status(204).send();
  });

  app.get('/api/me', { config }, async (req, reply) => {
    noStore(reply);
    return { user: await accounts.userForToken(readCookie(req)) };
  });
  app.patch<{ Body: { name?: string; homeCity?: string | null; languages?: string[]; notify?: { showChanges?: boolean; emailReminders?: boolean } } }>('/api/me', {
    config,
    schema: { body: { type: 'object', additionalProperties: false, properties: {
      name: str(100), homeCity: nullable(40),
      languages: { type: 'array', maxItems: 12, items: str(30) },
      notify: { type: 'object', additionalProperties: false, properties: { showChanges: { type: 'boolean' }, emailReminders: { type: 'boolean' } } },
    } } },
  }, async (req) => ({ user: await accounts.updateProfile((await requireUser(req)).id, req.body) }));

  app.get('/api/me/library', { config }, async (req, reply) => {
    noStore(reply);
    return accounts.library(await requireUser(req));
  });
  app.put<{ Params: { id: string } }>('/api/me/favourites/:id', { config, schema: { params: idParam('id') } }, async (req, reply) => {
    await accounts.setFavourite((await requireUser(req)).id, req.params.id, true);
    return reply.status(204).send();
  });
  app.delete<{ Params: { id: string } }>('/api/me/favourites/:id', { config, schema: { params: idParam('id') } }, async (req, reply) => {
    await accounts.setFavourite((await requireUser(req)).id, req.params.id, false);
    return reply.status(204).send();
  });
  app.put<{ Params: { id: string } }>('/api/me/saved/:id', { config, schema: { params: idParam('id') } }, async (req, reply) => {
    await accounts.saveScreening((await requireUser(req)).id, req.params.id);
    return reply.status(204).send();
  });
  app.delete<{ Params: { id: string } }>('/api/me/saved/:id', { config, schema: { params: idParam('id') } }, async (req, reply) => {
    await accounts.removeSaved((await requireUser(req)).id, req.params.id);
    return reply.status(204).send();
  });
  app.post<{ Params: { id: string } }>('/api/me/saved/:id/acknowledge', { config, schema: { params: idParam('id') } }, async (req, reply) => {
    await accounts.acknowledgeChange((await requireUser(req)).id, req.params.id);
    return reply.status(204).send();
  });
  app.post<{ Params: { id: string }; Body: { score: number } }>('/api/me/saved/:id/rating', {
    config,
    schema: { params: idParam('id'), body: { type: 'object', required: ['score'], additionalProperties: false, properties: { score: { type: 'integer', minimum: 1, maximum: 5 } } } },
  }, async (req, reply) => {
    await accounts.rate((await requireUser(req)).id, req.params.id, req.body.score);
    return reply.status(204).send();
  });
  app.post<{ Params: { id: string } }>('/api/me/saved/:id/dismiss-rating', { config, schema: { params: idParam('id') } }, async (req, reply) => {
    await accounts.dismissRating((await requireUser(req)).id, req.params.id);
    return reply.status(204).send();
  });
  app.post<{ Body: { tickets: { reference: string; email: string }[] } }>('/api/me/import', {
    config: strict,
    schema: { body: { type: 'object', required: ['tickets'], additionalProperties: false, properties: {
      tickets: { type: 'array', maxItems: 50, items: { type: 'object', required: ['reference', 'email'], additionalProperties: false, properties: { reference: str(16), email: str(320) } } },
    } } },
  }, async (req) => ({ results: await accounts.importLocal(await requireUser(req), req.body.tickets) }));

  app.get('/api/admin/overview', { config }, async (req, reply) => {
    await requireAdmin(req);
    noStore(reply);
    return catalog.adminOverview();
  });
  app.patch<{ Params: { id: string }; Body: CinemaPatch }>('/api/admin/cinemas/:id', {
    config,
    schema: { params: idParam('id'), body: { type: 'object', additionalProperties: false, properties: { name: str(120), mall: nullable(120), neighbourhood: str(80), providerUrl: nullable(400) } } },
  }, async (req) => catalog.correctCinema(await requireAdmin(req), req.params.id, req.body));

  const aliasBody = { type: 'object', required: ['alias'], additionalProperties: false, properties: { alias: str(80) } };
  app.post<{ Params: { id: string }; Body: { alias: string } }>('/api/admin/cinemas/:id/aliases', { config, schema: { params: idParam('id'), body: aliasBody } }, async (req, reply) => {
    await catalog.addAlias(await requireAdmin(req), req.params.id, req.body.alias);
    return reply.status(204).send();
  });
  app.post<{ Params: { id: string }; Body: { alias: string } }>('/api/admin/cinemas/:id/aliases/remove', { config, schema: { params: idParam('id'), body: aliasBody } }, async (req, reply) => {
    await catalog.removeAlias(await requireAdmin(req), req.params.id, req.body.alias);
    return reply.status(204).send();
  });
  app.post<{ Params: { id: string }; Body: { intoId: string } }>('/api/admin/cinemas/:id/merge', {
    config,
    schema: { params: idParam('id'), body: { type: 'object', required: ['intoId'], additionalProperties: false, properties: { intoId: { type: 'string', pattern: ID } } } },
  }, async (req, reply) => {
    await catalog.merge(await requireAdmin(req), req.params.id, req.body.intoId);
    return reply.status(204).send();
  });
  app.put<{ Params: { id: string }; Body: { externalId: string } }>('/api/admin/cinemas/:id/feed-ref', {
    config,
    schema: { params: idParam('id'), body: { type: 'object', required: ['externalId'], additionalProperties: false, properties: { externalId: str(40) } } },
  }, async (req, reply) => {
    const admin = await requireAdmin(req);
    if (!deps.feedProviderId) throw httpError(409, 'NO_PROVIDER', 'No showtime provider is configured.');
    await catalog.setFeedRef(admin, req.params.id, deps.feedProviderId, req.body.externalId);
    return reply.status(204).send();
  });
  app.put<{ Params: { id: string }; Body: { cinemaId: string; name: string; modelId: string | null; verification: 'verified' | 'illustrative' | null; note?: string | null } }>('/api/admin/auditoriums/:id', {
    config,
    schema: { params: idParam('id'), body: { type: 'object', required: ['cinemaId', 'name', 'modelId', 'verification'], additionalProperties: false, properties: {
      cinemaId: { type: 'string', pattern: ID }, name: str(80), modelId: { enum: ['scope-14m', null] }, verification: { enum: ['verified', 'illustrative', null] }, note: nullable(400),
    } } },
  }, async (req, reply) => {
    await catalog.mapAuditorium(await requireAdmin(req), req.params.id, req.body);
    return reply.status(204).send();
  });
  app.post<{ Params: { cityId: string } }>('/api/admin/refresh/:cityId', { config: strict, schema: { params: idParam('cityId') } }, async (req) => catalog.refresh(req.params.cityId, await requireAdmin(req)));
}
