import { z } from 'zod'
import { resolvePickupAt } from '../parser/time.js'
import { sanitizeDraft, type RideDraft } from '../parser/rules.js'
import type { AiItem } from './queue.js'

// Schema + prompt dùng chung cho mọi provider AI (Anthropic, OpenAI...) — tách riêng để không lặp lại
// giữa các Extractor khi thêm provider mới.
export const RideSchema = z.object({
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

export const ResultSchema = z.object({
  results: z.array(z.object({ id: z.number().int(), is_ride: z.boolean(), rides: z.array(RideSchema) })),
})

// Prompt cố định (không chèn giờ/ID động) — mọi lô dùng chung một tiền tố.
export const SYSTEM_PROMPT = `Bạn tách thông tin cuốc xe từ tin nhắn trong các nhóm Zalo bắn cuốc xe sân bay Nội Bài (Hà Nội).
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
Tin dạng "A → B", "A - B", "A đi B", "A về B": A là điểm đón, B là điểm đến. Sân bay (T1, T2, NB, sb, Nội Bài) ở A → direction=from_airport, pickup="Sân bay Nội Bài"; ở B → direction=to_airport, destination="Sân bay Nội Bài".
Giữ nguyên tên địa điểm như trong tin, không tự bịa thông tin không có.`

export function toDraft(r: z.infer<typeof RideSchema>, item: AiItem): RideDraft {
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
