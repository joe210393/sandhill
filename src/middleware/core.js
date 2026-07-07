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

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 4000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: '請求過於頻繁，請稍後再試' }
  });
  app.use('/api/', apiLimiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
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
