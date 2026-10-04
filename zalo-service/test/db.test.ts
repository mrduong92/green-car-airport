import { test } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDb } from '../src/db.js'

test('fresh database is at the latest schema version', () => {
  const db = openDb(':memory:')
  assert.equal(db.pragma('user_version', { simple: true }), 3)
  const cols = (db.prepare('PRAGMA table_info(senders)').all() as { name: string }[]).map((c) => c.name)
  assert.ok(cols.includes('qr_code') && cols.includes('qr_fetched_at') && cols.includes('qr_status'))
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'rides'").get())
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'ai_usage'").get())
})

test('a phase-1 database is upgraded in place without losing messages', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'zalo-')), 'zalo.sqlite')
  const old = new Database(path)
  old.exec(`CREATE TABLE senders (uid TEXT PRIMARY KEY, display_name TEXT NOT NULL DEFAULT '', last_seen_at INTEGER);
            CREATE TABLE messages (id INTEGER PRIMARY KEY, zalo_group_id TEXT NOT NULL, zalo_msg_id TEXT NOT NULL, sender_uid TEXT NOT NULL,
              account_id TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT NOT NULL, sent_at INTEGER NOT NULL,
              received_at INTEGER NOT NULL, parse_status TEXT NOT NULL DEFAULT 'pending', UNIQUE (zalo_group_id, zalo_msg_id));
            INSERT INTO senders (uid, display_name) VALUES ('111', 'Đức');
            INSERT INTO messages (zalo_group_id, zalo_msg_id, sender_uid, account_id, content, content_hash, sent_at, received_at)
              VALUES ('g1', 'm1', '111', 'acc1', 'tiễn 5h', 'h', 1, 1);`)
  old.close()

  const db = openDb(path)
  assert.equal(db.pragma('user_version', { simple: true }), 3)
  assert.deepEqual(db.prepare('SELECT content FROM messages').get(), { content: 'tiễn 5h' })
  assert.deepEqual(db.prepare('SELECT display_name, qr_code FROM senders').get(), { display_name: 'Đức', qr_code: null })
})

test('a phase-2 database (already at the QR-columns skeleton) upgrades to v3 keeping senders.qr_code', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'zalo-')), 'zalo.sqlite')
  const old = new Database(path)
  old.exec(`CREATE TABLE senders (uid TEXT PRIMARY KEY, display_name TEXT NOT NULL DEFAULT '', last_seen_at INTEGER,
              qr_code TEXT, qr_fetched_at INTEGER, qr_status TEXT);
            CREATE TABLE messages (id INTEGER PRIMARY KEY, zalo_group_id TEXT NOT NULL, zalo_msg_id TEXT NOT NULL, sender_uid TEXT NOT NULL,
              account_id TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT NOT NULL, sent_at INTEGER NOT NULL,
              received_at INTEGER NOT NULL, parse_status TEXT NOT NULL DEFAULT 'pending', UNIQUE (zalo_group_id, zalo_msg_id));
            INSERT INTO senders (uid, display_name, qr_code) VALUES ('111', 'Đức', 'zalo://qr/p/abc');
            PRAGMA user_version = 2;`)
  old.close()

  const db = openDb(path)
  assert.equal(db.pragma('user_version', { simple: true }), 3)
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'rides'").get())
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'ai_usage'").get())
  assert.deepEqual(db.prepare('SELECT display_name, qr_code FROM senders').get(), { display_name: 'Đức', qr_code: 'zalo://qr/p/abc' })
})
