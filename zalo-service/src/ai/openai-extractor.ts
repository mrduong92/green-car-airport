import type OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import { AiCallError, type AiItem, type AiOutcome, type Extractor } from './queue.js'
import { ResultSchema, SYSTEM_PROMPT, toDraft } from './prompt.js'

// Chỉ 3 model reasoning có trong bảng giá (prices.ts): gpt-5, gpt-5-mini, gpt-5-nano (và bản có ngày,
// vd. gpt-5-nano-2025-08-07) — không nhận temperature tuỳ chỉnh (luôn mặc định), nhưng có reasoning_effort,
// đặt 'minimal' để giảm token/suy luận ẩn cho tác vụ tách cuốc đơn giản này. KHÔNG áp dụng cho các biến
// thể gpt-5 khác (gpt-5-pro, gpt-5-codex...) — chưa rõ các model đó có nhận temperature hay không.
const GPT5_REASONING_MODEL = /^gpt-5(?:-mini|-nano)?(?:-\d{4}-\d{2}-\d{2})?$/

export class OpenAiExtractor implements Extractor {
  constructor(private readonly client: OpenAI, private readonly model: string) {}

  async extract(items: AiItem[]): Promise<{ outcomes: AiOutcome[]; inputTokens: number; outputTokens: number }> {
    const isGpt5 = GPT5_REASONING_MODEL.test(this.model)
    const response = await this.client.chat.completions.parse({
      model: this.model,
      // Lô tối đa batchSize (mặc định 20) tin, mỗi tin có thể nhiều cuốc → cần token lớn để JSON
      // không bị cắt cụt giữa chừng (không parse được, cả lô phải gọi lại). Cùng mức với Anthropic.
      max_completion_tokens: 16000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(items.map((i) => ({ id: i.id, text: i.content }))) },
      ],
      response_format: zodResponseFormat(ResultSchema, 'rides'),
      // temperature=0 cho kết quả tách cuốc ổn định hơn — model gpt-5* không hỗ trợ tham số này.
      ...(isGpt5 ? { reasoning_effort: 'minimal' as const } : { temperature: 0 }),
    })

    const choice = response.choices[0]
    const parsed = choice?.message.parsed ?? null
    const usage = response.usage
    const aiUsage = usage ? { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens } : undefined
    // Kèm usage của phản hồi lỗi này (đã có response, đã bị tính phí) để hàng chờ vẫn ghi vào
    // spentToday() — nếu không, lần gọi tốn tiền nhưng không dùng được sẽ không bị tính vào ngân sách.
    if (!parsed) throw new AiCallError(`AI không trả kết quả hợp lệ (finish_reason ${choice?.finish_reason})`, aiUsage)

    const outcomes = items.map((item): AiOutcome => {
      const r = parsed.results.find((x) => x.id === item.id)
      if (!r || !r.is_ride || r.rides.length === 0) return { id: item.id, isRide: false, rides: [] }
      return { id: item.id, isRide: true, rides: r.rides.map((ride) => toDraft(ride, item)) }
    })
    return { outcomes, inputTokens: usage?.prompt_tokens ?? 0, outputTokens: usage?.completion_tokens ?? 0 }
  }
}
