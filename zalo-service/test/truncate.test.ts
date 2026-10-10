import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncate } from '../src/text.js'
import { sanitizeDraft } from '../src/parser/rules.js'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'

// Cắt theo đơn vị UTF-16 có thể để lại nửa emoji (surrogate lẻ) → JSON gửi Laravel có "\ud83d" lẻ,
// PHP json_decode từ chối CẢ LÔ cuốc → hộp thư đi kẹt tới khi cuốc hết hạn.
const hasLoneSurrogate = (s: string) => /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(s)

test('truncate counts characters (code points), never splits an emoji', () => {
  const s = 'a'.repeat(31) + '🚗🚗'
  assert.equal(truncate(s, 32), 'a'.repeat(31) + '🚗')
  assert.equal(truncate('xe 7 chỗ', 32), 'xe 7 chỗ')
  assert.ok(!hasLoneSurrogate(truncate('🚗'.repeat(40), 33)))
})

test('sanitizeDraft does not leave half an emoji in short fields', () => {
  const note = 'x'.repeat(31) + '🚗 innova'
  const d = sanitizeDraft({ direction: 'to_airport', pickup: 'Hà Đông', destination: 'Nội Bài', pickupAt: null, pickupTimeText: note, seats: null, vehicleNote: note, price: null, isFree: false, rawText: note })
  assert.ok(!hasLoneSurrogate(d.vehicleNote!))
  assert.ok(!hasLoneSurrogate(d.pickupTimeText!))
})

// SQLite đổi surrogate lẻ thành U+FFFD khi lưu → không hỏng JSON nhưng hiện ký tự lỗi "�" cho tài xế.
test('stored content, sender and group names never end with half an emoji', () => {
  const db = openDb(':memory:')
  const store = new MessageStore(db, { duplicateWindowMs: 3_600_000, maxContentLength: 10, retentionMs: 86_400_000 })
  const longName = 'n'.repeat(254) + '🚗'
  store.save({ group_id: 'g1', group_name: longName, msg_id: 'm1', sender_uid: '1', sender_name: longName, content: 'c'.repeat(9) + '🚗🚗', sent_at: 1 }, 'acc1')
  const row = db.prepare('SELECT m.content, s.display_name, g.name FROM messages m JOIN senders s ON s.uid = m.sender_uid JOIN chat_groups g ON g.zalo_group_id = m.zalo_group_id').get() as Record<string, string>
  for (const v of Object.values(row)) assert.ok(!hasLoneSurrogate(v) && !v.includes('\uFFFD'), JSON.stringify(v))
})
