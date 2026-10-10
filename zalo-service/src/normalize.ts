export interface MessageItem {
  group_id: string
  group_name: string
  msg_id: string
  sender_uid: string
  sender_name: string
  content: string
  sent_at: number
}

// Tập con trường của tin zca-js mà service dùng (tránh phụ thuộc kiểu nội bộ của thư viện).
export interface IncomingMessage {
  type: number
  isSelf: boolean
  threadId: string
  data: { msgId: string; uidFrom: string; dName?: string; ts: string; content: unknown }
}

const THREAD_TYPE_GROUP = 1 // ThreadType.Group của zca-js

// Chỉ lấy tin CHỮ trong nhóm; ảnh/sticker/file được đếm rồi bỏ. group_name điền sau (GroupNames).
export function toItem(message: IncomingMessage): { item: MessageItem } | { skip: 'not_group' | 'non_text' } {
  if (message.type !== THREAD_TYPE_GROUP || message.isSelf) return { skip: 'not_group' }

  const d = message.data
  if (typeof d.content !== 'string' || d.content.trim() === '') return { skip: 'non_text' }

  return {
    item: {
      group_id: String(message.threadId),
      group_name: '',
      msg_id: String(d.msgId),
      sender_uid: String(d.uidFrom),
      sender_name: d.dName ?? '',
      content: d.content,
      sent_at: Number(d.ts),
    },
  }
}
