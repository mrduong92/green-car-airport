import Database from 'better-sqlite3'

export type Db = Database.Database

// Bảng nhóm đặt tên chat_groups vì GROUPS là từ khoá của SQLite (window function).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS chat_groups (
  zalo_group_id   TEXT PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT '',
  last_message_at INTEGER
);
CREATE TABLE IF NOT EXISTS senders (
  uid          TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  last_seen_at INTEGER
);
CREATE TABLE IF NOT EXISTS messages (
  id            INTEGER PRIMARY KEY,
  zalo_group_id TEXT NOT NULL,
  zalo_msg_id   TEXT NOT NULL,
  sender_uid    TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  content       TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  sent_at       INTEGER NOT NULL,
  received_at   INTEGER NOT NULL,
  parse_status  TEXT NOT NULL DEFAULT 'pending',
  UNIQUE (zalo_group_id, zalo_msg_id)
);
CREATE INDEX IF NOT EXISTS messages_hash_sent ON messages (content_hash, sent_at);
CREATE INDEX IF NOT EXISTS messages_sent ON messages (sent_at);
`

export function openDb(path: string): Db {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.exec(SCHEMA)
  return db
}
