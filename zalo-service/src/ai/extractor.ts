import type Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { resolvePickupAt } from '../parser/time.js'
import { sanitizeDraft, type RideDraft } from '../parser/rules.js'
import { AiCallError, type AiItem, type AiOutcome, type Extractor } from './queue.js'

const RideSchema = z.object({
  direction: z.enum(['to_airport', 'from_airport', 'other']),
  pickup: z.string().nullable(),
  destination: z.string().nullable(),
  pickup_time: z.string().nullable(),
  pickup_date: z.string().nullable(),
  seats: z.number().int().nullable(),
  vehicle_note: z.string().nullable(),
  price_vnd: z.number().int().nullable(),
  is_free: z.boolean(),
})

const ResultSchema = z.object({
  results: z.array(z.object({ id: z.number().int(), is_ride: z.boolean(), rides: z.array(RideSchema) })),
})

// Prompt cố định (không chèn giờ/ID động) — mọi lô dùng chung một tiền tố.
const SYSTEM_PROMPT = `Bạn tách thông tin cuốc xe từ tin nhắn trong các nhóm Zalo bắn cuốc xe sân bay Nội Bài (Hà Nội).
Với mỗi tin (có "id"), trả is_ride=false nếu là tán gẫu, hỏi han, quảng cáo, tìm khách, xin việc hoặc không đủ thông tin một chuyến đi.
Một tin có thể chứa nhiều cuốc (mỗi dòng một giờ khác nhau) → trả nhiều phần tử trong rides.
Thuật ngữ:
- "tiễn" = chở khách ra sân bay Nội Bài (direction=to_airport, destination="Sân bay Nội Bài").
- "đón" ở sân bay = đón khách từ sân bay (direction=from_airport, pickup="Sân bay Nội Bài"). "T1", "T2", "NB", "sb" = sân bay Nội Bài.
- Không liên quan sân bay → direction=other.
- Giá: "200k"=200000, "1tr2"=1200000, "280,000đ"=280000. "1k" thường là 1 khách, không phải giá.
- "ck", "TK 0.25" là chiết khấu/phí cho người bắn, không phải giá. "free", "feee", "ko thu ck" = không thu chiết khấu → is_free=true.
- "xe 5", "5c", "5 chỗ" → seats=5. "limo", "vf8", "x7" → vehicle_note.
- Giờ: trả pickup_time dạng "HH:MM" (24h). "15-16h" → "15:00". "0-30p" (trong 30 phút) hoặc không có giờ → null. Ngày "4/10" → pickup_date "04/10".
Giữ nguyên tên địa điểm như trong tin, không tự bịa thông tin không có.`

function toDraft(r: z.infer<typeof RideSchema>, item: AiItem): RideDraft {
  let pickupAt: number | null = null
  const time = r.pickup_time ? /^(\d{1,2}):(\d{2})$/.exec(r.pickup_time) : null
  if (time) {
    const date = r.pickup_date ? /^(\d{1,2})\/(\d{1,2})$/.exec(r.pickup_date) : null
    pickupAt = resolvePickupAt(item.sentAt, Number(time[1]), Number(time[2]), date ? Number(date[1]) : null, date ? Number(date[2]) : null)
  }
  // AI có thể trả giá trị ngoài khoảng Laravel nhận (ghế 0, giá âm, ghi chú dài...) → cắt/bỏ trường đó, giữ cuốc.
  return sanitizeDraft({
    direction: r.direction,
    pickup: r.pickup,
    destination: r.destination,
    pickupAt,
    pickupTimeText: r.pickup_time,
    seats: r.seats,
    vehicleNote: r.vehicle_note,
    price: r.price_vnd,
    isFree: r.is_free,
    rawText: item.content,
  })
}

export class AnthropicExtractor implements Extractor {
  constructor(private readonly client: Anthropic, private readonly model: string) {}

  async extract(items: AiItem[]): Promise<{ outcomes: AiOutcome[]; inputTokens: number; outputTokens: number }> {
    const response = await this.client.messages.parse({
      model: this.model,
      // Lô tối đa batchSize (mặc định 20) tin, mỗi tin có thể nhiều cuốc → 4096 token dễ bị cắt cụt
      // (JSON dở dang không parse được, cả lô phải gọi lại). 16000 vẫn nằm dưới ngưỡng không cần
      // streaming của SDK cho model này (xác minh bằng client.calculateNonstreamingTimeout — model
      // claude-haiku-4-5 không có trong MODEL_NONSTREAMING_TOKENS nên ngưỡng chung ~21333 token áp dụng).
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(items.map((i) => ({ id: i.id, text: i.content }))) }],
      output_config: { format: zodOutputFormat(ResultSchema) },
    })

    const parsed = response.parsed_output
    // Kèm usage của phản hồi lỗi này (đã có response, đã bị tính phí) để hàng chờ vẫn ghi vào
    // spentToday() — nếu không, lần gọi tốn tiền nhưng không dùng được sẽ không bị tính vào ngân sách.
    if (!parsed) throw new AiCallError(`AI không trả kết quả hợp lệ (stop_reason ${response.stop_reason})`, response.usage)

    const outcomes = items.map((item): AiOutcome => {
      const r = parsed.results.find((x) => x.id === item.id)
      if (!r || !r.is_ride || r.rides.length === 0) return { id: item.id, isRide: false, rides: [] }
      return { id: item.id, isRide: true, rides: r.rides.map((ride) => toDraft(ride, item)) }
    })
    return { outcomes, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
  }
}
