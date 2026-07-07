const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

function buildAllowedOrigins(env = process.env) {
  return env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
    : [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:4015',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:4015',
        'https://sandhill.zeabur.app',
        'https://leleland.zeabur.app'
      ];
}

function buildCorsOptions(env = process.env) {
  const allowedOrigins = buildAllowedOrigins(env);
  return {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const isLocalDevOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

      if (allowedOrigins.includes(origin) || isLocalDevOrigin) {
        return callback(null, true);
      }

      console.warn(`🚫 CORS 阻擋來源: ${origin}`);
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-username'],
    maxAge: 86400
  };
}

function applyCoreMiddleware(app, express) {
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));

  // 同一 WiFi / 同一出口 IP 下，現場會有數十人同時載入與作答；全站 API 限流會誤傷整批玩家。
  // 預設關閉一般 API 限流；若需開啟可設 API_RATE_LIMIT_MAX（每 15 分鐘、每 IP）。
  const apiRateLimitMax = Number.parseInt(process.env.API_RATE_LIMIT_MAX || '0', 10);
  if (Number.isFinite(apiRateLimitMax) && apiRateLimitMax > 0) {
    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: apiRateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message: '請求過於頻繁，請稍後再試' }
    });
    app.use('/api/', apiLimiter);
  }

  const authRateLimitMax = Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX || '500', 10);
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number.isFinite(authRateLimitMax) && authRateLimitMax > 0 ? authRateLimitMax : 500,
    message: { success: false, message: '嘗試次數過多，請 15 分鐘後再試' }
  });
  app.use('/api/login', authLimiter);
  app.use('/api/staff-login', authLimiter);

  app.use(cors(buildCorsOptions()));
  app.use(cookieParser());
  app.use(express.json({ charset: 'utf-8' }));

  app.use((req, res, next) => {
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.path.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    next();
  });
}

module.exports = {
  applyCoreMiddleware,
  buildAllowedOrigins,
  buildCorsOptions
};
