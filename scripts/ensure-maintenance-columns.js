/**
 * Ensure maintenance columns exist on production SQLite without full migrate.
 * Usage: DB_PATH=/app/data/dev.db node scripts/ensure-maintenance-columns.js
 */
const Database = require(process.env.BETTER_SQLITE3_PATH || 'better-sqlite3');
const dbPath = process.env.DB_PATH || process.env.DATABASE_URL?.replace(/^file:/, '') || './data/dev.db';
const db = new Database(dbPath);

function hasColumn(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === column);
}

const alters = [
  ['SiteSettings', 'maintenanceMode', 'BOOLEAN NOT NULL DEFAULT 0'],
  ['SiteSettings', 'maintenanceMessage', 'TEXT'],
  ['SiteSettings', 'maintenanceEta', 'TEXT'],
];

for (const [table, column, type] of alters) {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    console.log('added', table + '.' + column);
  } else {
    console.log('exists', table + '.' + column);
  }
}

db.close();
console.log('ok');
