import type { FastifyContextConfig, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { httpError, type CatalogStore, type CinemaPatch } from './catalogStore';
import type { Accounts, PublicUser } from './accounts';
import { isTestAddress } from './mailer';

export interface PlatformDeps {
  catalog: CatalogStore;
  accounts: Accounts;
  feedProviderId: string | null;
  /** Development only: lets tests read simulated mail sent to test addresses. */
  devOutbox?: boolean;
  catalogDb?: import("../db").Sql;
  /** Admin routes require a TOTP-verified session. */
  adminMfaRequired?: boolean;
}

const COOKIE = 'sv_session';
/** What the browser may see about a user: never the role. */
const view = (u: PublicUser | null) => { if (!u) return null; const { role: _role, ...rest } = u; return rest; };
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
  /** Every admin read and write: signed in, admin role now (not when the session started), and MFA when required. */
  const requireAdmin = async (req: FastifyRequest): Promise<PublicUser> => {
    const s = await accounts.sessionForToken(readCookie(req));
    if (!s) throw httpError(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
    if (s.user.role !== 'admin') throw httpError(403, 'ADMIN_ONLY', 'Admin access required.');
    if (deps.adminMfaRequired && !s.mfaVerified) throw httpError(403, 'MFA_REQUIRED', 'Enter your two-step code to continue.');
    return s.user;
  };

  app.get('/api/admin/session', { config }, async (req, reply) => {
    noStore(reply);
    const s = await accounts.sessionForToken(readCookie(req));
    if (!s) throw httpError(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
    if (s.user.role !== 'admin') throw httpError(403, 'ADMIN_ONLY', 'This account doesn’t have admin access.');
    return { email: s.user.email, name: s.user.name, mfa: { required: !!deps.adminMfaRequired, enrolled: s.mfaEnrolled, verified: s.mfaVerified } };
  });
  const adminWithoutMfa = async (req: FastifyRequest) => {
    const s = await accounts.sessionForToken(readCookie(req));
    if (!s) throw httpError(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
    if (s.user.role !== 'admin') throw httpError(403, 'ADMIN_ONLY', 'Admin access required.');
    return s.user;
  };
  app.post('/api/admin/mfa/enroll', { config: strict }, async (req, reply) => {
    noStore(reply);
    return accounts.enrollTotp(await adminWithoutMfa(req));
  });
  app.post<{ Body: { code: string } }>('/api/admin/mfa/verify', {
    config: strict, schema: { body: { type: 'object', required: ['code'], additionalProperties: false, properties: { code: str(8) } } },
  }, async (req, reply) => {
    await accounts.verifyTotpForSession(await adminWithoutMfa(req), readCookie(req)!, req.body.code);
    return reply.status(204).send();
  });
  app.put<{ Params: { id: string }; Body: { url: string | null } }>('/api/admin/cinemas/:id/provider-link', {
    config, schema: { params: idParam('id'), body: { type: 'object', required: ['url'], additionalProperties: false, properties: { url: nullable(400) } } },
  }, async (req, reply) => {
    await catalog.setProviderLink(await requireAdmin(req), req.params.id, req.body.url);
    return reply.status(204).send();
  });
  const noStore = (reply: FastifyReply) => reply.header('cache-control', 'no-store');
  /** Saving and importing need a confirmed email address. */
  const requireVerified = async (req: FastifyRequest): Promise<PublicUser> => {
    const user = await requireUser(req);
    if (!user.emailVerified) throw httpError(403, 'VERIFY_EMAIL', 'Confirm your email address first. Check your inbox or resend the link from Profile.');
    return user;
  };

  app.get('/api/config', { config }, async () => ({ emailDelivery: accounts.emailDelivery, showtimeProvider: deps.feedProviderId }));

  const tokenBody = { body: { type: 'object', required: ['token'], additionalProperties: false, properties: { token: str(100) } } };
  app.post<{ Body: { token: string } }>('/api/auth/verify', { config: strict, schema: tokenBody }, async (req) => ({ user: view(await accounts.verifyEmail(req.body.token)) }));
  app.post('/api/auth/resend-verification', { config: strict }, async (req, reply) => {
    await accounts.sendVerification(await requireUser(req));
    return reply.status(204).send();
  });
  app.post<{ Body: { email: string } }>('/api/auth/forgot', {
    config: strict, schema: { body: { type: 'object', required: ['email'], additionalProperties: false, properties: { email: str(254) } } },
  }, async (req, reply) => {
    await accounts.requestPasswordReset(req.body.email);
    return reply.status(204).send();
  });
  app.post<{ Body: { token: string; password: string } }>('/api/auth/reset', {
    config: strict, schema: { body: { type: 'object', required: ['token', 'password'], additionalProperties: false, properties: { token: str(100), password: str(200) } } },
  }, async (req, reply) => {
    await accounts.resetPassword(req.body.token, req.body.password);
    setCookie(req, reply, '', 0);
    return reply.status(204).send();
  });
  app.post('/api/me/alerts/deliver', { config }, async (req, reply) => {
    noStore(reply);
    return { alerts: await accounts.deliverAlerts((await requireUser(req)).id) };
  });
  if (deps.devOutbox) {
    app.get<{ Querystring: { to: string } }>('/api/dev/outbox', {
      schema: { querystring: { type: 'object', required: ['to'], properties: { to: str(254) } } },
    }, async (req, reply) => {
      if (!isTestAddress(req.query.to)) throw httpError(403, 'TEST_ADDRESSES_ONLY', 'Only test addresses can be read.');
      noStore(reply);
      return (await deps.catalogDb!.query('SELECT kind, subject, body, created_at FROM mail_outbox WHERE to_email = $1 ORDER BY id DESC LIMIT 5', [req.query.to.toLowerCase()])).rows;
    });
  }

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
    setCookie(req, reply, token, accounts.sessionHours * 3600);
    return reply.status(201).send({ user: view(user) });
  });
  app.post<{ Body: { email: string; password: string } }>('/api/auth/login', { config: strict, schema: credentials }, async (req, reply) => {
    const { user, token } = await accounts.login(req.body.email, req.body.password);
    setCookie(req, reply, token, accounts.sessionHours * 3600);
    noStore(reply);
    return { user: view(user) };
  });
  app.post('/api/auth/logout', { config }, async (req, reply) => {
    const token = readCookie(req);
    if (token) await accounts.logout(token);
    setCookie(req, reply, '', 0);
    return reply.status(204).send();
  });

  app.get('/api/me', { config }, async (req, reply) => {
    noStore(reply);
    return { user: view(await accounts.userForToken(readCookie(req))) };
  });
  app.patch<{ Body: { name?: string; homeCity?: string | null; languages?: string[]; notify?: { showChanges?: boolean; emailReminders?: boolean } } }>('/api/me', {
    config,
    schema: { body: { type: 'object', additionalProperties: false, properties: {
      name: str(100), homeCity: nullable(40),
      languages: { type: 'array', maxItems: 12, items: str(30) },
      notify: { type: 'object', additionalProperties: false, properties: { showChanges: { type: 'boolean' }, emailReminders: { type: 'boolean' } } },
    } } },
  }, async (req) => ({ user: view(await accounts.updateProfile((await requireUser(req)).id, req.body)) }));

  app.get('/api/me/library', { config }, async (req, reply) => {
    noStore(reply);
    return accounts.library(await requireUser(req));
  });
  app.put<{ Params: { id: string } }>('/api/me/favourites/:id', { config, schema: { params: idParam('id') } }, async (req, reply) => {
    await accounts.setFavourite((await requireVerified(req)).id, req.params.id, true);
    return reply.status(204).send();
  });
  app.delete<{ Params: { id: string } }>('/api/me/favourites/:id', { config, schema: { params: idParam('id') } }, async (req, reply) => {
    await accounts.setFavourite((await requireUser(req)).id, req.params.id, false);
    return reply.status(204).send();
  });
  app.put<{ Params: { id: string } }>('/api/me/saved/:id', { config, schema: { params: idParam('id') } }, async (req, reply) => {
    await accounts.saveScreening((await requireVerified(req)).id, req.params.id);
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
  }, async (req) => ({ results: await accounts.importLocal(await requireVerified(req), req.body.tickets) }));

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
  app.put<{ Params: { id: string }; Body: { cinemaId: string; name: string; modelId: string | null; verification: 'verified' | 'illustrative' | null; note?: string | null; measuredOn?: string | null } }>('/api/admin/auditoriums/:id', {
    config,
    schema: { params: idParam('id'), body: { type: 'object', required: ['cinemaId', 'name', 'modelId', 'verification'], additionalProperties: false, properties: {
      cinemaId: { type: 'string', pattern: ID }, name: str(80), modelId: { enum: ['scope-14m', null] }, verification: { enum: ['verified', 'illustrative', null] }, note: nullable(400), measuredOn: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    } } },
  }, async (req, reply) => {
    await catalog.mapAuditorium(await requireAdmin(req), req.params.id, req.body);
    return reply.status(204).send();
  });
  app.post<{ Params: { cityId: string } }>('/api/admin/refresh/:cityId', { config: strict, schema: { params: idParam('cityId') } }, async (req) => catalog.refresh(req.params.cityId, await requireAdmin(req)));
}
