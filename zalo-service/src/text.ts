import { createHash } from 'node:crypto'

// Bỏ ký tự vô hình, gộp khoảng trắng, chữ thường — giữ nguyên dấu tiếng Việt.
export function normalize(text: string): string {
  return text.replace(/[​-‍﻿]/g, '').replace(/\s+/gu, ' ').trim().toLowerCase()
}

export function contentHash(senderUid: string, text: string): string {
  return createHash('sha256').update(`${senderUid}\n${normalize(text)}`).digest('hex')
}

// Dấu hiệu "có giờ" (5h, 4h15, 7h00, 12:30). Chỉ dùng ước lượng tỷ lệ tin giống cuốc
// trong thống kê — KHÔNG dùng để quyết định tin có phải cuốc hay không.
export function looksTimed(text: string): boolean {
  return /(?<!\d)\d{1,2}\s*(?:h|g|:)\s*\d{0,2}/iu.test(text)
}
