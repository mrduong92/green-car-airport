import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { SenderStore } from '../src/senders.js'
import { QrQueue, extractQrCode } from '../src/qr.js'
import { silentLogger } from '../src/logger.js'

const DAY = 24 * 3_600_000

function harness(opts: { qrUrl?: string; decoded?: string | null; fail?: boolean; onUpdatedThrows?: boolean } = {}) {
  const db = openDb(':memory:')
  db.prepare("INSERT INTO senders (uid, display_name) VALUES ('111', 'Đức')").run()
  const senders = new SenderStore(db)
  let t = 10 * DAY
  const calls: string[] = []
  const updated: string[] = []
  const queue = new QrQueue({
    senders,
    getQr: async (uid) => { calls.push(uid); if (opts.fail) throw new Error('mạng'); return opts.qrUrl ? { [uid]: opts.qrUrl } : {} },
    decode: async () => opts.decoded ?? null,
    onUpdated: (uid) => { updated.push(uid); if (opts.onUpdatedThrows) throw new Error('lỗi callback') },
    refreshMs: 7 * DAY, errorRetryMs: 3_600_000, logger: silentLogger, now: () => t,
  })
  return { senders, queue, calls, updated, advance: (ms: number) => { t += ms } }
}

test('extractQrCode reads the code from a Zalo QR link', () => {
  assert.equal(extractQrCode('http://zaloapp.com/qr/p/758z6tl22yft'), '758z6tl22yft')
  assert.equal(extractQrCode('https://example.com'), null)
  assert.equal(extractQrCode(null), null)
})

test('fetches, decodes and stores the code once, then notifies', async () => {
  const h = harness({ qrUrl: 'https://qr-talk.zdn.vn/x.jpg', decoded: 'http://zaloapp.com/qr/p/758z6tl22yft' })
  h.queue.ensure('111')
  h.queue.ensure('111')
  assert.equal(h.queue.size, 1)
  await h.queue.step()
  assert.equal(h.senders.qr('111').code, '758z6tl22yft')
  assert.deepEqual(h.updated, ['111'])
  h.queue.ensure('111')
  assert.equal(h.queue.size, 0) // còn mới → không xếp lại
})

test('empty QR is not retried within the refresh period; force overrides', async () => {
  const h = harness({ qrUrl: undefined })
  h.queue.ensure('111')
  await h.queue.step()
  assert.equal(h.senders.qr('111').status, 'empty')
  assert.deepEqual(h.updated, []) // 'empty' không báo
  h.queue.ensure('111')
  assert.equal(h.queue.size, 0)
  h.queue.force('111') // Laravel yêu cầu lấy lại → bỏ qua hạn
  assert.equal(h.queue.size, 1)
})

test('errors keep the old code and retry after an hour', async () => {
  const h = harness({ fail: true })
  h.senders.saveQr('111', 'oldcode', 'ok', 0)
  h.queue.force('111')
  await h.queue.step()
  assert.deepEqual(h.senders.qr('111'), { code: 'oldcode', fetchedAt: 10 * DAY, status: 'error' })
  assert.deepEqual(h.updated, []) // 'error' không báo
  h.queue.ensure('111')
  assert.equal(h.queue.size, 0)
  h.advance(3_600_001)
  h.queue.ensure('111')
  assert.equal(h.queue.size, 1)
})

test('onUpdated throwing does not corrupt the just-saved ok status', async () => {
  const h = harness({ qrUrl: 'https://qr-talk.zdn.vn/x.jpg', decoded: 'http://zaloapp.com/qr/p/758z6tl22yft', onUpdatedThrows: true })
  h.queue.force('111')
  await h.queue.step()
  assert.deepEqual(h.senders.qr('111'), { code: '758z6tl22yft', fetchedAt: 10 * DAY, status: 'ok' })
  assert.deepEqual(h.updated, ['111']) // callback đã được gọi (và đã ném lỗi) nhưng không ảnh hưởng mã đã lưu
})

test('step on an empty queue does nothing', async () => {
  const h = harness()
  await h.queue.step()
  assert.deepEqual(h.calls, [])
})
