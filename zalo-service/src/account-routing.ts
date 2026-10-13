import type { Db } from './db.js'

/**
 * Chọn nick để gọi Zalo thay mặt một người gửi / một nhóm. Zalo chỉ trả getQR / getGroupInfo cho nick có
 * chung nhóm: gọi qua nick khác bị lỗi "Tham số không hợp lệ" → người gửi bị đánh lỗi mã QR, cuốc bị giữ lại.
 * Thứ tự: nick liên quan trước (nhận tin gần nhất của người gửi / đang ở nhóm), rồi các nick còn lại.
 */
export function accountsForSender(db: Db, senderUid: string, loggedIn: string[]): string[] {
  const rows = db.prepare(`SELECT account_id FROM messages WHERE sender_uid = ?
    GROUP BY account_id ORDER BY MAX(sent_at) DESC`).all(senderUid) as { account_id: string }[]
  return prefer(rows.map((r) => r.account_id), loggedIn)
}

export function accountsForGroup(db: Db, groupId: string, loggedIn: string[]): string[] {
  const rows = db.prepare('SELECT account_id FROM group_accounts WHERE zalo_group_id = ? ORDER BY account_id')
    .all(groupId) as { account_id: string }[]
  return prefer(rows.map((r) => r.account_id), loggedIn)
}

function prefer(preferred: string[], loggedIn: string[]): string[] {
  const first = preferred.filter((id) => loggedIn.includes(id))
  return [...first, ...loggedIn.filter((id) => !first.includes(id))]
}

// Thử lần lượt từng nick, trả kết quả đầu tiên thành công; hỏng hết thì ném lỗi cuối cùng.
export async function tryAccounts<T>(ids: string[], call: (id: string) => Promise<T>): Promise<T> {
  if (ids.length === 0) throw new Error('Chưa có tài khoản nào đăng nhập')
  let last: unknown
  for (const id of ids) {
    try {
      return await call(id)
    } catch (err) {
      last = err
    }
  }
  throw last
}
