import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requestFreeUnlock } from '@/api/freeRides'
import { getContactSettings } from '@/api/settings'
import { useUiStore } from '@/stores/ui'
import { apiMessage } from '@/utils/apiError'
import { zaloLink } from '@/utils/zalo'

interface Props {
  access: App.FreeRideAccess | null
  onClose: () => void
}

// Thay cho chuyển khoản 300k: tài xế gửi yêu cầu, admin liên hệ kiểm tra xe + hướng dẫn rồi mở khoá tay.
export default function FreeRideUnlockSheet({ access, onClose }: Props) {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const { data: contact } = useQuery({ queryKey: ['contact-settings'], queryFn: getContactSettings })

  const request = useMutation({
    mutationFn: () => requestFreeUnlock().then((r) => r.data),
    onSuccess: () => {
      showToast('Đã gửi yêu cầu, admin sẽ liên hệ bạn', 'success')
      void qc.invalidateQueries({ queryKey: ['free-rides'] })
      onClose()
    },
    onError: (err) => showToast(apiMessage(err, 'Không gửi được yêu cầu, thử lại sau'), 'error'),
  })

  const requestedAt = access?.requested_at ?? null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div data-testid="free-unlock-sheet" className="bg-white w-full max-h-[90vh] overflow-y-auto rounded-t-2xl pb-6 pt-5 px-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-primary text-[22px]">lock</span>
          <h2 className="text-[16px] font-semibold text-navy">Mở khoá liên hệ</h2>
        </div>
        <p className="text-[13px] text-neutral-gray">
          Liên hệ admin để được kiểm tra xe và hướng dẫn, admin sẽ mở khoá cho bạn. Sau khi mở khoá, bạn gọi/nhắn Zalo thẳng cho người đăng cuốc.
        </p>

        {requestedAt !== null && (
          <p data-testid="free-unlock-requested" className="mt-3 rounded-card bg-light-green p-3 text-[13px] text-navy">
            Đã gửi yêu cầu lúc {new Date(requestedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })}, admin sẽ liên hệ bạn.
          </p>
        )}

        <button type="button" data-testid="free-unlock-request" onClick={() => request.mutate()} disabled={request.isPending}
          className="mt-4 w-full min-h-touch rounded-pill bg-primary text-white text-[14px] font-semibold disabled:opacity-60">
          {request.isPending ? 'Đang gửi…' : requestedAt !== null ? 'Gửi lại yêu cầu' : 'Gửi yêu cầu mở khoá'}
        </button>
        {contact?.zalo_phone && (
          <a href={zaloLink(contact.zalo_phone)} target="_blank" rel="noreferrer"
            className="mt-2 w-full min-h-touch rounded-pill bg-light-green text-primary text-[14px] font-semibold flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">chat</span>Nhắn Zalo admin
          </a>
        )}
        <button type="button" onClick={onClose} className="mt-2 w-full min-h-touch text-[14px] text-neutral-gray">Đóng</button>
      </div>
    </div>
  )
}
