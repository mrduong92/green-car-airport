import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { closeFreeRide, deleteFreeRide, MY_FREE_RIDES_QUERY_KEY } from '@/api/freeRides'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import { useUiStore } from '@/stores/ui'
import { apiMessage } from '@/utils/apiError'
import { shareRide } from '@/utils/shareRide'

interface Props {
  ride: App.FreeRide
  onRemoved: (rideUid: string) => void
  // Mốc giờ hiện tại do trang truyền xuống (react-hooks/purity cấm Date.now() khi render). Tab Free đã
  // tự bỏ cuốc hết hạn nên không cần truyền; "Cuốc tôi đăng" truyền để ẩn "Đã có xe" ở cuốc hết hạn.
  now?: number | null
}

export default function OwnRideActions({ ride, onRemoved, now = null }: Props) {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fail = (err: unknown) => showToast(apiMessage(err, 'Không thực hiện được, thử lại sau'), 'error')
  const done = (msg: string) => {
    onRemoved(ride.ride_uid)
    void qc.invalidateQueries({ queryKey: MY_FREE_RIDES_QUERY_KEY })
    showToast(msg, 'success')
  }

  const close = useMutation({ mutationFn: () => closeFreeRide(ride.ride_uid), onSuccess: () => done('Đã gỡ cuốc khỏi danh sách'), onError: fail })
  const remove = useMutation({ mutationFn: () => deleteFreeRide(ride.ride_uid), onSuccess: () => { setConfirmDelete(false); done('Đã xoá cuốc') }, onError: fail })

  const share = async () => {
    const result = await shareRide(ride)
    if (result === 'copied') showToast('Đã sao chép, dán vào nhóm Zalo nhé', 'success')
    if (result === 'failed') showToast('Không chia sẻ được trên máy này', 'error')
  }

  const btn = 'flex-1 min-h-touch rounded-pill py-2 text-[13px] font-semibold flex items-center justify-center gap-1'
  const open = ride.closed_at === null && (now === null || ride.expires_at > now)

  return (
    <>
      <div className="flex gap-2">
        <button type="button" data-testid="own-ride-share" onClick={() => { void share() }} className={`${btn} bg-primary text-white`}>
          <span className="material-symbols-outlined text-[18px]">share</span>Chia sẻ
        </button>
        {open && (
          <button type="button" data-testid="own-ride-close" onClick={() => close.mutate()} disabled={close.isPending} className={`${btn} bg-light-green text-primary`}>
            <span className="material-symbols-outlined text-[18px]">task_alt</span>Đã có xe
          </button>
        )}
        <button type="button" data-testid="own-ride-delete" onClick={() => setConfirmDelete(true)} className={`${btn} bg-white border border-border-gray text-danger-red`}>
          <span className="material-symbols-outlined text-[18px]">delete</span>Xoá
        </button>
      </div>
      <ConfirmDialog open={confirmDelete} title="Xoá cuốc này?" description="Cuốc sẽ biến mất khỏi tab Free của mọi tài xế."
        confirmLabel="Xoá" loading={remove.isPending} onConfirm={() => remove.mutate()} onCancel={() => setConfirmDelete(false)} />
    </>
  )
}
