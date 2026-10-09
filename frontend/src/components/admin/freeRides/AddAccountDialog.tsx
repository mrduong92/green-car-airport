import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createZaloAccountLogin, getZaloAccountRequest } from '@/api/adminFreeRides'
import { useUiStore } from '@/stores/ui'
import { apiMessage } from '@/utils/apiError'
import Button from '@/components/common/Button'

const ACCOUNT_ID_PATTERN = /^[a-z0-9-]{1,32}$/
const TERMINAL_STATUSES = new Set<App.AdminZaloAccountRequestStatus>(['done', 'expired', 'failed'])

// qr_image của backend có thể là base64 trần (không kèm tiền tố data:) — chuẩn hoá trước khi làm src ảnh.
const qrImageSrc = (raw: string | null) => {
  if (!raw) return null
  return raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`
}

interface Props {
  open: boolean
  mode: 'create' | 'relogin'
  accountId?: string // bắt buộc khi mode==='relogin'
  suggestedId?: string // gợi ý tên khi mode==='create'
  onClose: () => void
}

// Hộp thoại "Thêm nick" (nhập tên → tạo yêu cầu) dùng chung với "Đăng nhập lại" (bỏ qua bước
// nhập tên, tạo yêu cầu ngay bằng account_id đã có). Cả hai cùng poll /account-requests/{id}
// mỗi 2 giây cho tới khi done/expired/failed, dừng poll khi đóng hộp thoại.
// LƯU Ý: parent phải đổi `key` mỗi lần mở lại (xem AccountsTab) để component remount thay vì
// reset state bằng effect — tránh setState đồng bộ trong effect (react-hooks/set-state-in-effect).
export default function AddAccountDialog({ open, mode, accountId, suggestedId, onClose }: Props) {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [name, setName] = useState(suggestedId ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const notifiedRef = useRef<number | null>(null)

  const createMutation = useMutation({
    mutationFn: (id: string) => createZaloAccountLogin(id),
    onSuccess: (res) => setRequestId(res.data.id),
  })

  // mode=relogin: tạo yêu cầu ngay khi mở, không cần nhập tên (account_id đã biết).
  useEffect(() => {
    if (open && mode === 'relogin' && accountId && requestId == null
      && !createMutation.isPending && !createMutation.isError) {
      createMutation.mutate(accountId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, accountId, requestId, createMutation.isPending, createMutation.isError])

  const { data: reqDetail } = useQuery({
    queryKey: ['admin-zalo-account-request', requestId],
    queryFn: () => getZaloAccountRequest(requestId as number).then((r) => r.data),
    enabled: open && requestId != null,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && TERMINAL_STATUSES.has(status) ? false : 2000
    },
  })

  // Khi kết thúc (done/expired/failed): làm mới danh sách nick + toast khi thành công, 1 lần.
  useEffect(() => {
    if (!reqDetail || !TERMINAL_STATUSES.has(reqDetail.status) || notifiedRef.current === reqDetail.id) return
    notifiedRef.current = reqDetail.id
    qc.invalidateQueries({ queryKey: ['admin-zalo-accounts'] })
    if (reqDetail.status === 'done') {
      showToast(`Đã đăng nhập: ${reqDetail.zalo_name || reqDetail.account_id}`, 'success')
    }
  }, [reqDetail, qc, showToast])

  // Đếm ngược hết hạn QR.
  useEffect(() => {
    if (reqDetail?.status !== 'qr_ready') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [reqDetail?.status])

  if (!open) return null

  const mutationErrorMessage = createMutation.isError
    ? apiMessage(createMutation.error, 'Tạo yêu cầu thất bại')
    : null

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!ACCOUNT_ID_PATTERN.test(name)) {
      setNameError('Chỉ chữ thường, số, gạch ngang, tối đa 32 ký tự')
      return
    }
    setNameError(null)
    createMutation.mutate(name)
  }

  // Không reset `requestId`/`notifiedRef` ở đây: làm vậy sẽ thoáng hiện lại form nhập tên (mode
  // create) trước khi yêu cầu mới tạo xong. `onSuccess` sẽ tự đổi `requestId` sang id mới, và
  // `notifiedRef` so theo id nên vẫn bắn toast đúng 1 lần cho yêu cầu mới khi nó xong.
  const retry = () => {
    const id = reqDetail?.account_id ?? accountId ?? name
    createMutation.mutate(id)
  }

  const title = mode === 'relogin' ? `Đăng nhập lại ${accountId}` : 'Thêm nick Zalo'
  const secondsLeft = reqDetail?.qr_expires_at ? Math.max(0, Math.round((reqDetail.qr_expires_at - now) / 1000)) : 0
  const showNameForm = mode === 'create' && requestId == null
  const showReloginError = mode === 'relogin' && requestId == null && !createMutation.isPending && mutationErrorMessage
  const showRequestPanel = requestId != null || (mode === 'relogin' && createMutation.isPending)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-sm mx-auto bg-white rounded-t-[24px] sm:rounded-[24px] px-5 pt-5 pb-8 shadow-card-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-border-gray mx-auto mb-4 sm:hidden" />
        <h3 className="text-[17px] font-bold text-navy text-center leading-snug mb-4">{title}</h3>

        {showNameForm && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="text-[13px] text-neutral-gray mb-1 block">
                Tên nick (chữ thường, số, gạch ngang)
              </label>
              <input
                data-testid="admin-account-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="acc2"
                className="w-full border border-border-gray rounded-input px-3 py-2.5 text-sm text-navy outline-none focus:border-primary"
                maxLength={32}
                autoFocus
              />
              {(nameError || mutationErrorMessage) && (
                <p className="text-[12px] text-danger-red mt-1">{nameError ?? mutationErrorMessage}</p>
              )}
            </div>
            <Button type="submit" fullWidth loading={createMutation.isPending} disabled={createMutation.isPending}>
              Tạo mã QR
            </Button>
            <Button type="button" variant="ghost" fullWidth onClick={onClose} disabled={createMutation.isPending}>
              Huỷ
            </Button>
          </form>
        )}

        {showReloginError && (
          <div className="flex flex-col items-center gap-3 py-4">
            <span className="material-symbols-outlined text-3xl text-danger-red">error</span>
            <p className="text-sm text-navy text-center">{mutationErrorMessage}</p>
            <Button
              fullWidth
              loading={createMutation.isPending}
              disabled={createMutation.isPending}
              onClick={() => accountId && createMutation.mutate(accountId)}
            >
              Thử lại
            </Button>
            <Button variant="ghost" fullWidth onClick={onClose} disabled={createMutation.isPending}>Đóng</Button>
          </div>
        )}

        {showRequestPanel && (
          <div className="flex flex-col items-center gap-3 py-4">
            {(!reqDetail || reqDetail.status === 'pending') && (
              <>
                <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                <p className="text-sm text-navy text-center">Đang tạo mã QR (≤ 10 giây)…</p>
              </>
            )}

            {reqDetail?.status === 'qr_ready' && (
              <>
                {qrImageSrc(reqDetail.qr_image) && (
                  <img
                    data-testid="admin-account-qr"
                    src={qrImageSrc(reqDetail.qr_image) ?? undefined}
                    alt="Mã QR đăng nhập Zalo"
                    className="w-48 h-48 object-contain rounded-card border border-border-gray"
                  />
                )}
                <p className="text-[12px] text-neutral-gray text-center leading-snug">
                  Mở Zalo trên điện thoại của nick phụ → biểu tượng QR → quét
                </p>
                <p className="text-[12px] font-medium text-navy">
                  {secondsLeft > 0 ? `Mã hết hạn sau ${secondsLeft}s` : 'Mã sắp hết hạn…'}
                </p>
              </>
            )}

            {reqDetail?.status === 'done' && (
              <>
                <span className="material-symbols-outlined text-3xl text-success-green">check_circle</span>
                <p className="text-sm text-navy text-center font-medium">
                  Đã đăng nhập: {reqDetail.zalo_name || reqDetail.account_id}
                </p>
                <Button fullWidth onClick={onClose}>Đóng</Button>
              </>
            )}

            {reqDetail?.status === 'expired' && (
              <>
                <span className="material-symbols-outlined text-3xl text-alert-orange">schedule</span>
                <p className="text-sm text-navy text-center">Mã QR hết hạn — thử lại</p>
                <Button fullWidth loading={createMutation.isPending} disabled={createMutation.isPending} onClick={retry}>
                  Thử lại
                </Button>
                <Button variant="ghost" fullWidth onClick={onClose} disabled={createMutation.isPending}>Đóng</Button>
              </>
            )}

            {reqDetail?.status === 'failed' && (
              <>
                <span className="material-symbols-outlined text-3xl text-danger-red">error</span>
                <p className="text-sm text-navy text-center">{reqDetail.error || 'Đăng nhập thất bại'}</p>
                <Button fullWidth loading={createMutation.isPending} disabled={createMutation.isPending} onClick={retry}>
                  Thử lại
                </Button>
                <Button variant="ghost" fullWidth onClick={onClose} disabled={createMutation.isPending}>Đóng</Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
