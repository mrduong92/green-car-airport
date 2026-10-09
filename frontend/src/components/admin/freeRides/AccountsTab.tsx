import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getZaloAccounts, getZaloAccountRequest, removeZaloAccount } from '@/api/adminFreeRides'
import { useUiStore } from '@/stores/ui'
import { apiMessage } from '@/utils/apiError'
import EmptyState from '@/components/common/EmptyState'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import AddAccountDialog from './AddAccountDialog'
import clsx from 'clsx'

const ACCOUNTS_KEY = ['admin-zalo-accounts'] as const
const TERMINAL_STATUSES = new Set<App.AdminZaloAccountRequestStatus>(['done', 'expired', 'failed'])

const timeFmt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const fmtLoginAt = (ms: number | null) => (ms == null ? 'Chưa đăng nhập' : timeFmt.format(new Date(ms)))

// Gợi ý tên accN kế tiếp dựa trên các id dạng acc<số> đang có (nhập tay vẫn được, không bắt buộc).
const nextAccountId = (ids: string[]) => {
  let max = 0
  for (const id of ids) {
    const m = /^acc(\d+)$/.exec(id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `acc${max + 1}`
}

export default function AccountsTab() {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)

  // `addKey`/`reloginKey` đổi mỗi lần mở hộp thoại để AddAccountDialog remount (reset state qua
  // props ban đầu) thay vì tự reset bằng effect.
  const [addOpen, setAddOpen] = useState(false)
  const [addKey, setAddKey] = useState(0)
  const [reloginId, setReloginId] = useState<string | null>(null)
  const [reloginKey, setReloginKey] = useState(0)
  const [confirmRemove, setConfirmRemove] = useState<App.AdminZaloAccount | null>(null)
  const [removing, setRemoving] = useState<{ accountId: string; requestId: number } | null>(null)
  const notifiedRemoveRef = useRef<number | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: () => getZaloAccounts().then((r) => r.data),
    refetchInterval: 15_000,
  })

  const accounts = data?.accounts ?? []
  const openRequests = data?.requests ?? []
  const suggestedId = useMemo(() => nextAccountId((data?.accounts ?? []).map((a) => a.id)), [data?.accounts])

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeZaloAccount(id),
    onSuccess: (res, id) => {
      setConfirmRemove(null)
      setRemoving({ accountId: id, requestId: res.data.id })
      qc.invalidateQueries({ queryKey: ACCOUNTS_KEY })
    },
    onError: (err) => showToast(apiMessage(err, 'Gỡ nick thất bại'), 'error'),
  })

  const { data: removeDetail } = useQuery({
    queryKey: ['admin-zalo-account-request', removing?.requestId],
    queryFn: () => getZaloAccountRequest(removing!.requestId).then((r) => r.data),
    enabled: removing != null,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && TERMINAL_STATUSES.has(status) ? false : 2000
    },
  })

  // Yêu cầu gỡ nick kết thúc (done/expired/failed): báo kết quả + làm mới danh sách, 1 lần.
  // Không cần reset `removing` ở đây — `busy` bên dưới tự tắt khi trạng thái đã là kết thúc
  // (tránh setState đồng bộ trong effect, xem react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!removeDetail || !TERMINAL_STATUSES.has(removeDetail.status) || notifiedRemoveRef.current === removeDetail.id) return
    notifiedRemoveRef.current = removeDetail.id
    qc.invalidateQueries({ queryKey: ACCOUNTS_KEY })
    if (removeDetail.status === 'done') showToast(`Đã gỡ nick ${removeDetail.account_id}`, 'success')
    else if (removeDetail.status === 'failed') showToast(removeDetail.error || 'Gỡ nick thất bại', 'error')
    else showToast('Yêu cầu gỡ nick hết hạn', 'error')
  }, [removeDetail, qc, showToast])

  return (
    <div className="flex flex-col gap-0">
      <div className="bg-white px-4 pt-4 pb-4 border-b border-border-gray flex items-center justify-between gap-3">
        <p className="text-[13px] text-neutral-gray leading-snug">
          Nick Zalo phụ dùng để đọc tin các nhóm — mỗi nick theo được nhiều nhóm.
        </p>
        <button
          data-testid="admin-account-add"
          onClick={() => { setAddKey((k) => k + 1); setAddOpen(true) }}
          disabled={addOpen}
          className="shrink-0 bg-primary text-white rounded-pill px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Thêm nick
        </button>
      </div>

      <div className="flex flex-col px-4 py-4 gap-3">
        {isLoading && (
          <p className="text-caption text-neutral-gray text-center py-10">Đang tải…</p>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="text-sm text-danger-red text-center">Không tải được danh sách nick</p>
            <button onClick={() => refetch()} className="text-sm font-semibold text-primary">
              Thử lại
            </button>
          </div>
        )}

        {!isLoading && !isError && accounts.length === 0 && (
          <EmptyState icon="person" title="Chưa có nick Zalo nào" description="Bấm 'Thêm nick' để đăng nhập nick phụ đầu tiên" />
        )}

        {accounts.map((acc) => {
          const openReq = openRequests.find((r) => r.account_id === acc.id)
          const removingThis = removing?.accountId === acc.id
            && (!removeDetail || removing?.requestId !== removeDetail.id || !TERMINAL_STATUSES.has(removeDetail.status))
          const busy = !!openReq || removingThis
          const dotClass = acc.stale
            ? 'bg-neutral-gray'
            : acc.connected ? 'bg-success-green' : 'bg-danger-red'
          const statusLabel = acc.stale ? 'Không rõ' : acc.connected ? 'Đang kết nối' : 'Mất kết nối'

          return (
            <div key={acc.id} data-testid="admin-account-card" className="bg-white rounded-card shadow-card p-4">
              <div className="flex items-start gap-3">
                <span className={clsx('w-2.5 h-2.5 rounded-full mt-1.5 shrink-0', dotClass)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-semibold text-navy truncate">{acc.zalo_name || acc.id}</p>
                    <span className={clsx(
                      'text-[10px] font-semibold rounded-pill px-2 py-0.5 shrink-0',
                      acc.stale
                        ? 'bg-neutral-gray/15 text-neutral-gray'
                        : acc.connected ? 'bg-success-green/15 text-success-green' : 'bg-danger-red/15 text-danger-red',
                    )}>
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-gray mt-0.5">UID: {acc.zalo_uid ?? '—'}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap text-caption text-neutral-gray">
                    <span>{acc.groups ?? 0} nhóm</span>
                    <span>· Đăng nhập lúc: {fmtLoginAt(acc.logged_in_at)}</span>
                  </div>
                  {acc.last_error && (
                    <p className="text-[11px] text-danger-red mt-1 truncate">{acc.last_error}</p>
                  )}
                  {busy && (
                    <p className="text-[11px] text-neutral-gray mt-1">Đang xử lý…</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  data-testid="admin-account-relogin"
                  onClick={() => { setReloginKey((k) => k + 1); setReloginId(acc.id) }}
                  disabled={busy}
                  className="flex-1 text-xs bg-light-green text-primary rounded-pill px-3 py-2 font-medium disabled:opacity-50"
                >
                  Đăng nhập lại
                </button>
                <button
                  data-testid="admin-account-remove"
                  onClick={() => setConfirmRemove(acc)}
                  disabled={busy}
                  className="flex-1 text-xs bg-danger-red text-white rounded-pill px-3 py-2 font-medium disabled:opacity-50"
                >
                  Gỡ
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <AddAccountDialog
        key={`create-${addKey}`}
        open={addOpen}
        mode="create"
        suggestedId={suggestedId}
        onClose={() => setAddOpen(false)}
      />

      <AddAccountDialog
        key={`relogin-${reloginKey}`}
        open={reloginId != null}
        mode="relogin"
        accountId={reloginId ?? undefined}
        onClose={() => setReloginId(null)}
      />

      <ConfirmDialog
        open={!!confirmRemove}
        title={`Gỡ nick ${confirmRemove?.zalo_name || confirmRemove?.id}?`}
        description="Nick sẽ ngừng đọc tin các nhóm; cần quét QR đăng nhập lại nếu muốn dùng lại."
        confirmLabel="Gỡ"
        loading={removeMutation.isPending}
        onConfirm={() => confirmRemove && removeMutation.mutate(confirmRemove.id)}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  )
}
