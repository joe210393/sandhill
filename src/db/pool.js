const mysql = require('mysql2/promise');
const { getDbConfig } = require('../../db-config');

function isDbSkipped(env = process.env) {
  return String(env.SKIP_DB || '').trim() === '1';
}

function createPoolFromEnv(env = process.env) {
  if (isDbSkipped(env)) {
    return { dbConfig: null, pool: null };
  }

  const dbConfig = getDbConfig();
  const pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  });

  return { dbConfig, pool };
}

module.exports = {
  createPoolFromEnv,
  isDbSkipped
};
