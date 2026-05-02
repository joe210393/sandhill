const VALID_SQL_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertValidIdentifier(name, context) {
  if (!VALID_SQL_IDENTIFIER.test(name)) {
    throw new Error(`Invalid ${context}: ${name}`);
  }
}

async function getTableColumnSet(conn, tableName) {
  assertValidIdentifier(tableName, 'table name');
  const [rows] = await conn.execute(`SHOW COLUMNS FROM \`${tableName}\``);
  return new Set(rows.map(row => row.Field));
}

async function insertDynamicRecord(conn, tableName, record) {
  assertValidIdentifier(tableName, 'table name');
  const columns = Object.keys(record);
  columns.forEach(col => assertValidIdentifier(col, 'column name'));
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO \`${tableName}\` (${columns.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`;
  const values = columns.map(column => record[column]);
  return conn.execute(sql, values);
}

async function updateDynamicRecord(conn, tableName, id, record) {
  assertValidIdentifier(tableName, 'table name');
  const columns = Object.keys(record);
  columns.forEach(col => assertValidIdentifier(col, 'column name'));
  const assignments = columns.map(column => `\`${column}\` = ?`).join(', ');
  const sql = `UPDATE \`${tableName}\` SET ${assignments} WHERE id = ?`;
  const values = [...columns.map(column => record[column]), id];
  return conn.execute(sql, values);
}

module.exports = {
  assertValidIdentifier,
  getTableColumnSet,
  insertDynamicRecord,
  updateDynamicRecord
};
