import type { GroupNames } from './groups.js'
import { toItem, type IncomingMessage } from './normalize.js'
import type { MessageStore, SaveResult } from './store.js'

export interface ServiceCounters {
  received: number
  stored: number // gồm cả tin duplicate (vẫn được lưu để thống kê)
  duplicates: number
  ignored: number
  skippedNonText: number
  skippedOtherGroup: number
  lastMessageAt: number | null
}

export function newCounters(): ServiceCounters {
  return { received: 0, stored: 0, duplicates: 0, ignored: 0, skippedNonText: 0, skippedOtherGroup: 0, lastMessageAt: null }
}

// Xử lý MỘT tin ngay khi listener nhận (sơ đồ 6.2): chuẩn hoá → LƯU NGAY (tên nhóm đã biết hoặc rỗng)
// → bộ đếm; tên nhóm tra trên Zalo ở nền rồi cập nhật sau — không để tin chờ một lời gọi mạng.
export function createIngestor(deps: {
  store: MessageStore
  groups: GroupNames
  counters: ServiceCounters
  // Chỉ nhận tin từ các nhóm này (rỗng/không truyền = mọi nhóm).
  allowedGroupIds?: Set<string>
  // Người gửi của tin đã lưu → lấy mã deeplink (QrQueue.ensure).
  onSender?: (senderUid: string) => void
  now?: () => number
}): (accountId: string, message: IncomingMessage) => Promise<SaveResult | 'not_group' | 'non_text' | 'other_group'> {
  const now = deps.now ?? (() => Date.now())

  return async (accountId, message) => {
    deps.counters.received++

    const result = toItem(message)
    if ('skip' in result) {
      if (result.skip === 'non_text') deps.counters.skippedNonText++
      return result.skip
    }

    const groupId = result.item.group_id
    if (deps.allowedGroupIds && deps.allowedGroupIds.size > 0 && !deps.allowedGroupIds.has(groupId)) {
      deps.counters.skippedOtherGroup++
      return 'other_group'
    }

    const item = { ...result.item, group_name: deps.groups.peek(groupId) ?? '' }
    const saved = deps.store.save(item, accountId, now())

    void deps.groups.get(groupId).then((name) => {
      if (name !== '' && name !== item.group_name) deps.store.setGroupName(groupId, name)
    })

    if (saved === 'ignored') {
      deps.counters.ignored++
    } else {
      deps.counters.stored++
      if (saved === 'duplicate') deps.counters.duplicates++
      deps.counters.lastMessageAt = now()
      deps.onSender?.(item.sender_uid)
    }
    return saved
  }
}
