import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GroupNames } from '../src/groups.js'

test('fetches once, caches, and refreshes after ttl', async () => {
  let calls = 0
  let t = 0
  const names = new GroupNames({ fetchName: async () => `Nhóm ${++calls}`, ttlMs: 1000, now: () => t })
  assert.equal(await names.get('g1'), 'Nhóm 1')
  assert.equal(await names.get('g1'), 'Nhóm 1')
  assert.equal(calls, 1)
  t = 2000
  assert.equal(await names.get('g1'), 'Nhóm 2')
})

test('concurrent lookups share one request', async () => {
  let calls = 0
  const names = new GroupNames({ fetchName: async () => { calls++; return 'A' } })
  await Promise.all([names.get('g1'), names.get('g1'), names.get('g1')])
  assert.equal(calls, 1)
})

test('falls back to the previous name (or empty) when lookup fails', async () => {
  let t = 0
  let fail = false
  const names = new GroupNames({ fetchName: async () => { if (fail) throw new Error('x'); return 'Cũ' }, ttlMs: 10, now: () => t })
  assert.equal(await names.get('g1'), 'Cũ')
  fail = true
  t = 100
  assert.equal(await names.get('g1'), 'Cũ')
  assert.equal(await names.get('g2'), '')
})

test('a failed lookup is cached too — no getGroupInfo call per message', async () => {
  let calls = 0
  const names = new GroupNames({ fetchName: async () => { calls++; throw new Error('x') } })
  await names.get('g1')
  await names.get('g1')
  await names.get('g1')
  assert.equal(calls, 1)
})
