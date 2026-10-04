import { test } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDb } from '../src/db.js'

test('fresh database has the sender QR columns and schema version 2', () => {
  const db = openDb(':memory:')
  assert.equal(db.pragma('user_version', { simple: true }), 2)
  const cols = (db.prepare('PRAGMA table_info(senders)').all() as { name: string }[]).map((c) => c.name)
  assert.ok(cols.includes('qr_code') && cols.includes('qr_fetched_at') && cols.includes('qr_status'))
})

test('a phase-1 database is upgraded in place without losing data', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'zalo-')), 'zalo.sqlite')
  const old = new Database(path)
  old.exec(`CREATE TABLE senders (uid TEXT PRIMARY KEY, display_name TEXT NOT NULL DEFAULT '', last_seen_at INTEGER);
            INSERT INTO senders (uid, display_name) VALUES ('111', 'Đức');`)
  old.close()

  const db = openDb(path)
  assert.equal(db.pragma('user_version', { simple: true }), 2)
  assert.deepEqual(db.prepare('SELECT display_name, qr_code FROM senders').get(), { display_name: 'Đức', qr_code: null })
})
