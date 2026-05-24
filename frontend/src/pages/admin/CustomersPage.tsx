import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCustomers, updateCustomer } from '@/api/admin'
import { useUiStore } from '@/stores/ui'
import EmptyState from '@/components/common/EmptyState'
import Button from '@/components/common/Button'

export default function AdminCustomersPage() {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [search, setSearch] = useState('')
  const [editTarget, setEditTarget] = useState<App.AdminCustomer | null>(null)
  const [editName, setEditName] = useState('')

  const { data: customers = [] } = useQuery({
    queryKey: ['admin-customers', search],
    queryFn: () => getCustomers({ search: search || undefined }).then((r) => r.data),
  })

  const openEdit = (c: App.AdminCustomer) => {
    setEditTarget(c)
    setEditName(c.name)
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
          <div key={c.id} className="bg-white rounded-card shadow-card p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-primary-tint flex items-center justify-center text-primary font-bold shrink-0">
              {c.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-navy truncate">{c.name}</p>
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
                onClick={() => openEdit(c)}
                className="text-xs bg-primary/10 text-primary rounded-pill px-3 py-1.5 font-medium"
              >
                Sửa
              </button>
            </div>
          </div>
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
    </div>
  )
}
