const path = require('path');

function registerSystemRoutes(app, { publicDir, env = process.env } = {}) {
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV || 'development',
      database: {
        host: env.MYSQL_HOST ? '[已設定]' : '[未設定]',
        port: env.MYSQL_PORT ? '[已設定]' : '[未設定]',
        database: env.MYSQL_DATABASE ? '[已設定]' : '[未設定]',
        username: env.MYSQL_USERNAME ? '[已設定]' : '[未設定]',
        password: env.MYSQL_ROOT_PASSWORD ? '[已設定]' : '[未設定]'
      }
    });
  });

  app.get('/api/embedding-health', (req, res) => {
    res.json({
      ok: false,
      ready: false,
      embedding_api_url: null,
      message: 'RAG 已停用'
    });
  });

  app.get('/api/embedding-stats', (req, res) => {
    res.json({
      ok: false,
      embedding_api_url: null,
      message: 'RAG 已停用'
    });
  });

  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    if (req.path.match(/\.[a-zA-Z0-9]+$/)) return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

module.exports = { registerSystemRoutes };
