import { useCallback, useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { getFreeRides } from '@/api/freeRides'
import { getEcho } from '@/echo'
import { useAuthStore } from '@/stores/auth'

type Pages = InfiniteData<App.FreeRidePage, string | null>

// Mọi tài xế đang mở tab Free nhận tín hiệu cùng lúc → rải ngẫu nhiên để không dồn N request (giống useDriverStream).
const HERD_SPREAD_MS = 3000

/**
 * Danh sách cuốc Free + cập nhật realtime. Chỉ trang Free gọi hook này, nên kênh `driver.free-rides`
 * chỉ mở khi tài xế đang xem tab — không tốn request cho người không xem.
 * Tín hiệu chỉ mang mốc `latest`; hook gọi `since=<mốc đã biết>` rồi gộp vào trang đầu theo ride_uid.
 */
export function useFreeRides(filters: App.FreeRideFilters) {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)

  // Tách field nguyên thuỷ thay vì phụ thuộc vào tham chiếu `filters`: caller truyền
  // object literal inline thì mỗi lần cha re-render là một tham chiếu mới, kéo theo
  // queryKey đổi, effect realtime tháo/gắn lại kênh — kể cả khi không có gì thực sự
  // đổi (vòng tick 30s bên dưới cũng khiến cha re-render nếu object inline).
  const direction = filters.direction ?? null
  const seats = filters.seats ?? null
  const windowFilter = filters.window ?? null
  const q = filters.q ?? null

  const queryKey = useMemo(
    () => ['free-rides', direction, seats, windowFilter, q] as const,
    [direction, seats, windowFilter, q],
  )
  const apiFilters = useMemo(
    () => ({
      direction: direction ?? undefined,
      seats: seats ?? undefined,
      window: windowFilter ?? undefined,
      q: q ?? undefined,
    }),
    [direction, seats, windowFilter, q],
  )

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => getFreeRides({ ...apiFilters, cursor: pageParam ?? undefined }).then((r) => r.data),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    refetchOnWindowFocus: true,
    // Bộ lọc toàn cục `staleTime: 30_000` (bootstrap.tsx) nghĩa là mặc định KHÔNG tải
    // lại khi mount/đổi queryKey trong 30s — vi phạm quy tắc "mở tab Free là tải lại
    // trang 1". Ghi đè riêng cho query này.
    refetchOnMount: 'always',
  })

  // Cắt về đúng trang 1 rồi tải lại — không dùng resetQueries vì nó xoá sạch cache
  // trước, màn hình nhấp nháy rỗng; và không dùng invalidateQueries suông vì nó tải
  // lại MỌI trang đã có (tốn request, không cần thiết — chỉ trang 1 có thể đổi).
  const trimToFirstPage = useCallback(() => {
    queryClient.setQueryData<Pages>(queryKey, (old) => {
      if (!old || old.pages.length <= 1) return old
      return { ...old, pages: old.pages.slice(0, 1), pageParams: old.pageParams.slice(0, 1) }
    })
    return queryClient.invalidateQueries({ queryKey })
  }, [queryClient, queryKey])

  const mergeSince = useCallback(async () => {
    // Mốc since đọc THẲNG từ cache của đúng bộ lọc đang xem (không giữ trong ref dùng
    // chung) — tài xế đổi bộ lọc qua lại thì mỗi bộ lọc có mốc riêng, không bị lẫn.
    const cached = queryClient.getQueryData<Pages>(queryKey)
    const since = cached?.pages[0]?.latest ?? null
    if (since === null) return

    const { data } = await getFreeRides({ ...apiFilters, since })

    // Server chạm trần SINCE_LIMIT (200 dòng): còn cuốc cũ hơn bị bỏ sót bởi
    // phép cắt "mới nhất trước". Gộp theo since lúc này sẽ thiếu dữ liệu, nên
    // phải nạp lại từ trang 1 thay vì gộp.
    if (data.reset) {
      await trimToFirstPage()
      return
    }

    const nextLatest = data.latest !== null ? Math.max(since, data.latest) : since

    queryClient.setQueryData<Pages>(queryKey, (old) => {
      if (!old) return old
      // Trong lúc chờ request, cache có thể đã được tải lại trang 1 với mốc mới hơn — không lùi mốc.
      const firstLatest = Math.max(nextLatest, old.pages[0]?.latest ?? 0)

      // Cuốc since trả về sắp theo updated_at, không phải posted_at — nếu chèn thẳng
      // vào đầu trang 1 thì cuốc cũ được "chạm" lại (vd. bị báo cáo) sẽ nhảy lên đầu
      // sai thứ tự, và cuốc thuộc một trang CHƯA tải sẽ bị nhân đôi khi fetchNextPage
      // tải tới trang đó. Quy tắc: cuốc đã có ở trang nào thì cập nhật tại chỗ; cuốc
      // mới chỉ chèn vào đầu nếu mới hơn cuốc cũ nhất đã tải — còn lại bỏ qua, để nó
      // tự xuất hiện đúng vị trí khi tài xế tải tới trang chứa nó.
      const lastPage = old.pages[old.pages.length - 1]
      const oldestLoaded = lastPage?.data[lastPage.data.length - 1] ?? null

      const existingUids = new Set<string>()
      old.pages.forEach((p) => p.data.forEach((r) => existingUids.add(r.ride_uid)))
      const updates = new Map(data.data.map((r) => [r.ride_uid, r]))

      const freshTop = data.data.filter((r) => !existingUids.has(r.ride_uid)
        && (!oldestLoaded || r.posted_at > oldestLoaded.posted_at))

      const pages = old.pages.map((page, i) => {
        let rows = page.data.map((r) => updates.get(r.ride_uid) ?? r)
        if (i === 0) {
          rows = [...rows, ...freshTop].sort((a, b) => b.posted_at - a.posted_at)
        }
        return { ...page, data: rows, latest: i === 0 ? firstLatest : page.latest }
      })

      return { ...old, pages }
    })
  }, [apiFilters, queryClient, queryKey, trimToFirstPage])

  useEffect(() => {
    if (!token) return
    const echo = getEcho(token)
    const channel = echo.private('driver.free-rides')
    const timers: ReturnType<typeof setTimeout>[] = []

    // Mỗi lần kênh private đăng ký xong — lần đầu VÀ sau mỗi lần kết nối lại (khoá màn hình /
    // mất mạng, pusher tự đăng ký lại kênh) — nạp lại trang 1 ngay, không rải (người dùng đang
    // nhìn). Lần đầu: lấp khoảng hở giữa lần tải ban đầu và lúc kênh sẵn sàng (tín hiệu phát
    // trong khoảng đó bị lỡ); đổi giá một request thừa khi mở tab. Kết nối lại: `since` không
    // báo được việc XOÁ (admin chặn người bắn / tắt nhóm) nên phải nạp lại trang 1, không gộp
    // since. Dùng `subscribed` thay cho sự kiện `connected` của socket vì `connected` tới TRƯỚC
    // khi kênh đăng ký xong — tải lúc đó vẫn còn hở.
    const resync = () => { void trimToFirstPage() }
    channel.subscribed(resync)

    channel.listen('.free-rides.updated', () => {
      timers.push(setTimeout(() => {
        mergeSince().catch((err: unknown) => console.error('[free-rides] gộp since thất bại', err))
      }, Math.random() * HERD_SPREAD_MS))
    })

    return () => {
      timers.forEach(clearTimeout)
      echo.leave('driver.free-rides')
    }
  }, [token, queryKey, mergeSince, trimToFirstPage])

  // `Date.now()` không được gọi thẳng trong thân hook (react-hooks/purity) — lấy mốc
  // giờ qua state, cập nhật mỗi 30s trong effect, để cuốc hết hạn tự rụng khỏi danh
  // sách ngay cả khi không có refetch/tín hiệu nào xảy ra.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])

  const rides = useMemo(() => {
    const all = (query.data?.pages ?? []).flatMap((p) => p.data)
    // Lưới an toàn: gộp since đã né trùng theo thiết kế, nhưng dedupe lại ở đây
    // phòng trường hợp hai trang trùng ride_uid (vd. dữ liệu dịch chuyển giữa lúc
    // tải các trang kế tiếp).
    const seen = new Set<string>()
    const deduped: App.FreeRide[] = []
    for (const r of all) {
      if (seen.has(r.ride_uid)) continue
      seen.add(r.ride_uid)
      deduped.push(r)
    }
    return now === null ? deduped : deduped.filter((r) => r.expires_at > now)
  }, [query.data, now])

  // Ẩn người bắn: bỏ ngay khỏi cache, không chờ tải lại.
  const removeSender = useCallback((senderUid: string) => {
    queryClient.setQueriesData<Pages>({ queryKey: ['free-rides'] }, (old) => old && ({
      ...old,
      pages: old.pages.map((p) => ({ ...p, data: p.data.filter((r) => r.sender_uid !== senderUid) })),
    }))
  }, [queryClient])

  return {
    rides,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: trimToFirstPage,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    removeSender,
  }
}
