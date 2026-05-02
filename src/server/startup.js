function logEnvironmentSummary(env = process.env) {
  if (env.NODE_ENV !== 'production') {
    console.log('=== 環境變數檢查 (開發模式) ===');
    if (env.DATABASE_URL) {
      console.log('DATABASE_URL:', '[已設定 - 將優先使用]');
    } else {
      console.log('DATABASE_URL:', '[未設定]');
      console.log('MYSQL_HOST:', env.MYSQL_HOST || '[未設定]');
      console.log('MYSQL_PORT:', env.MYSQL_PORT || '[未設定]');
      console.log('MYSQL_USERNAME:', env.MYSQL_USERNAME || '[未設定]');
      console.log('MYSQL_DATABASE:', env.MYSQL_DATABASE || '[未設定]');
      console.log('MYSQL_ROOT_PASSWORD:', env.MYSQL_ROOT_PASSWORD ? '[已設定]' : '[未設定]');
      console.log('MYSQL_PASSWORD:', env.MYSQL_PASSWORD ? '[已設定]' : '[未設定]');
    }
    console.log('ALLOWED_ORIGINS:', env.ALLOWED_ORIGINS || '[未設定]');
    console.log('==================');
  } else {
    console.log('✅ 環境變數已載入（生產模式，詳細資訊已隱藏）');
  }
}

async function runStartupChecks({ skipDb, testDatabaseConnection }) {
  if (skipDb) return;

  const dbConnected = await testDatabaseConnection();
  if (!dbConnected) {
    console.error('⚠️  警告: 資料庫連接失敗，部分功能可能無法正常運作');
    return;
  }
}

function startServer(app, { port, skipDb, testDatabaseConnection }) {
  logEnvironmentSummary();

  runStartupChecks({ skipDb, testDatabaseConnection })
    .catch((err) => {
      console.error('❌ 啟動檢查失敗:', err);
    });

  app.listen(port, () => {
    console.log('Server running on port ' + port);
    console.log(`🌐 應用程式運行在: http://localhost:${port}`);
    console.log(`🔍 健康檢查端點: http://localhost:${port}/api/health`);
  });
}

module.exports = {
  logEnvironmentSummary,
  runStartupChecks,
  startServer
};
