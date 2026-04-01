import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getConfig } from './config.js';
import { getLogger } from './logger.js';

let _db = null;
let _dbPath = null;
let _saveTimer = null;

export async function initDb() {
  const config = getConfig();
  const log = getLogger();
  _dbPath = config.database.path;

  mkdirSync(dirname(_dbPath), { recursive: true });

  const SQL = await initSqlJs();

  try {
    const buf = readFileSync(_dbPath);
    _db = new SQL.Database(buf);
  } catch {
    _db = new SQL.Database();
  }

  _db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      username TEXT,
      remote_ip TEXT,
      method TEXT,
      raw_log TEXT,
      notified_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  _db.run(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)`);
  _db.run(`CREATE INDEX IF NOT EXISTS idx_events_username ON events(username)`);
  _db.run(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)`);
  _db.run(`
    CREATE TABLE IF NOT EXISTS cursor (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_position INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Auto-save to disk every 10 seconds if there are changes
  _saveTimer = setInterval(saveToDisk, 10000);

  log.info({ dbPath: _dbPath }, 'Database initialized');
}

function saveToDisk() {
  if (!_db || !_dbPath) return;
  try {
    const data = _db.export();
    writeFileSync(_dbPath, Buffer.from(data));
  } catch (err) {
    getLogger().error({ err }, 'Failed to save database');
  }
}

export function insertEvent(event) {
  _db.run(
    `INSERT INTO events (timestamp, event_type, username, remote_ip, method, raw_log)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [event.timestamp, event.event_type, event.username, event.remote_ip, event.method, event.raw_log]
  );
  const result = _db.exec('SELECT last_insert_rowid()');
  return result[0].values[0][0];
}

export function markNotified(eventId) {
  _db.run(`UPDATE events SET notified_at = datetime('now') WHERE id = ?`, [eventId]);
}

export function getRecentEvents(username, eventType, minutesAgo) {
  const stmt = _db.prepare(
    `SELECT * FROM events
     WHERE username = ? AND event_type = ? AND created_at > datetime('now', ?)
     ORDER BY created_at DESC`
  );
  stmt.bind([username, eventType, `-${minutesAgo} minutes`]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export function getCursor() {
  const result = _db.exec('SELECT last_position FROM cursor WHERE id = 1');
  return result.length > 0 ? result[0].values[0][0] : 0;
}

export function setCursor(position) {
  _db.run(
    `INSERT INTO cursor (id, last_position) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET last_position = excluded.last_position`,
    [position]
  );
}

export function pruneEvents() {
  const config = getConfig();
  const days = config.database.retention_days;
  if (days <= 0) return;
  _db.run(`DELETE FROM events WHERE created_at < datetime('now', ?)`, [`-${days} days`]);
}

export function closeDb() {
  if (_saveTimer) clearInterval(_saveTimer);
  saveToDisk();
  if (_db) _db.close();
}
