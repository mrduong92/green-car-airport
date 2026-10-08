const DIRECTION_LABEL: Record<App.FreeRideDirection, string> = {
  to_airport: 'Tiễn sân bay',
  from_airport: 'Đón sân bay',
  other: 'Đường dài / nội tỉnh',
}

const timeText = (ride: App.FreeRide) => {
  if (ride.pickup_at === null) return ride.pickup_time_text ?? 'Chưa rõ giờ'
  return new Date(ride.pickup_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}

const ago = (ms: number) => {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000))
  return minutes < 1 ? 'vừa xong' : minutes < 60 ? `${minutes} phút trước` : `${Math.round(minutes / 60)} giờ trước`
}

interface Props {
  ride: App.FreeRide
  onMore: (ride: App.FreeRide) => void
}

export default function FreeRideCard({ ride, onMore }: Props) {
  return (
    <div data-testid="free-ride-card" className="bg-white rounded-card shadow-card overflow-hidden border-l-[4px] border-l-primary border border-border-soft">
      <div className="p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-primary text-[18px]">schedule</span>
            <span className="text-[15px] font-semibold text-navy">{timeText(ride)}</span>
            {ride.direction && (
              <span className="text-[11px] font-medium text-primary bg-light-green rounded-pill px-2 py-0.5 truncate">{DIRECTION_LABEL[ride.direction]}</span>
            )}
          </div>
          <button type="button" data-testid="free-ride-more" aria-label="Thao tác khác" onClick={() => onMore(ride)}
            className="min-w-touch min-h-touch -mr-2 flex items-center justify-center text-neutral-gray">
            <span className="material-symbols-outlined text-[20px]">more_vert</span>
          </button>
        </div>

        {ride.is_raw || !ride.pickup ? (
          <p className="text-[14px] text-navy whitespace-pre-line">{ride.raw_text}</p>
        ) : (
          <div className="flex flex-col gap-1 text-[14px] text-navy">
            <p className="flex gap-2"><span className="material-symbols-outlined text-[16px] text-success-green">trip_origin</span>{ride.pickup}</p>
            <p className="flex gap-2"><span className="material-symbols-outlined text-[16px] text-danger-red">location_on</span>{ride.destination}</p>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap text-[12px]">
          {ride.price !== null && <span className="font-semibold text-navy">{ride.price.toLocaleString('vi-VN')}đ</span>}
          {ride.is_free && <span className="font-semibold text-success-green bg-emerald-50 rounded-pill px-2 py-0.5">Không chiết khấu</span>}
          {ride.seats !== null && <span className="text-neutral-gray">Xe {ride.seats} chỗ</span>}
          {ride.vehicle_note && <span className="text-neutral-gray uppercase">{ride.vehicle_note}</span>}
        </div>

        {!ride.is_raw && ride.pickup && (
          <details className="text-[12px] text-neutral-gray">
            <summary className="cursor-pointer">Tin gốc</summary>
            <p className="mt-1 whitespace-pre-line">{ride.raw_text}</p>
          </details>
        )}

        <p className="text-[11px] text-neutral-gray">
          {ride.sender_name || 'Người bắn cuốc'} · {ride.group_name || 'Nhóm Zalo'}
          {ride.group_count > 1 && ` · đăng ở ${ride.group_count} nhóm`} · {ago(ride.posted_at)}
        </p>

        <a data-testid="free-ride-accept" href={ride.contact_url}
          className="w-full min-h-touch rounded-pill py-2.5 text-[14px] font-semibold bg-primary text-white flex items-center justify-center gap-1.5">
          <span className="material-symbols-outlined text-[18px]">chat</span>
          Nhận cuốc — mở Zalo
        </a>
      </div>
    </div>
  )
}
