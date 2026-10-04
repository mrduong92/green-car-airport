import type { GroupNames } from './groups.js'
import { toItem, type IncomingMessage } from './normalize.js'
import type { MessageStore, SaveResult } from './store.js'

export interface ServiceCounters {
  received: number
  stored: number // gồm cả tin duplicate (vẫn được lưu để thống kê)
  duplicates: number
  ignored: number
  skippedNonText: number
  lastMessageAt: number | null
}

export function newCounters(): ServiceCounters {
  return { received: 0, stored: 0, duplicates: 0, ignored: 0, skippedNonText: 0, lastMessageAt: null }
}

// Xử lý MỘT tin ngay khi listener nhận (sơ đồ 6.2): chuẩn hoá → tên nhóm → lưu ngay → bộ đếm.
export function createIngestor(deps: {
  store: MessageStore
  groups: GroupNames
  counters: ServiceCounters
  now?: () => number
}): (accountId: string, message: IncomingMessage) => Promise<SaveResult | 'not_group' | 'non_text'> {
  const now = deps.now ?? (() => Date.now())

  return async (accountId, message) => {
    deps.counters.received++

    const result = toItem(message)
    if ('skip' in result) {
      if (result.skip === 'non_text') deps.counters.skippedNonText++
      return result.skip
    }

    const item = { ...result.item, group_name: await deps.groups.get(result.item.group_id) }
    const saved = deps.store.save(item, accountId, now())

    if (saved === 'ignored') {
      deps.counters.ignored++
    } else {
      deps.counters.stored++
      if (saved === 'duplicate') deps.counters.duplicates++
      deps.counters.lastMessageAt = now()
    }
    return saved
  }
}
