import Database from 'better-sqlite3'

export type Db = Database.Database

// Bảng nhóm đặt tên chat_groups vì GROUPS là từ khoá của SQLite (window function).
// Migration theo PRAGMA user_version. v1 dùng IF NOT EXISTS để DB giai đoạn 1 (user_version = 0) chạy lại an toàn.
const SCHEMA_V1 = `
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

// v2: mã deeplink (zalo://qr/p/<mã>) của người gửi.
const SCHEMA_V2 = `
ALTER TABLE senders ADD COLUMN qr_code TEXT;
ALTER TABLE senders ADD COLUMN qr_fetched_at INTEGER;
ALTER TABLE senders ADD COLUMN qr_status TEXT;
`

// v3: index truy vấn tin theo trạng thái, bảng cuốc (rides) rút ra từ tin, bảng theo dõi chi phí AI theo ngày.
const SCHEMA_V3 = `
CREATE INDEX messages_status ON messages (parse_status, sent_at);
CREATE TABLE rides (
  id               INTEGER PRIMARY KEY,
  ride_uid         TEXT NOT NULL UNIQUE,
  message_id       INTEGER NOT NULL,
  sender_uid       TEXT NOT NULL,
  zalo_group_id    TEXT NOT NULL,
  direction        TEXT,
  pickup           TEXT,
  destination      TEXT,
  pickup_at        INTEGER,
  pickup_time_text TEXT,
  seats            INTEGER,
  vehicle_note     TEXT,
  price            INTEGER,
  is_free          INTEGER NOT NULL DEFAULT 0,
  is_raw           INTEGER NOT NULL DEFAULT 0,
  raw_text         TEXT NOT NULL,
  fingerprint      TEXT NOT NULL,
  group_count      INTEGER NOT NULL DEFAULT 1,
  posted_at        INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  synced_at        INTEGER
);
CREATE INDEX rides_fingerprint ON rides (fingerprint, expires_at);
CREATE INDEX rides_sync ON rides (synced_at, updated_at);
CREATE INDEX rides_sender ON rides (sender_uid, expires_at);
CREATE TABLE ai_usage (
  day           TEXT PRIMARY KEY,
  calls         INTEGER NOT NULL DEFAULT 0,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL NOT NULL DEFAULT 0
);
`

const MIGRATIONS = [SCHEMA_V1, SCHEMA_V2, SCHEMA_V3]

export function openDb(path: string): Db {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')

  const current = db.pragma('user_version', { simple: true }) as number
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version])
      db.pragma(`user_version = ${version + 1}`)
    })()
  }
  return db
}
