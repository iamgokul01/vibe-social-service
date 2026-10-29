export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
  foreignKeys: boolean;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshTtlMs: number;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  isProduction: boolean;
  corsOrigins: string[];
  trustProxy: boolean;
  secureCookies: boolean;
  jwt: JwtConfig;
  db: DatabaseConfig;
  throttle: { ttlSeconds: number; limit: number };
}

const toBool = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

export default (): AppConfig => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  return {
    port: Number(process.env.PORT ?? 4000),
    nodeEnv,
    isProduction,
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxy: toBool(process.env.TRUST_PROXY, isProduction),
    secureCookies: toBool(process.env.SECURE_COOKIES, isProduction),
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
    },
    throttle: {
      ttlSeconds: Number(process.env.THROTTLE_TTL ?? 60),
      limit: Number(process.env.THROTTLE_LIMIT ?? 10),
    },
  };
};
