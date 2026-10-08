import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const queryKey = useMemo(() => ['free-rides', filters] as const, [filters])
  const latestRef = useRef<number | null>(null)

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => getFreeRides({ ...filters, cursor: pageParam ?? undefined }).then((r) => r.data),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    refetchOnWindowFocus: true,
  })

  const firstLatest = query.data?.pages[0]?.latest ?? null
  useEffect(() => {
    if (firstLatest !== null && (latestRef.current === null || firstLatest > latestRef.current)) {
      latestRef.current = firstLatest
    }
  }, [firstLatest])

  const mergeSince = useCallback(async () => {
    const since = latestRef.current
    if (since === null) return
    const { data } = await getFreeRides({ ...filters, since })

    // Server chạm trần SINCE_LIMIT (200 dòng): còn cuốc cũ hơn bị bỏ sót bởi
    // phép cắt "mới nhất trước". Gộp theo since lúc này sẽ thiếu dữ liệu, nên
    // phải nạp lại từ trang 1 thay vì gộp.
    if (data.reset) {
      latestRef.current = null
      await queryClient.resetQueries({ queryKey })
      return
    }

    if (data.latest !== null) latestRef.current = Math.max(latestRef.current ?? 0, data.latest)
    if (data.data.length === 0) return

    queryClient.setQueryData<Pages>(queryKey, (old) => {
      if (!old) return old
      const fresh = new Map(data.data.map((r) => [r.ride_uid, r]))
      const pages = old.pages.map((page, i) => ({
        ...page,
        data: i === 0
          ? [...data.data, ...page.data.filter((r) => !fresh.has(r.ride_uid))]
          : page.data.filter((r) => !fresh.has(r.ride_uid)),
      }))
      return { ...old, pages }
    })
  }, [filters, queryClient, queryKey])

  useEffect(() => {
    if (!token) return
    const echo = getEcho(token)
    const channel = echo.private('driver.free-rides')
    const timers: ReturnType<typeof setTimeout>[] = []

    // Kết nối lại sau khi khoá màn hình / mất mạng: tải lại ngay, không rải (người dùng đang nhìn).
    // `since` không báo được việc XOÁ (admin chặn người bắn / tắt nhóm), nên
    // đồng bộ lại lúc này phải nạp lại trang 1 từ đầu, không phải gộp since.
    const resync = () => queryClient.invalidateQueries({ queryKey })
    echo.connector.pusher.connection.bind('connected', resync)

    channel.listen('.free-rides.updated', () => {
      timers.push(setTimeout(() => { void mergeSince() }, Math.random() * HERD_SPREAD_MS))
    })

    return () => {
      timers.forEach(clearTimeout)
      echo.connector.pusher.connection.unbind('connected', resync)
      echo.leave('driver.free-rides')
    }
  }, [token, queryClient, queryKey, mergeSince])

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
    return now === null ? all : all.filter((r) => r.expires_at > now)
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
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    removeSender,
  }
}
