import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAccounts } from '../src/account-files.js'

function recordingLogger() {
  const errors: string[] = []
  return { errors, logger: { info() {}, error: (...args: unknown[]) => { errors.push(args.join(' ')) } } }
}

test('một file session hỏng bị bỏ qua và ghi log, file tốt vẫn được nạp', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zalo-acc-'))
  writeFileSync(join(dir, 'tot.json'), JSON.stringify({ imei: 'x', cookie: [] }))
  writeFileSync(join(dir, 'hong.json'), '{"imei": "x", "cook') // ghi dở
  writeFileSync(join(dir, 'ghi-chu.txt'), 'không phải session')
  const { errors, logger } = recordingLogger()

  const accounts = loadAccounts(dir, logger)
  assert.deepEqual(accounts, [{ id: 'tot', credentials: { imei: 'x', cookie: [] } }])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /Tài khoản hong: file session hỏng \(.+\) — bỏ qua/)
})

test('thư mục chưa tồn tại → danh sách rỗng', () => {
  const { logger } = recordingLogger()
  assert.deepEqual(loadAccounts(join(tmpdir(), 'khong-ton-tai-' + Date.now()), logger), [])
})
