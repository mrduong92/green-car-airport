import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { deleteAccount } from '@/api/auth'
import { getContactSettings } from '@/api/settings'
import { unregisterPushSubscription } from '@/push'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { apiMessage } from '@/utils/apiError'
import { zaloLink } from '@/utils/zalo'
import Button from '@/components/common/Button'

// Xoá tài khoản (yêu cầu Google Play). Dữ liệu nhận dạng xoá ngay; cuốc/giao dịch giữ ẩn danh
// — xem docs/superpowers/specs/2026-10-14-account-deletion-design.md.
export default function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const showToast = useUiStore((s) => s.showToast)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { data: contact } = useQuery({ queryKey: ['contact-settings'], queryFn: getContactSettings, enabled: open })

  const mutation = useMutation({
    mutationFn: () => deleteAccount(pin),
    onSuccess: async () => {
      // Server đã xoá token đăng nhập + token push: gọi API ở đây sẽ 401 (bỏ qua) —
      // chỉ còn dọn trạng thái trên máy. Không gọi logoutApi().
      await unregisterPushSubscription()
      clearAuth()
      showToast('Tài khoản của bạn đã được xoá', 'success')
      navigate('/login', { replace: true })
    },
    onError: (err) => setError(apiMessage(err, 'Xoá tài khoản thất bại, vui lòng thử lại')),
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white w-full rounded-t-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft">
          <p className="text-[15px] font-semibold text-danger-red">Xoá tài khoản</p>
          <button onClick={onClose} aria-label="Đóng">
            <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
          </button>
        </div>

        <div className="px-4 py-4 flex flex-col gap-3 text-[13px] text-navy">
          <p><strong>Xoá ngay:</strong> họ tên, số điện thoại, mã PIN, giấy tờ và thông tin xe, thông báo, voucher chưa dùng.</p>
          <p><strong>Giữ ẩn danh:</strong> lịch sử cuốc và giao dịch điểm (chứng từ kế toán), không còn gắn với bạn.</p>
          <p className="text-danger-red font-medium">Không thể khôi phục sau khi xoá.</p>

          <label className="text-[12px] text-neutral-gray font-medium" htmlFor="delete-account-pin">Nhập mã PIN để xác nhận</label>
          <input
            id="delete-account-pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={6}
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setError(null) }}
            placeholder="••••••"
            className="border border-border-gray rounded-input px-3 py-2.5 text-sm text-navy outline-none focus:border-danger-red tracking-[0.4em]"
          />

          {error && (
            <div className="bg-danger-red/5 border border-danger-red/30 rounded-input px-3 py-2.5 flex flex-col gap-1">
              <p className="text-danger-red text-[13px]">{error}</p>
              {contact && (
                <a href={zaloLink(contact.zalo_phone)} target="_blank" rel="noreferrer" className="text-primary text-[13px] font-medium">
                  Liên hệ admin qua Zalo
                </a>
              )}
            </div>
          )}
        </div>

        <div className="px-4 pb-6 pt-3 flex gap-3 border-t border-border-soft">
          <Button fullWidth variant="outline" onClick={onClose}>Huỷ</Button>
          <button
            type="button"
            disabled={pin.length !== 6 || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="w-full h-11 rounded-pill bg-danger-red text-white text-sm font-semibold disabled:opacity-50"
          >
            {mutation.isPending ? 'Đang xoá…' : 'Xoá vĩnh viễn'}
          </button>
        </div>
      </div>
    </div>
  )
}
