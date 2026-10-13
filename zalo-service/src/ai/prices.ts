// Bảng giá AI theo model (USD / 1 triệu token), dùng để tính ngân sách ngày (AiUsage).
// Model lạ (chưa có trong bảng — ví dụ gõ sai tên hoặc OpenAI/Anthropic ra model mới) → trả giá
// cao nhất bảng cho từng chiều vào/ra, để không vô tình tính thiếu và vượt trần ngân sách.
export interface ModelPrice {
  inputPerM: number
  outputPerM: number
}

const PRICES: Record<string, ModelPrice> = {
  'gpt-4.1-mini': { inputPerM: 0.4, outputPerM: 1.6 },
  'gpt-4.1': { inputPerM: 2, outputPerM: 8 },
  'gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.6 },
  'gpt-4.1-nano': { inputPerM: 0.1, outputPerM: 0.4 },
  'gpt-5-nano': { inputPerM: 0.05, outputPerM: 0.4 },
  'claude-haiku-4-5': { inputPerM: 1, outputPerM: 5 },
}

const HIGHEST: ModelPrice = {
  inputPerM: Math.max(...Object.values(PRICES).map((p) => p.inputPerM)),
  outputPerM: Math.max(...Object.values(PRICES).map((p) => p.outputPerM)),
}

// Khớp theo tiền tố (ranh giới dấu "-") để các bản có ngày (vd. "gpt-4.1-mini-2025-04-14",
// OpenAI/Anthropic chốt một snapshot cụ thể) vẫn nhận đúng giá của model gốc thay vì rơi vào HIGHEST.
// Khớp dài nhất thắng: "gpt-4.1-mini" (dài hơn) thắng "gpt-4.1" cho model "gpt-4.1-mini-2025-04-14".
export function priceFor(model: string): ModelPrice {
  let best: { key: string; price: ModelPrice } | null = null
  for (const [key, price] of Object.entries(PRICES)) {
    if ((model === key || model.startsWith(`${key}-`)) && (!best || key.length > best.key.length)) {
      best = { key, price }
    }
  }
  return best?.price ?? HIGHEST
}
