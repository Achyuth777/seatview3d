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

  const config: Config = {
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
