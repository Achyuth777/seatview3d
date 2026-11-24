import { fileURLToPath } from 'node:url';

/** Server configuration, read from environment variables (and the `--static` flag). */
export interface Config {
  port: number;
  host: string;
  /** postgres://… — when unset, embedded PGlite in `dataDir` is used. */
  databaseUrl?: string;
  dataDir: string;
  holdMinutes: number;
  /** Requests per minute per client IP, all API routes. */
  rateLimitMax: number;
  /** Requests per minute per client IP for POST /api/holds (stricter). */
  rateLimitHoldsMax: number;
  /** Exact origins allowed cross-origin; empty = same-origin only (no CORS headers sent). */
  allowedOrigins: string[];
  /** Trust X-Forwarded-For (set true only behind a reverse proxy you control). */
  trustProxy: boolean;
  /** Serve the built frontend from `staticDir` (production single-process mode). */
  serveStatic: boolean;
  staticDir: string;
  sweepIntervalMs: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  /** Live showtimes. Only set when all credentials and MOVIEGLU_LICENSED=true are present. */
  movieGlu?: { client: string; apiKey: string; authorization: string; territory: string };
  feedRefreshMinutes: number;
  nodeEnv: string;
  /** Origin used in emailed links. */
  appOrigin: string;
  sessionHours: number;
  /** Only "outbox" (simulated, nothing is sent) exists until an email provider is connected. */
  mailer: 'outbox';
  /** Development only: GET /api/dev/outbox for test addresses. */
  devOutbox: boolean;
  /** "fixture" is a SIMULATED provider for development and tests. */
  feedProvider: 'none' | 'movieglu' | 'fixture';
  feedFixtureFile?: string;
  feedCacheHours: number;
  /** Admins must pass a TOTP check (default on in production). */
  adminMfaRequired: boolean;
}

export class ConfigError extends Error {}

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

/** Parses and validates configuration; throws one ConfigError listing every problem. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): Config {
  const problems: string[] = [];

  const int = (name: string, def: number, min: number, max: number): number => {
    const raw = env[name];
    if (raw === undefined || raw === '') return def;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      problems.push(`${name} must be an integer between ${min} and ${max} (got "${raw}")`);
      return def;
    }
    return n;
  };
  const bool = (name: string, def: boolean): boolean => {
    const raw = env[name]?.toLowerCase();
    if (raw === undefined || raw === '') return def;
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    problems.push(`${name} must be true or false (got "${env[name]}")`);
    return def;
  };

  const databaseUrl = env.DATABASE_URL || undefined;
  if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    problems.push('DATABASE_URL must start with postgres:// or postgresql://');
  }

  const allowedOrigins = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const o of allowedOrigins) {
    let ok = false;
    try {
      ok = new URL(o).origin === o;
    } catch {
      /* invalid */
    }
    if (!ok) problems.push(`ALLOWED_ORIGINS entry "${o}" must be an exact origin like https://tickets.example.com`);
  }

  const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
  const logLevel = (env.LOG_LEVEL ?? 'info') as Config['logLevel'];
  if (!logLevels.includes(logLevel)) problems.push(`LOG_LEVEL must be one of ${logLevels.join(', ')}`);

  // MovieGlu's evaluation licence forbids publishing its data, so a key alone never enables the feed.
  const mg = { client: env.MOVIEGLU_CLIENT, apiKey: env.MOVIEGLU_API_KEY, authorization: env.MOVIEGLU_AUTHORIZATION };
  const mgSet = Object.values(mg).filter(Boolean).length;
  const mgLicensed = bool('MOVIEGLU_LICENSED', false);
  if (mgLicensed && mgSet < 3) problems.push('MOVIEGLU_LICENSED=true also needs MOVIEGLU_CLIENT, MOVIEGLU_API_KEY and MOVIEGLU_AUTHORIZATION');

  const nodeEnv = env.NODE_ENV || 'development';
  const production = nodeEnv === 'production';
  const mailer = env.MAILER || 'outbox';
  if (mailer !== 'outbox') problems.push(`MAILER=${mailer} is not available: no email provider is connected yet, so only MAILER=outbox (simulated) works`);
  const devOutbox = bool('DEV_OUTBOX', false);
  if (devOutbox && production) problems.push('DEV_OUTBOX must not be enabled in production');
  const feedProvider = (env.FEED_PROVIDER || (mgLicensed ? 'movieglu' : 'none')) as Config['feedProvider'];
  if (!['none', 'movieglu', 'fixture'].includes(feedProvider)) problems.push('FEED_PROVIDER must be none, movieglu or fixture');
  if (feedProvider === 'fixture' && (production || !env.FEED_FIXTURE_FILE)) problems.push('FEED_PROVIDER=fixture is a simulated feed: it needs FEED_FIXTURE_FILE and is refused in production');
  if (feedProvider === 'movieglu' && !(mgLicensed && mgSet === 3)) problems.push('FEED_PROVIDER=movieglu needs MOVIEGLU_LICENSED=true and all three MovieGlu credentials');
  if (env.APP_ORIGIN && !/^https?:\/\/[^/]+$/.test(env.APP_ORIGIN)) problems.push('APP_ORIGIN must be an origin like https://seatview.example');
  if (production && env.APP_ORIGIN && !env.APP_ORIGIN.startsWith('https://')) problems.push('APP_ORIGIN must use https in production');

  const config: Config = {
    nodeEnv,
    appOrigin: env.APP_ORIGIN || `http://${env.HOST || '127.0.0.1'}:${env.PORT || 3001}`,
    sessionHours: int('SESSION_HOURS', 24 * 30, 1, 24 * 90),
    mailer: 'outbox',
    devOutbox,
    feedProvider,
    feedFixtureFile: env.FEED_FIXTURE_FILE || undefined,
    feedCacheHours: int('FEED_CACHE_HOURS', 6, 1, 72),
    adminMfaRequired: bool('ADMIN_MFA_REQUIRED', production),
    movieGlu: mgLicensed && mgSet === 3 ? { client: mg.client!, apiKey: mg.apiKey!, authorization: mg.authorization!, territory: 'IN' } : undefined,
    feedRefreshMinutes: int('FEED_REFRESH_MINUTES', 60, 15, 1440),
    port: int('PORT', 3001, 1, 65535),
    host: env.HOST || '127.0.0.1',
    databaseUrl,
    dataDir: env.DATA_DIR || root('data/pglite'),
    holdMinutes: int('HOLD_MINUTES', 10, 1, 60),
    rateLimitMax: int('RATE_LIMIT_MAX', 300, 1, 100_000),
    rateLimitHoldsMax: int('RATE_LIMIT_HOLDS_MAX', 60, 1, 100_000),
    allowedOrigins,
    trustProxy: bool('TRUST_PROXY', false),
    serveStatic: argv.includes('--static') || bool('SERVE_STATIC', false),
    staticDir: env.STATIC_DIR || root('dist'),
    sweepIntervalMs: int('SWEEP_INTERVAL_SECONDS', 60, 5, 3600) * 1000,
    logLevel,
  };

  if (problems.length) throw new ConfigError(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
  return config;
}
