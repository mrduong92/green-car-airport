import type Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { AiCallError, type AiItem, type AiOutcome, type Extractor } from './queue.js'
import { ResultSchema, SYSTEM_PROMPT, toDraft } from './prompt.js'

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
