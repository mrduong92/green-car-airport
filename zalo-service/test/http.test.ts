import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSender } from '../src/http.js'
import { sign } from '../src/sign.js'

test('posts signed JSON and returns the status', async () => {
  let captured: { url: string; init: RequestInit } | undefined
  const fetchImpl = (async (url: string, init: RequestInit) => {
    captured = { url, init }
    return { status: 200 } as Response
  }) as unknown as typeof fetch
  const send = createSender({ baseUrl: 'https://greenca.vn', secret: 's', fetchImpl })

  const res = await send('/api/internal/zalo/heartbeat', { service_id: 'zalo-1' })

  assert.deepEqual(res, { status: 200 })
  assert.ok(captured)
  assert.equal(captured.url, 'https://greenca.vn/api/internal/zalo/heartbeat')
  assert.equal(captured.init.body, '{"service_id":"zalo-1"}')
  const headers = captured.init.headers as Record<string, string>
  const expected = sign('s', '{"service_id":"zalo-1"}', Number(headers['X-Zalo-Timestamp']) * 1000).signature
  assert.equal(headers['X-Zalo-Signature'], expected)
})

test('returns status 0 instead of throwing on network error', async () => {
  const fetchImpl = (async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch
  const send = createSender({ baseUrl: 'https://x', secret: 's', fetchImpl })

  const res = await send('/p', {})

  assert.equal(res.status, 0)
  assert.match(res.error ?? '', /ECONNREFUSED/)
})

test('returns the parsed JSON body (rejected indexes from Laravel)', async () => {
  const fetchImpl = (async () => ({ status: 200, json: async () => ({ stored: 1, rejected: [2] }) }) as unknown as Response) as unknown as typeof fetch
  const send = createSender({ baseUrl: 'https://x', secret: 's', fetchImpl })

  assert.deepEqual(await send('/p', {}), { status: 200, body: { stored: 1, rejected: [2] } })
})
