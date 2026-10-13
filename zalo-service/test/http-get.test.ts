import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGetter } from '../src/http.js'
import { sign } from '../src/sign.js'

test('signs an empty body and returns parsed JSON', async () => {
  let captured: { url: string; init: RequestInit } | undefined
  const fetchImpl = (async (url: string, init: RequestInit) => {
    captured = { url, init }
    return { status: 200, json: async () => ({ ok: 1 }) } as unknown as Response
  }) as unknown as typeof fetch
  const get = createGetter({ baseUrl: 'https://greenca.vn', secret: 's', fetchImpl })

  const res = await get('/api/internal/zalo/config')

  assert.deepEqual(res, { status: 200, body: { ok: 1 } })
  assert.equal(captured?.init.method, 'GET')
  const headers = captured!.init.headers as Record<string, string>
  assert.equal(headers['X-Zalo-Signature'], sign('s', '', Number(headers['X-Zalo-Timestamp']) * 1000).signature)
})

test('returns status 0 on network error', async () => {
  const get = createGetter({ baseUrl: 'https://x', secret: 's', fetchImpl: (async () => { throw new Error('ETIMEDOUT') }) as unknown as typeof fetch })
  assert.equal((await get('/p')).status, 0)
})
