// Cache tên nhóm: tin zca-js không kèm tên nhóm, phải hỏi getGroupInfo.
// Lỗi tra cứu thì dùng tên cũ (hoặc rỗng — store không ghi đè tên đã biết bằng tên rỗng)
// và CACHE LUÔN kết quả dự phòng: không cache thì mỗi tin của nhóm lỗi lại gọi Zalo một lần,
// dễ làm tài khoản phụ bị chú ý.
export class GroupNames {
  private readonly fetchName: (groupId: string) => Promise<string>
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly cache = new Map<string, { name: string; at: number }>()
  private readonly pending = new Map<string, Promise<string>>()

  constructor(opts: { fetchName: (groupId: string) => Promise<string>; ttlMs?: number; now?: () => number }) {
    this.fetchName = opts.fetchName
    this.ttlMs = opts.ttlMs ?? 6 * 3_600_000
    this.now = opts.now ?? (() => Date.now())
  }

  // Tên đã biết (kể cả đã quá hạn), không gọi Zalo — dùng để lưu tin ngay không phải chờ.
  peek(groupId: string): string | undefined {
    return this.cache.get(groupId)?.name
  }

  get(groupId: string): Promise<string> {
    const hit = this.cache.get(groupId)
    if (hit && this.now() - hit.at < this.ttlMs) return Promise.resolve(hit.name)

    const inFlight = this.pending.get(groupId)
    if (inFlight) return inFlight

    const lookup = this.fetchName(groupId)
      .catch(() => hit?.name ?? '')
      .then((name) => {
        this.cache.set(groupId, { name, at: this.now() })
        return name
      })
      .finally(() => this.pending.delete(groupId))

    this.pending.set(groupId, lookup)
    return lookup
  }
}
