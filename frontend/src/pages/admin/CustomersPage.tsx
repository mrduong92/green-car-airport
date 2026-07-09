import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCustomers, updateCustomer, getCustomerBookings, blockCustomer, unblockCustomer, toggleCollaborator, deductCollaboratorPoints, resetCollaboratorPoints } from '@/api/admin'
import { useUiStore } from '@/stores/ui'
import EmptyState from '@/components/common/EmptyState'
import Button from '@/components/common/Button'

type ApiError = { response?: { data?: { message?: string } } }

const STATUS_LABEL: Record<App.BookingStatus, string> = {
  pending:        'Chờ xác nhận',
  finding_driver: 'Đang tìm tài xế',
  accepted:       'Đã nhận',
  in_progress:    'Đang chạy',
  completed:      'Hoàn thành',
  cancelled:      'Đã huỷ',
}

const STATUS_COLOR: Record<App.BookingStatus, string> = {
  pending:        'text-alert-orange',
  finding_driver: 'text-alert-orange',
  accepted:       'text-primary',
  in_progress:    'text-primary',
  completed:      'text-success-green',
  cancelled:      'text-danger-red',
}

export default function AdminCustomersPage() {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [search, setSearch] = useState('')
  const [editTarget, setEditTarget] = useState<App.AdminCustomer | null>(null)
  const [editName, setEditName] = useState('')
  const [historyTarget, setHistoryTarget] = useState<App.AdminCustomer | null>(null)
  const [deductTarget, setDeductTarget] = useState<App.AdminCustomer | null>(null)
  const [deductPoints, setDeductPoints] = useState('')
  const [deductReason, setDeductReason] = useState('')
  const [resetTarget, setResetTarget] = useState<App.AdminCustomer | null>(null)
  const [resetReason, setResetReason] = useState('')

  const { data: customers = [] } = useQuery({
    queryKey: ['admin-customers', search],
    queryFn: () => getCustomers({ search: search || undefined }).then((r) => r.data),
  })

  const { data: customerBookings = [], isFetching: bookingsFetching } = useQuery({
    queryKey: ['admin-customer-bookings', historyTarget?.id],
    queryFn: () => getCustomerBookings(historyTarget!.id).then((r) => r.data),
    enabled: !!historyTarget,
  })

  const openEdit = (c: App.AdminCustomer) => {
    setEditTarget(c)
    setEditName(c.name ?? '')
  }

  const openDeduct = (c: App.AdminCustomer) => {
    setDeductTarget(c)
    setDeductPoints('')
    setDeductReason('')
  }

  const openReset = (c: App.AdminCustomer) => {
    setResetTarget(c)
    setResetReason('')
  }

  const editMutation = useMutation({
    mutationFn: () => updateCustomer(editTarget!.id, { name: editName }),
    onSuccess: () => {
      showToast('Đã cập nhật thông tin', 'success')
      qc.invalidateQueries({ queryKey: ['admin-customers'] })
      setEditTarget(null)
    },
    onError: () => showToast('Cập nhật thất bại', 'error'),
  })

  const blockMutation = useMutation({
    mutationFn: (c: App.AdminCustomer) =>
      c.is_blocked ? unblockCustomer(c.id) : blockCustomer(c.id),
    onSuccess: (_, c) => {
      showToast(c.is_blocked ? 'Đã bỏ chặn khách hàng' : 'Đã chặn khách hàng', 'success')
      qc.invalidateQueries({ queryKey: ['admin-customers'] })
      setHistoryTarget((prev) => prev ? { ...prev, is_blocked: !prev.is_blocked } : null)
    },
    onError: () => showToast('Thao tác thất bại', 'error'),
  })

  const toggleCollaboratorMutation = useMutation({
    mutationFn: (c: App.AdminCustomer) => toggleCollaborator(c.id),
    onSuccess: (res, c) => {
      showToast(
        res.data.is_collaborator ? 'Đã kích hoạt CTV' : 'Đã huỷ CTV',
        'success',
      )
      setHistoryTarget((prev) =>
        prev?.id === c.id ? { ...prev, is_collaborator: res.data.is_collaborator } : prev,
      )
      qc.invalidateQueries({ queryKey: ['admin-customers'] })
    },
    onError: () => showToast('Thao tác thất bại', 'error'),
  })

  const deductMutation = useMutation({
    mutationFn: () => deductCollaboratorPoints(deductTarget!.id, {
      points: Number(deductPoints),
      reason: deductReason,
    }),
    onSuccess: (res) => {
      showToast('Đã trừ điểm', 'success')
      qc.invalidateQueries({ queryKey: ['admin-customers'] })
      setHistoryTarget((prev) => prev && prev.id === deductTarget?.id ? { ...prev, points: res.data.new_balance } : prev)
      setDeductTarget(null)
      setDeductPoints('')
      setDeductReason('')
    },
    onError: (err: ApiError) => showToast(err.response?.data?.message ?? 'Trừ điểm thất bại', 'error'),
  })

  const resetMutation = useMutation({
    mutationFn: () => resetCollaboratorPoints(resetTarget!.id, { reason: resetReason }),
    onSuccess: (res) => {
      showToast('Đã xóa điểm', 'success')
      qc.invalidateQueries({ queryKey: ['admin-customers'] })
      setHistoryTarget((prev) => prev && prev.id === resetTarget?.id ? { ...prev, points: res.data.new_balance } : prev)
      setResetTarget(null)
      setResetReason('')
    },
    onError: (err: ApiError) => showToast(err.response?.data?.message ?? 'Xóa điểm thất bại', 'error'),
  })

  return (
    <div className="flex flex-col gap-0">
      {/* Search */}
      <div className="bg-white px-4 pt-4 pb-4 border-b border-border-gray">
        <div className="flex items-center gap-2 border border-border-gray rounded-input px-3 py-2">
          <span className="material-symbols-outlined text-neutral-gray text-xl">search</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên, số điện thoại"
            className="flex-1 outline-none text-sm text-navy" />
        </div>
      </div>

      {/* Summary strip */}
      {customers.length > 0 && (
        <div className="mx-4 mt-4 bg-primary-tint rounded-card px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[18px]">group</span>
            <span className="text-sm font-semibold text-navy">{customers.length} khách hàng</span>
          </div>
          <span className="text-[12px] text-neutral-gray">
            {customers.reduce((s, c) => s + c.completed_bookings, 0)} chuyến hoàn thành
          </span>
        </div>
      )}

      {/* List */}
      <div className="flex flex-col px-4 py-4 gap-3">
        {customers.length === 0 && (
          <EmptyState icon="manage_accounts" title="Không tìm thấy khách hàng"
            description="Thử thay đổi từ khoá tìm kiếm" />
        )}
        {customers.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setHistoryTarget(c)}
            className="bg-white rounded-card shadow-card p-4 flex items-center gap-3 text-left w-full"
          >
            <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold shrink-0 ${c.is_blocked ? 'bg-danger-red/10 text-danger-red' : 'bg-primary-tint text-primary'}`}>
              {c.is_blocked
                ? <span className="material-symbols-outlined text-xl">block</span>
                : (c.name?.[0] ?? '?')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[14px] font-semibold text-navy truncate">{c.name}</p>
                {c.is_collaborator && (
                  <span className="ml-1.5 text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-pill shrink-0">CTV</span>
                )}
                {c.is_blocked && (
                  <span className="text-[10px] font-semibold text-danger-red bg-danger-red/10 rounded-full px-2 py-0.5 shrink-0">Đã chặn</span>
                )}
              </div>
              <p className="text-[12px] text-neutral-gray">{c.phone}</p>
              <p className="text-[11px] text-neutral-gray mt-0.5">
                {c.total_bookings} đặt · {c.completed_bookings} hoàn thành
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <p className="text-[14px] font-bold text-primary tabular-nums">
                {c.total_spent.toLocaleString('vi')} đ
              </p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openEdit(c) }}
                className="text-xs bg-primary/10 text-primary rounded-pill px-3 py-1.5 font-medium"
              >
                Sửa
              </button>
            </div>
          </button>
        ))}
      </div>

      {/* Edit modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setEditTarget(null)}>
          <div className="bg-white w-full rounded-t-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft">
              <p className="text-[15px] font-semibold text-navy">Chỉnh sửa khách hàng</p>
              <button onClick={() => setEditTarget(null)}>
                <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
              </button>
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Số điện thoại</label>
                <p className="text-sm text-neutral-gray bg-warm-white rounded-input px-3 py-2.5">{editTarget.phone}</p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Họ và tên</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="border border-border-gray rounded-input px-3 py-2.5 text-sm text-navy outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>
            <div className="px-4 pb-6 pt-3 flex gap-3 border-t border-border-soft">
              <Button fullWidth variant="outline" onClick={() => setEditTarget(null)}>Huỷ</Button>
              <Button fullWidth loading={editMutation.isPending}
                disabled={!editName.trim()}
                onClick={() => editMutation.mutate()}>
                Lưu
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* History + block sheet */}
      {historyTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setHistoryTarget(null)}>
          <div className="bg-white w-full rounded-t-2xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${historyTarget.is_blocked ? 'bg-danger-red/10 text-danger-red' : 'bg-primary-tint text-primary'}`}>
                  {historyTarget.is_blocked
                    ? <span className="material-symbols-outlined text-base">block</span>
                    : historyTarget.name?.[0] ?? '?'}
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-navy">{historyTarget.name}</p>
                  <p className="text-[12px] text-neutral-gray">{historyTarget.phone}</p>
                </div>
              </div>
              <button onClick={() => setHistoryTarget(null)}>
                <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
              </button>
            </div>

            {/* Stats row */}
            <div className="flex divide-x divide-border-soft border-b border-border-soft shrink-0">
              {[
                { label: 'Tổng đặt', value: historyTarget.total_bookings },
                { label: 'Hoàn thành', value: historyTarget.completed_bookings },
                { label: 'Chi tiêu', value: historyTarget.total_spent.toLocaleString('vi') + 'đ' },
                ...(historyTarget.is_collaborator
                  ? [{ label: 'Điểm CTV', value: (historyTarget.points ?? 0).toLocaleString('vi') }]
                  : []),
              ].map((s) => (
                <div key={s.label} className="flex-1 flex flex-col items-center py-3">
                  <p className="text-[13px] font-bold text-navy">{s.value}</p>
                  <p className="text-[11px] text-neutral-gray">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Booking list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
              <p className="text-[12px] font-semibold text-neutral-gray uppercase tracking-wide mb-1">Lịch sử đặt xe</p>
              {bookingsFetching && (
                <div className="flex justify-center py-6">
                  <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                </div>
              )}
              {!bookingsFetching && customerBookings.length === 0 && (
                <p className="text-sm text-neutral-gray text-center py-6">Chưa có chuyến nào</p>
              )}
              {customerBookings.map((b) => (
                <div key={b.id} className="bg-warm-white rounded-card px-3 py-2.5 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] font-semibold text-navy truncate flex-1">{b.pickup}</p>
                    <span className={`text-[11px] font-semibold shrink-0 ${STATUS_COLOR[b.status]}`}>
                      {STATUS_LABEL[b.status]}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-gray truncate">→ {b.destination}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-[11px] text-neutral-gray">{b.date} {b.time}</p>
                    <p className="text-[12px] font-bold text-primary">{b.price.toLocaleString('vi')}đ</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Block / unblock + toggle CTV buttons */}
            <div className="px-4 pb-6 pt-3 border-t border-border-soft shrink-0 flex flex-col gap-2">
              {/* Toggle CTV button */}
              <button
                onClick={() => historyTarget && toggleCollaboratorMutation.mutate(historyTarget)}
                disabled={toggleCollaboratorMutation.isPending}
                className={`flex items-center gap-2 w-full px-4 py-3 rounded-input border text-[14px] font-medium transition-colors ${
                  historyTarget.is_collaborator
                    ? 'border-neutral-gray text-neutral-gray'
                    : 'border-primary text-primary'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {historyTarget.is_collaborator ? 'person_remove' : 'person_add'}
                </span>
                {historyTarget.is_collaborator ? 'Huỷ CTV' : 'Kích hoạt CTV'}
              </button>
              {historyTarget.is_collaborator && (historyTarget.points ?? 0) > 0 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openDeduct(historyTarget)}>
                    Trừ điểm
                  </Button>
                  <Button variant="danger" size="sm" className="flex-1" onClick={() => openReset(historyTarget)}>
                    Xóa điểm về 0
                  </Button>
                </div>
              )}
              <Button
                fullWidth
                variant="outline"
                loading={blockMutation.isPending}
                onClick={() => blockMutation.mutate(historyTarget)}
                className={historyTarget.is_blocked ? 'border-primary text-primary' : 'border-danger-red text-danger-red'}
              >
                <span className="material-symbols-outlined text-base mr-1.5">
                  {historyTarget.is_blocked ? 'lock_open' : 'block'}
                </span>
                {historyTarget.is_blocked ? 'Bỏ chặn khách hàng' : 'Chặn khách hàng'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Deduct points modal */}
      {deductTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setDeductTarget(null)}>
          <div className="bg-white w-full rounded-t-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft">
              <p className="text-[15px] font-semibold text-navy">Trừ điểm CTV</p>
              <button onClick={() => setDeductTarget(null)}>
                <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
              </button>
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              <p className="text-[12px] text-neutral-gray">
                {deductTarget.name} · Số dư hiện tại: <span className="font-semibold text-navy">{(deductTarget.points ?? 0).toLocaleString('vi')} điểm</span>
              </p>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Số điểm trừ <span className="text-danger-red">*</span></label>
                <input
                  type="number" min={1} max={deductTarget.points ?? 0} inputMode="numeric"
                  value={deductPoints}
                  onChange={(e) => setDeductPoints(e.target.value)}
                  placeholder="Nhập số điểm cần trừ"
                  className="border border-border-gray rounded-input px-3 py-2.5 text-sm text-navy outline-none focus:border-primary transition-colors [appearance:textfield]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Lý do <span className="text-danger-red">*</span></label>
                <textarea
                  value={deductReason}
                  onChange={(e) => setDeductReason(e.target.value)}
                  placeholder="Ví dụ: Đã thanh toán offline"
                  rows={3}
                  className="border border-border-gray rounded-input px-3 py-2.5 text-sm text-navy outline-none focus:border-primary transition-colors resize-none"
                />
              </div>
            </div>
            <div className="px-4 pb-6 pt-3 flex gap-3 border-t border-border-soft">
              <Button fullWidth variant="outline" onClick={() => setDeductTarget(null)}>Huỷ</Button>
              <Button
                fullWidth
                loading={deductMutation.isPending}
                disabled={
                  !deductPoints || Number(deductPoints) < 1 ||
                  Number(deductPoints) > (deductTarget.points ?? 0) || !deductReason.trim()
                }
                onClick={() => deductMutation.mutate()}
              >
                Trừ điểm
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reset points modal */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setResetTarget(null)}>
          <div className="bg-white w-full rounded-t-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft">
              <p className="text-[15px] font-semibold text-navy">Xóa điểm về 0</p>
              <button onClick={() => setResetTarget(null)}>
                <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
              </button>
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              <p className="text-[13px] text-navy">
                {resetTarget.name} sẽ mất toàn bộ <span className="font-semibold text-danger-red">{(resetTarget.points ?? 0).toLocaleString('vi')} điểm</span>. Hành động này không thể hoàn tác.
              </p>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Lý do <span className="text-danger-red">*</span></label>
                <textarea
                  value={resetReason}
                  onChange={(e) => setResetReason(e.target.value)}
                  placeholder="Ví dụ: Vi phạm chính sách thu hộ"
                  rows={3}
                  className="border border-border-gray rounded-input px-3 py-2.5 text-sm text-navy outline-none focus:border-primary transition-colors resize-none"
                />
              </div>
            </div>
            <div className="px-4 pb-6 pt-3 flex gap-3 border-t border-border-soft">
              <Button fullWidth variant="outline" onClick={() => setResetTarget(null)}>Huỷ</Button>
              <Button
                fullWidth
                variant="danger"
                loading={resetMutation.isPending}
                disabled={!resetReason.trim()}
                onClick={() => resetMutation.mutate()}
              >
                Xóa điểm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
