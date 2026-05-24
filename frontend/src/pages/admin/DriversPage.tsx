import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDrivers, updateDriver, blockDriver, approveDriver } from '@/api/admin'
import { useUiStore } from '@/stores/ui'
import StatusBadge from '@/components/common/StatusBadge'
import Button from '@/components/common/Button'
import clsx from 'clsx'

const FILTERS = [
  { key: '',        label: 'Tất cả' },
  { key: 'active',  label: 'Đang hoạt động' },
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'blocked', label: 'Đã block' },
]

interface EditForm {
  name: string; vehicle_make: string; vehicle_model: string
  vehicle_plate: string; vehicle_year: string; vehicle_color: string
}

const emptyForm = (): EditForm => ({
  name: '', vehicle_make: '', vehicle_model: '',
  vehicle_plate: '', vehicle_year: '', vehicle_color: '',
})

export default function DriversPage() {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [blockTarget, setBlockTarget] = useState<App.DriverProfile | null>(null)
  const [blockReason, setBlockReason] = useState('')
  const [editTarget, setEditTarget] = useState<App.DriverProfile | null>(null)
  const [form, setForm] = useState<EditForm>(emptyForm())

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers', filter, search],
    queryFn: () => getDrivers({ status: filter || undefined, search: search || undefined }).then((r) => r.data),
  })

  const openEdit = (d: App.DriverProfile) => {
    setEditTarget(d)
    setForm({
      name:          d.name ?? '',
      vehicle_make:  d.vehicle_make  ?? '',
      vehicle_model: d.vehicle_model ?? '',
      vehicle_plate: d.vehicle_plate ?? '',
      vehicle_year:  d.vehicle_year?.toString() ?? '',
      vehicle_color: d.vehicle_color ?? '',
    })
  }

  const editMutation = useMutation({
    mutationFn: () => updateDriver(editTarget!.id, {
      name:          form.name       || undefined,
      vehicle_make:  form.vehicle_make  || undefined,
      vehicle_model: form.vehicle_model || undefined,
      vehicle_plate: form.vehicle_plate || undefined,
      vehicle_year:  form.vehicle_year ? Number(form.vehicle_year) : undefined,
      vehicle_color: form.vehicle_color || undefined,
    }),
    onSuccess: () => {
      showToast('Đã cập nhật thông tin', 'success')
      qc.invalidateQueries({ queryKey: ['drivers'] })
      setEditTarget(null)
    },
    onError: () => showToast('Cập nhật thất bại', 'error'),
  })

  const blockMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => blockDriver(id, reason),
    onSuccess: () => {
      showToast('Đã block tài xế', 'success')
      qc.invalidateQueries({ queryKey: ['drivers'] })
      setBlockTarget(null)
    },
    onError: () => showToast('Thao tác thất bại', 'error'),
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => approveDriver(id),
    onSuccess: () => {
      showToast('Đã duyệt tài xế', 'success')
      qc.invalidateQueries({ queryKey: ['drivers'] })
    },
    onError: () => showToast('Thao tác thất bại', 'error'),
  })

  const inputCls = 'border border-border-gray rounded-input px-3 py-2.5 text-sm text-navy outline-none focus:border-primary transition-colors'

  return (
    <div className="flex flex-col gap-0">
      {/* Search + filter */}
      <div className="bg-white px-4 pt-4 pb-0 border-b border-border-gray">
        <div className="flex items-center gap-2 border border-border-gray rounded-input px-3 py-2 mb-3">
          <span className="material-symbols-outlined text-neutral-gray text-xl">search</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên, SĐT, biển số"
            className="flex-1 outline-none text-sm text-navy" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-3">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={clsx('rounded-pill px-4 py-1.5 text-sm font-medium whitespace-nowrap',
                filter === f.key ? 'bg-primary text-white' : 'bg-light-green text-primary')}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Driver list */}
      <div className="flex flex-col px-4 py-4 gap-3">
        {drivers.length === 0 && (
          <p className="text-caption text-neutral-gray text-center py-10">Không tìm thấy tài xế</p>
        )}
        {drivers.map((d) => (
          <div key={d.id} className="bg-white rounded-card shadow-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-light-green flex items-center justify-center text-primary font-bold shrink-0">
                {d.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-navy">{d.name}</p>
                <p className="text-caption text-neutral-gray">{d.phone}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <StatusBadge status={d.status} />
                  {d.is_online && (
                    <span className="text-[10px] font-semibold text-success-green bg-emerald-50 px-2 py-0.5 rounded-pill">● Online</span>
                  )}
                  <span className="text-caption text-neutral-gray">{d.trips_count} cuốc</span>
                  {d.rating != null && (
                    <span className="text-caption text-neutral-gray">★ {d.rating}</span>
                  )}
                </div>
              </div>
              {/* Action buttons */}
              <div className="flex flex-col gap-1.5 shrink-0">
                <button onClick={() => openEdit(d)}
                  className="text-xs bg-primary/10 text-primary rounded-pill px-3 py-1.5 font-medium">
                  Sửa
                </button>
                {d.status === 'pending' && (
                  <button onClick={() => approveMutation.mutate(d.id)}
                    className="text-xs bg-success-green text-white rounded-pill px-3 py-1.5 font-medium">
                    Duyệt
                  </button>
                )}
                {d.status !== 'blocked' && (
                  <button onClick={() => { setBlockTarget(d); setBlockReason('') }}
                    className="text-xs bg-danger-red text-white rounded-pill px-3 py-1.5 font-medium">
                    Block
                  </button>
                )}
              </div>
            </div>
            {/* Vehicle info row */}
            {(d.vehicle_make || d.vehicle_plate) && (
              <div className="mt-3 pt-3 border-t border-border-soft flex items-center gap-2 text-[12px] text-neutral-gray">
                <span className="material-symbols-outlined text-[14px]">directions_car</span>
                <span>{d.vehicle_make} {d.vehicle_model}</span>
                {d.vehicle_plate && <span className="font-semibold text-navy">· {d.vehicle_plate}</span>}
                {d.vehicle_color && <span>· {d.vehicle_color}</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Edit modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setEditTarget(null)}>
          <div className="bg-white w-full rounded-t-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft shrink-0">
              <p className="text-[15px] font-semibold text-navy">Chỉnh sửa tài xế</p>
              <button onClick={() => setEditTarget(null)}>
                <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Họ và tên</label>
                <input className={inputCls} value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <p className="text-[12px] font-semibold text-neutral-gray uppercase tracking-wide">Thông tin xe</p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['vehicle_make',  'Hãng xe',   'text'],
                  ['vehicle_model', 'Dòng xe',   'text'],
                ] as const).map(([key, label]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-[12px] text-neutral-gray font-medium">{label}</label>
                    <input className={inputCls} value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Biển số</label>
                <input className={inputCls} value={form.vehicle_plate}
                  onChange={(e) => setForm((f) => ({ ...f, vehicle_plate: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['vehicle_year',  'Năm SX',  'number'],
                  ['vehicle_color', 'Màu xe',  'text'],
                ] as const).map(([key, label, type]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-[12px] text-neutral-gray font-medium">{label}</label>
                    <input className={inputCls} type={type} value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 pb-6 pt-3 flex gap-3 shrink-0 border-t border-border-soft">
              <Button fullWidth variant="outline" onClick={() => setEditTarget(null)}>Huỷ</Button>
              <Button fullWidth loading={editMutation.isPending} onClick={() => editMutation.mutate()}>Lưu</Button>
            </div>
          </div>
        </div>
      )}

      {/* Block modal */}
      {blockTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-[430px] rounded-t-2xl p-6 flex flex-col gap-4">
            <div className="bg-danger-red/10 rounded-card p-4 text-center">
              <span className="material-symbols-outlined text-danger-red text-4xl">warning</span>
              <p className="text-sm font-semibold text-danger-red mt-2">Tài khoản này sẽ bị khoá. Xác nhận?</p>
              <p className="text-caption text-neutral-gray mt-1">{blockTarget.name} · {blockTarget.phone}</p>
            </div>
            <textarea value={blockReason} onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Lý do block..." rows={3}
              className="border border-border-gray rounded-input px-3 py-2 text-sm outline-none resize-none" />
            <div className="flex gap-3">
              <Button fullWidth variant="outline" onClick={() => setBlockTarget(null)}>Huỷ</Button>
              <Button fullWidth variant="danger" loading={blockMutation.isPending}
                disabled={!blockReason}
                onClick={() => blockMutation.mutate({ id: blockTarget.id, reason: blockReason })}>
                Block
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
