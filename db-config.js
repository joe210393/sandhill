// Centralized DB config helper
// Security rule: never hardcode passwords/hosts in code. Use environment variables only.
//
// Supported env:
// - DATABASE_URL / MYSQL_URI / MYSQL_CONNECTION_STRING (optional): mysql://user:pass@host:port/dbname
// - MYSQL_HOST / DB_HOST
// - MYSQL_PORT / DB_PORT (optional, defaults to 3306)
// - MYSQL_USERNAME / MYSQL_USER / DB_USER
// - MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD / DB_PASSWORD
// - MYSQL_DATABASE / DB_NAME

function requireEnv(name) {
  const v = process.env[name];
  if (v === undefined || v === null || String(v).trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  const value = String(v);
  // 檢查是否包含未展開的變數語法（例如 ${VAR}）
  // 放寬檢查：只在明確看起來像未展開變數時才報錯，避免誤判包含 $ 或 {} 的合法密碼
  if (value.startsWith('${') && value.endsWith('}')) {
    throw new Error(`Environment variable ${name} appears to contain unexpanded variable syntax (e.g., \${VAR}). Please check your Zeabur environment variable configuration.`);
  }
  return value;
}

function firstDefinedEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return { name, value: String(value) };
    }
  }
  return null;
}

function requireAnyEnv(names) {
  const found = firstDefinedEnv(...names);
  if (!found) {
    throw new Error(`Missing required environment variable: ${names.join(' or ')}`);
  }

  const value = found.value;
  if (value.startsWith('${') && value.endsWith('}')) {
    throw new Error(`Environment variable ${found.name} appears to contain unexpanded variable syntax (e.g., \${VAR}). Please check your Zeabur environment variable configuration.`);
  }

  return value;
}

function getDbConfig() {
  // Prefer a connection string if provided (common pattern in many PaaS / Zeabur)
  const connectionStringEnv = firstDefinedEnv(
    'DATABASE_URL',
    'MYSQL_URI',
    'MYSQL_CONNECTION_STRING'
  );

  if (connectionStringEnv) {
    const dbUrl = connectionStringEnv.value;
    // 檢查是否包含未展開的變數語法
    if (dbUrl.startsWith('${') && dbUrl.endsWith('}')) {
      throw new Error(`${connectionStringEnv.name} appears to contain unexpanded variable syntax (e.g., \${VAR}). Please check your Zeabur environment variable configuration.`);
    }
    
    // 診斷：顯示原始 URL（隱藏敏感資訊）
    // const urlPreview = dbUrl.length > 50 ? dbUrl.substring(0, 50) + '...' : dbUrl;
    // console.log('原始 DATABASE_URL 預覽:', urlPreview.replace(/:[^:@]+@/, ':****@'));
    
    // 使用正則表達式手動解析 URL，避免 new URL() 對 URL 編碼密碼的處理問題
    const mysqlUrlRegex = /^mysql:\/\/([^:]+):([^@]+)@([^:\/]+):?(\d+)?\/(.+)$/;
    const match = dbUrl.match(mysqlUrlRegex);
    
    if (!match) {
      // console.error('正則表達式匹配失敗，嘗試使用 new URL() 作為備用方案');
      // 如果正則失敗，嘗試使用 new URL() 作為備用方案
      let url;
      try {
        url = new URL(dbUrl);
        if (url.protocol !== 'mysql:') {
          throw new Error('DATABASE_URL must start with mysql://');
        }
        const user = decodeURIComponent(url.username || '');
        const password = decodeURIComponent(url.password || '');
        const host = url.hostname;
        const port = url.port ? Number(url.port) : 3306;
        const database = (url.pathname || '').replace(/^\//, '');
        
        if (!host || !user || !password || !database) {
          throw new Error('DATABASE_URL missing required parts (host/user/password/database)');
        }
        
        return { host, user, password, database, port, charset: 'utf8mb4' };
      } catch (err) {
        throw new Error(`${connectionStringEnv.name} format error: ${err.message}. Please ensure the URL is properly formatted (e.g., mysql://user:password@host:port/database). If your password contains special characters like !, @, #, :, /, you may need to URL-encode them.`);
      }
    }
    
    // 從正則匹配結果中提取各部分
    const user = decodeURIComponent(match[1]);
    const passwordRaw = match[2];
    const password = decodeURIComponent(passwordRaw); // 這裡會正確解碼 %21 為 !
    const host = match[3];
    const port = match[4] ? Number(match[4]) : 3306;
    const database = decodeURIComponent(match[5]);
    
    if (!host || !user || !password || !database) {
      // 避免輸出完整的敏感資訊
      console.error(`${connectionStringEnv.name} 解析失敗: 缺少必要欄位 (host/user/password/database)`);
      throw new Error(`${connectionStringEnv.name} missing required parts. Please check its format.`);
    }
    
    return { host, user, password, database, port, charset: 'utf8mb4' };
  }

  const host = requireAnyEnv(['MYSQL_HOST', 'DB_HOST']);
  const user = requireAnyEnv(['MYSQL_USERNAME', 'MYSQL_USER', 'DB_USER']);
  const database = requireAnyEnv(['MYSQL_DATABASE', 'DB_NAME']);
  const passwordStr = requireAnyEnv(['MYSQL_ROOT_PASSWORD', 'MYSQL_PASSWORD', 'DB_PASSWORD']);
  const portValue = firstDefinedEnv('MYSQL_PORT', 'DB_PORT');
  const port = portValue ? Number(portValue.value) : 3306;
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`${portValue ? portValue.name : 'MYSQL_PORT'} must be a valid number`);
  }
  return { host, user, password: passwordStr, database, port, charset: 'utf8mb4' };
}

module.exports = { getDbConfig };

