interface Props {
  pickup: string
  destination: string
  // Dòng phụ nằm giữa 2 điểm (vd quãng đường).
  between?: string
  truncate?: boolean
}

// Điểm đón / điểm trả có chữ "ĐÓN" / "TRẢ" cố định — dùng chung cho tab Cuốc xe và tab Free để
// tài xế không phải suy từ icon (icon máy bay từng bị đọc nhầm thành điểm đi).
export default function RoutePoints({ pickup, destination, between, truncate = false }: Props) {
  const text = `text-[13px] font-semibold text-navy ${truncate ? 'truncate' : ''}`

  return (
    <div data-testid="route-points" className="flex flex-col">
      <div className="flex items-start gap-2.5">
        <span className="shrink-0 w-[38px] text-center text-[10px] font-bold tracking-wide text-primary bg-light-green rounded px-1 py-0.5 mt-0.5">ĐÓN</span>
        <p data-testid="route-pickup" className={`flex-1 min-w-0 ${text}`}>{pickup}</p>
      </div>
      <div className="flex items-stretch gap-2.5">
        <div className="shrink-0 w-[38px] flex justify-center"><div className="w-[2px] bg-border-gray my-0.5" /></div>
        <p className="text-[11px] text-neutral-gray my-1 min-h-[8px]">{between}</p>
      </div>
      <div className="flex items-start gap-2.5">
        <span className="shrink-0 w-[38px] text-center text-[10px] font-bold tracking-wide text-danger-red bg-danger-red/10 rounded px-1 py-0.5 mt-0.5">TRẢ</span>
        <p data-testid="route-destination" className={`flex-1 min-w-0 ${text}`}>{destination}</p>
      </div>
    </div>
  )
}
