import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toItem, type IncomingMessage } from '../src/normalize.js'

const groupText: IncomingMessage = {
  type: 1, isSelf: false, threadId: '2654386762368849522',
  data: { msgId: '7001', uidFrom: '111', dName: 'Hoàng Anh Đức', ts: '1730000000123', content: 'tiễn 4h15 phố cổ' },
}

test('maps a group text message to an item', () => {
  assert.deepEqual(toItem(groupText), {
    item: {
      group_id: '2654386762368849522', group_name: '', msg_id: '7001', sender_uid: '111',
      sender_name: 'Hoàng Anh Đức', content: 'tiễn 4h15 phố cổ', sent_at: 1730000000123,
    },
  })
})

test('skips direct messages and own messages', () => {
  assert.deepEqual(toItem({ ...groupText, type: 0 }), { skip: 'not_group' })
  assert.deepEqual(toItem({ ...groupText, isSelf: true }), { skip: 'not_group' })
})

test('skips stickers, images and blank text', () => {
  assert.deepEqual(toItem({ ...groupText, data: { ...groupText.data, content: { href: 'x.jpg' } } }), { skip: 'non_text' })
  assert.deepEqual(toItem({ ...groupText, data: { ...groupText.data, content: '   ' } }), { skip: 'non_text' })
})
