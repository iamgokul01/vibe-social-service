export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
  foreignKeys: boolean;
  ssl: boolean;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshTtlMs: number;
}

export type CookieSameSite = 'lax' | 'strict' | 'none';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  isProduction: boolean;
  corsOrigins: string[];
  trustProxy: boolean;
  secureCookies: boolean;
  cookieSameSite: CookieSameSite;
  jwt: JwtConfig;
  db: DatabaseConfig;
  throttle: { ttlSeconds: number; limit: number };
}

const toBool = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const toSameSite = (
  value: string | undefined,
  fallback: CookieSameSite,
): CookieSameSite => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (
    normalized === 'lax' ||
    normalized === 'strict' ||
    normalized === 'none'
  ) {
    return normalized;
  }
  return fallback;
};

export default (): AppConfig => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  // A cross-site frontend (for example http://localhost:5173 talking to a
  // deployed https API) cannot send a SameSite=Lax cookie, so production
  // defaults to SameSite=None; Secure. Browsers reject None without Secure,
  // so the secure flag is forced on whenever None is used.
  const cookieSameSite = toSameSite(
    process.env.COOKIE_SAME_SITE,
    isProduction ? 'none' : 'lax',
  );
  const secureCookies = toBool(
    process.env.SECURE_COOKIES,
    isProduction || cookieSameSite === 'none',
  );

  return {
    port: Number(process.env.PORT ?? 4000),
    nodeEnv,
    isProduction,
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxy: toBool(process.env.TRUST_PROXY, isProduction),
    secureCookies,
    cookieSameSite,
    jwt: {
      secret: process.env.JWT_SECRET ?? '',
      expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
      refreshTtlMs: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 7) * 24 * 60 * 60 * 1000,
    },
    db: {
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 3306),
      username: process.env.DB_USER ?? 'vibesocial',
      password: process.env.DB_PASSWORD ?? 'vibesocial',
      database: process.env.DB_NAME ?? 'vibesocial',
      synchronize: toBool(process.env.DB_SYNCHRONIZE, false),
      logging: toBool(process.env.DB_LOGGING, false),
      foreignKeys: toBool(process.env.DB_FOREIGN_KEYS, true),
      // Managed MySQL providers (for example Northflank addons) run with
      // require_secure_transport=ON, so the connection must be encrypted.
      ssl: toBool(process.env.DB_SSL, false),
    },
    throttle: {
      ttlSeconds: Number(process.env.THROTTLE_TTL ?? 60),
      limit: Number(process.env.THROTTLE_LIMIT ?? 10),
    },
  };
};
