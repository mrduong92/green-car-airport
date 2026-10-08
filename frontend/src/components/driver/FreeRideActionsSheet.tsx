import { useMutation } from '@tanstack/react-query'
import { hideFreeRideSender, reportBrokenLink, reportFreeRide, type FreeRideReportReason } from '@/api/freeRides'
import { useUiStore } from '@/stores/ui'
import { apiMessage } from '@/utils/apiError'

const REASONS: { value: FreeRideReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam / quảng cáo' },
  { value: 'wrong_info', label: 'Sai thông tin' },
  { value: 'inappropriate', label: 'Nội dung không phù hợp' },
  { value: 'other', label: 'Khác' },
]

interface Props {
  ride: App.FreeRide
  onClose: () => void
  onSenderHidden: (senderUid: string) => void
}

export default function FreeRideActionsSheet({ ride, onClose, onSenderHidden }: Props) {
  const showToast = useUiStore((s) => s.showToast)
  const fail = (err: unknown) => showToast(apiMessage(err, 'Không thực hiện được, thử lại sau'), 'error')

  const hide = useMutation({
    mutationFn: () => hideFreeRideSender(ride.sender_uid),
    onSuccess: () => { onSenderHidden(ride.sender_uid); showToast('Đã ẩn cuốc của người bắn này', 'success'); onClose() },
    onError: fail,
  })
  const broken = useMutation({
    mutationFn: () => reportBrokenLink(ride.ride_uid),
    onSuccess: () => { showToast('Đã báo, hệ thống sẽ lấy lại liên hệ', 'success'); onClose() },
    onError: fail,
  })
  const report = useMutation({
    mutationFn: (reason: FreeRideReportReason) => reportFreeRide(ride.ride_uid, reason),
    onSuccess: () => { showToast('Cảm ơn bạn đã báo cáo', 'success'); onClose() },
    onError: fail,
  })

  const item = 'w-full min-h-touch px-4 flex items-center gap-3 text-[14px] text-navy text-left active:bg-light-green'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div className="bg-white w-full rounded-t-2xl pb-6 pt-2" onClick={(e) => e.stopPropagation()}>
        <button type="button" className={item} onClick={() => broken.mutate()} disabled={broken.isPending}>
          <span className="material-symbols-outlined text-[20px] text-neutral-gray">link_off</span>Nút Nhận cuốc mở sai trang
        </button>
        <button type="button" data-testid="free-ride-hide-sender" className={item} onClick={() => hide.mutate()} disabled={hide.isPending}>
          <span className="material-symbols-outlined text-[20px] text-neutral-gray">visibility_off</span>Ẩn mọi cuốc của {ride.sender_name || 'người này'}
        </button>
        <p className="px-4 pt-3 pb-1 text-[12px] font-semibold text-neutral-gray uppercase tracking-wide">Báo cáo cuốc</p>
        {REASONS.map((r) => (
          <button key={r.value} type="button" className={item} onClick={() => report.mutate(r.value)} disabled={report.isPending}>
            <span className="material-symbols-outlined text-[20px] text-neutral-gray">flag</span>{r.label}
          </button>
        ))}
      </div>
    </div>
  )
}
