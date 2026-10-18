import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import BrandGlyph from '@/components/common/BrandGlyph'
import FreeRideComposer from '@/components/driver/FreeRideComposer'
import OwnRideActions from '@/components/driver/OwnRideActions'
import { getMyFreeRides, MY_FREE_RIDES_QUERY_KEY } from '@/api/freeRides'

const TZ = 'Asia/Ho_Chi_Minh'

const DIRECTION_LABEL: Record<App.FreeRideDirection, string> = {
  to_airport: 'Tiễn sân bay',
  from_airport: 'Đón sân bay',
  other: 'Đường dài / nội tỉnh',
}

const dayKey = (ms: number) => new Date(ms).toLocaleDateString('vi-VN', { timeZone: TZ })
const clock = (ms: number) => new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: TZ })

function dayLabel(ms: number, now: number) {
  if (dayKey(ms) === dayKey(now)) return 'Hôm nay'
  if (dayKey(ms) === dayKey(now - 86_400_000)) return 'Hôm qua'
  return new Date(ms).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: TZ })
}

function status(r: App.FreeRide, now: number): { icon: string; text: string } {
  if (r.closed_at !== null) return { icon: 'task_alt', text: 'Đã có xe' }
  if (r.expires_at <= now) return { icon: 'schedule', text: 'Hết hạn' }
  if (r.parse_status === 'pending') return { icon: 'more_horiz', text: 'Đang đọc cuốc…' }
  return { icon: 'done_all', text: 'Đã đăng' }
}

// Những gì hệ thống hiểu từ tin — để tài xế thấy cuốc sẽ được lọc/báo cho ai.
function parsedChips(r: App.FreeRide): string[] {
  if (r.parse_status !== 'done') return []
  return [
    r.direction && DIRECTION_LABEL[r.direction],
    r.pickup_at !== null && new Date(r.pickup_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: TZ }),
    r.seats !== null && `Xe ${r.seats} chỗ`,
    r.price !== null && `${r.price.toLocaleString('vi-VN')}đ`,
    r.is_free && 'Không chiết khấu',
  ].filter((c): c is string => typeof c === 'string')
}

// Màn đăng cuốc kiểu khung chat Zalo: cuốc mình đăng là tin nhắn bên phải, GreenCA hướng dẫn bên trái,
// ô soạn tin dính đáy. Mở từ nút (+) giữa thanh menu; thanh menu ẩn ở màn này.
export default function PostRidePage() {
  const qc = useQueryClient()
  const [sending, setSending] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const { data, dataUpdatedAt } = useQuery({
    queryKey: MY_FREE_RIDES_QUERY_KEY,
    queryFn: () => getMyFreeRides().then((r) => r.data.data),
    refetchOnMount: 'always',
    // AI tách ở nền vài giây — hỏi lại tới khi hết cuốc "Đang đọc cuốc…".
    refetchInterval: (q) => (q.state.data?.some((r) => r.parse_status === 'pending' && r.closed_at === null) ? 3000 : false),
  })
  // Mốc "bây giờ" lấy từ lần tải dữ liệu (react-hooks/purity không cho gọi Date.now() khi render).
  const now = dataUpdatedAt
  const rides = [...(data ?? [])].sort((a, b) => a.posted_at - b.posted_at)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [rides.length, sending])

  const onPosted = (ride: App.FreeRide) => {
    qc.setQueryData<App.FreeRide[]>(MY_FREE_RIDES_QUERY_KEY, (old) => [ride, ...(old ?? []).filter((r) => r.ride_uid !== ride.ride_uid)])
    void qc.invalidateQueries({ queryKey: ['free-rides'] })
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 flex items-start gap-2 bg-white px-4 py-2.5 border-b border-border-soft">
        <span className="material-symbols-outlined text-primary text-[18px] mt-px" style={{ fontVariationSettings: "'FILL' 1" }}>push_pin</span>
        <p className="text-[12px] leading-[17px] text-neutral-gray">
          Tin hiện ngay cho mọi tài xế GreenCA. Tài xế khác liên hệ bạn qua số điện thoại tài khoản.
        </p>
      </div>

      <div className="flex-1 bg-light-green px-3 pt-4 pb-3 flex flex-col gap-1">
        <div className="flex items-end gap-2 mb-3 max-w-[86%]">
          <span className="shrink-0 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center">
            <BrandGlyph size={18} />
          </span>
          <div>
            <p className="text-[11px] text-neutral-gray mb-0.5 ml-1">GreenCA</p>
            <div className="bg-white rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[14px] leading-[20px] text-navy shadow-card">
              Gõ cuốc như nhắn trong nhóm Zalo rồi bấm gửi. GreenCA tự đọc giờ, chiều đi và số chỗ để báo cho tài xế phù hợp.
              <span className="block mt-1.5 text-neutral-gray">Ví dụ: Tiễn Mỹ Đình 15h mai xe 5 250k</span>
            </div>
          </div>
        </div>

        {rides.map((ride, i) => {
          const showDay = i === 0 || dayKey(ride.posted_at) !== dayKey(rides[i - 1].posted_at)
          const st = status(ride, now)
          const live = st.text === 'Đã đăng' || st.text === 'Đang đọc cuốc…'
          const chips = parsedChips(ride)
          const open = selected === ride.ride_uid
          return (
            <div key={ride.ride_uid} className="contents">
              {showDay && (
                <p className="self-center my-2 rounded-pill bg-white/70 px-3 py-1 text-[11px] font-medium text-neutral-gray">{dayLabel(ride.posted_at, now)}</p>
              )}
              <div data-testid="my-ride-row" className="self-end flex flex-col items-end gap-1 max-w-[82%] mb-2">
                <button type="button" data-testid="my-ride-bubble" aria-expanded={open}
                  onClick={() => setSelected(open ? null : ride.ride_uid)}
                  className={clsx('text-left whitespace-pre-line break-words rounded-2xl rounded-br-md px-3.5 py-2.5 text-[15px] leading-[21px] shadow-card transition-opacity',
                    live ? 'bg-primary text-white' : 'bg-white text-neutral-gray')}>
                  {ride.raw_text}
                </button>
                {chips.length > 0 && (
                  <div className="flex flex-wrap justify-end gap-1">
                    {chips.map((c) => (
                      <span key={c} className="rounded-pill bg-white px-2 py-0.5 text-[11px] font-medium text-primary">{c}</span>
                    ))}
                  </div>
                )}
                <p data-testid="my-ride-status" className="flex items-center gap-1 text-[11px] text-neutral-gray pr-1">
                  {clock(ride.posted_at)}
                  <span className="material-symbols-outlined text-[14px]">{st.icon}</span>
                  {st.text}
                </p>
                {open && (
                  // Hàng nút của bong bóng cuối dễ nằm dưới ô soạn tin (dính đáy, cao ~110px) — cuộn cho hiện ra.
                  <div ref={(el) => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })} className="scroll-mb-32">
                    <OwnRideActions ride={ride} now={now} compact onRemoved={() => setSelected(null)} />
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {sending !== null && (
          <div className="self-end flex flex-col items-end gap-1 max-w-[82%] mb-2">
            <p className="whitespace-pre-line break-words rounded-2xl rounded-br-md bg-primary/70 px-3.5 py-2.5 text-[15px] leading-[21px] text-white">{sending}</p>
            <p className="text-[11px] text-neutral-gray pr-1">Đang gửi…</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 z-10">
        <FreeRideComposer onPosted={onPosted} onSending={setSending} />
      </div>
    </div>
  )
}
