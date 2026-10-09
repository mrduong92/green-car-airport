import { test } from 'node:test'
import assert from 'node:assert/strict'
import type OpenAI from 'openai'
import { OpenAiExtractor } from '../src/ai/openai-extractor.js'
import { AiCallError } from '../src/ai/queue.js'

const VN = 7 * 3_600_000
const SENT = Date.parse('2026-10-04T01:30:00Z') - VN

function fakeClient(response: unknown, capture?: (params: Record<string, unknown>) => void) {
  return {
    chat: {
      completions: {
        parse: async (params: Record<string, unknown>) => {
          capture?.(params)
          return response
        },
      },
    },
  } as unknown as OpenAI
}

function okResponse(parsed: unknown, usage = { prompt_tokens: 1200, completion_tokens: 300 }) {
  return { choices: [{ finish_reason: 'stop', message: { parsed } }], usage }
}

test('maps AI rides to drafts, resolving time in Vietnam time', async () => {
  let params: Record<string, unknown> = {}
  const extractor = new OpenAiExtractor(fakeClient(okResponse({
    results: [
      { id: 7, is_ride: true, rides: [{ direction: 'to_airport', pickup: '89 Quan Nhân', destination: 'Sân bay Nội Bài', pickup_time: '08:30', pickup_date: null, seats: 7, vehicle_note: 'vf6', price_vnd: 600000, is_free: false }] },
      { id: 8, is_ride: false, rides: [] },
    ],
  }), (p) => { params = p }), 'gpt-4.1-mini')

  const out = await extractor.extract([{ id: 7, content: "8h30' tiễn 89 Quan Nhân ...", sentAt: SENT }, { id: 8, content: 'chào cả nhà', sentAt: SENT }])

  assert.equal(params.model, 'gpt-4.1-mini')
  assert.ok(params.response_format)
  assert.equal(params.max_completion_tokens, 16000)
  assert.equal(params.temperature, 0) // không phải gpt-5 → ép nhiệt độ 0 cho kết quả ổn định
  assert.equal(params.reasoning_effort, undefined)
  assert.deepEqual({ inputTokens: out.inputTokens, outputTokens: out.outputTokens }, { inputTokens: 1200, outputTokens: 300 })
  const ride = out.outcomes[0].rides[0]
  assert.equal(out.outcomes[0].isRide, true)
  assert.equal(ride.pickup, '89 Quan Nhân')
  assert.equal(new Date(ride.pickupAt! + VN).toISOString().slice(0, 16), '2026-10-04T08:30')
  assert.equal(ride.seats, 7)
  assert.equal(ride.price, 600000)
  assert.equal(ride.rawText, "8h30' tiễn 89 Quan Nhân ...")
  assert.deepEqual(out.outcomes[1], { id: 8, isRide: false, rides: [] })
})

test('a gpt-5 model gets reasoning_effort minimal and no temperature', async () => {
  let params: Record<string, unknown> = {}
  const extractor = new OpenAiExtractor(fakeClient(okResponse({ results: [] }), (p) => { params = p }), 'gpt-5-nano')
  await extractor.extract([{ id: 1, content: 'x', sentAt: SENT }])
  assert.equal(params.reasoning_effort, 'minimal')
  assert.equal(params.temperature, undefined)
})

test('missing ids in the AI answer are treated as not rides', async () => {
  const extractor = new OpenAiExtractor(fakeClient(okResponse({ results: [] })), 'gpt-4.1-mini')
  const out = await extractor.extract([{ id: 1, content: 'x', sentAt: SENT }])
  assert.deepEqual(out.outcomes, [{ id: 1, isRide: false, rides: [] }])
})

test('an unparseable answer throws so the batch is retried', async () => {
  const extractor = new OpenAiExtractor(fakeClient(okResponse(null)), 'gpt-4.1-mini')
  await assert.rejects(extractor.extract([{ id: 1, content: 'x', sentAt: SENT }]), /không trả kết quả hợp lệ/)
})

test('an unparseable answer carries the usage of the failed call, so it still gets billed', async () => {
  const extractor = new OpenAiExtractor(fakeClient(okResponse(null, { prompt_tokens: 1200, completion_tokens: 300 })), 'gpt-4.1-mini')
  await assert.rejects(extractor.extract([{ id: 1, content: 'x', sentAt: SENT }]), (err: unknown) => {
    assert.ok(err instanceof AiCallError)
    assert.deepEqual(err.usage, { input_tokens: 1200, output_tokens: 300 })
    return true
  })
})
