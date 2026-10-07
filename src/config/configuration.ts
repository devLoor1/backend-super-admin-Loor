export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3334', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    secret: process.env.JWT_SECRET || 'insecure-dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  corsOrigin: process.env.CORS_ORIGIN || '',
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL_MS || '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '120', 10),
  },
  logLevel: process.env.LOG_LEVEL || 'info',
  loorCore: {
    baseUrl: process.env.LOOR_CORE_BASE_URL || 'http://127.0.0.1:3333',
    clientId: process.env.LOOR_CORE_SERVICE_CLIENT_ID || 'loor-super-admin',
    secret: process.env.LOOR_CORE_SERVICE_SECRET || '',
    issuer: process.env.LOOR_CORE_SERVICE_ISSUER || 'loor-super-admin',
    audience: process.env.LOOR_CORE_SERVICE_AUDIENCE || 'loor-core',
    timeoutMs: parseInt(process.env.LOOR_CORE_TIMEOUT_MS || '10000', 10),
    jwtTtlSeconds: parseInt(process.env.LOOR_CORE_JWT_TTL_SECONDS || '60', 10),
  },
});
