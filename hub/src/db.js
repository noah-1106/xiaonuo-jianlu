'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'xiaonuo.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'pending',
  tags TEXT NOT NULL DEFAULT '[]',
  link TEXT DEFAULT '',
  start_time TEXT,
  end_time TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_records_type ON records(type);
CREATE INDEX IF NOT EXISTS idx_records_status ON records(status);
CREATE INDEX IF NOT EXISTS idx_records_created ON records(created_at);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const RECORD_TYPES = ['todo', 'article', 'inspiration', 'other'];
const RECORD_STATUS = ['pending', 'completed', 'archived'];

function rowToRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    summary: row.summary,
    type: row.type,
    status: row.status,
    tags: JSON.parse(row.tags || '[]'),
    link: row.link,
    startTime: row.start_time,
    endTime: row.end_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createRecord({ title, content = '', type = 'other', tags = [], link = '', startTime = null, endTime = null }) {
  if (!RECORD_TYPES.includes(type)) type = 'other';
  const summary = title || String(content).slice(0, 100);
  const stmt = db.prepare(`
    INSERT INTO records (title, content, summary, type, tags, link, start_time, end_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(title || summary.slice(0, 50), content, summary, type, JSON.stringify(tags), link, startTime, endTime);
  return getRecord(info.lastInsertRowid);
}

function getRecord(id) {
  return rowToRecord(db.prepare('SELECT * FROM records WHERE id = ?').get(id));
}

function listRecords({ type, status, tag, page = 1, pageSize = 20 } = {}) {
  const where = [];
  const params = [];
  if (type) { where.push('type = ?'); params.push(type); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (tag) { where.push("tags LIKE ?"); params.push(`%"${tag}"%`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM records ${whereSql}`).get(...params).n;
  const rows = db.prepare(
    `SELECT * FROM records ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, (page - 1) * pageSize);
  return { total, page, pageSize, records: rows.map(rowToRecord) };
}

function getRecentRecords(limit = 10) {
  return db.prepare('SELECT * FROM records ORDER BY created_at DESC LIMIT ?').all(limit).map(rowToRecord);
}

function searchRecords(keyword) {
  const like = `%${keyword}%`;
  return db.prepare(
    'SELECT * FROM records WHERE title LIKE ? OR summary LIKE ? OR content LIKE ? ORDER BY created_at DESC LIMIT 50'
  ).all(like, like, like).map(rowToRecord);
}

const UPDATABLE = { title: 'title', content: 'content', type: 'type', status: 'status', tags: 'tags', link: 'link', startTime: 'start_time', endTime: 'end_time' };

function updateRecord(id, fields) {
  const existing = getRecord(id);
  if (!existing) return null;
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(UPDATABLE)) {
    if (fields[key] === undefined) continue;
    let value = fields[key];
    if (key === 'type' && !RECORD_TYPES.includes(value)) value = 'other';
    if (key === 'status' && !RECORD_STATUS.includes(value)) continue;
    if (key === 'tags') value = JSON.stringify(value);
    sets.push(`${col} = ?`);
    params.push(value);
  }
  if (sets.length === 0) return existing;
  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE records SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
  return getRecord(id);
}

function deleteRecord(id) {
  return db.prepare('DELETE FROM records WHERE id = ?').run(id).changes > 0;
}

function saveMessage(role, content) {
  db.prepare('INSERT INTO messages (role, content) VALUES (?, ?)').run(role, content);
}

function loadRecentMessages(limit = 10) {
  const rows = db.prepare('SELECT role, content FROM messages ORDER BY id DESC LIMIT ?').all(limit);
  return rows.reverse();
}

module.exports = {
  RECORD_TYPES,
  RECORD_STATUS,
  createRecord,
  getRecord,
  listRecords,
  getRecentRecords,
  searchRecords,
  updateRecord,
  deleteRecord,
  saveMessage,
  loadRecentMessages,
};
