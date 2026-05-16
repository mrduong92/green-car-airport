import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDrivers, blockDriver, approveDriver } from '@/api/admin'
import { useUiStore } from '@/stores/ui'
import StatusBadge from '@/components/common/StatusBadge'
import Button from '@/components/common/Button'
import clsx from 'clsx'

const FILTERS = [
  { key: '', label: 'Tất cả' },
  { key: 'active', label: 'Đang hoạt động' },
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'blocked', label: 'Đã block' },
]

export default function DriversPage() {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [blockTarget, setBlockTarget] = useState<App.DriverProfile | null>(null)
  const [blockReason, setBlockReason] = useState('')

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers', filter, search],
    queryFn: () => getDrivers({ status: filter || undefined, search: search || undefined }).then((r) => r.data.data),
  })

  const blockMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => blockDriver(id, reason),
    onSuccess: () => { showToast('Đã block tài xế', 'success'); qc.invalidateQueries({ queryKey: ['drivers'] }); setBlockTarget(null) },
    onError: () => showToast('Thao tác thất bại', 'error'),
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => approveDriver(id),
    onSuccess: () => { showToast('Đã duyệt tài xế', 'success'); qc.invalidateQueries({ queryKey: ['drivers'] }) },
    onError: () => showToast('Thao tác thất bại', 'error'),
  })

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
        {drivers.map((d) => (
          <div key={d.id} className="bg-white rounded-card shadow-card p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-light-green flex items-center justify-center text-primary font-bold shrink-0">
              {d.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-navy">{d.name}</p>
              <p className="text-caption text-neutral-gray">{d.phone}</p>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={d.status} />
                <span className="text-caption text-neutral-gray">{d.points} điểm · {d.trips_count} cuốc</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {d.status === 'pending' && (
                <button onClick={() => approveMutation.mutate(d.id)}
                  className="text-xs bg-primary text-white rounded-pill px-3 py-1.5 font-medium">
                  Duyệt
                </button>
              )}
              {d.status !== 'blocked' && (
                <button onClick={() => setBlockTarget(d)}
                  className="text-xs bg-danger-red text-white rounded-pill px-3 py-1.5 font-medium">
                  Block
                </button>
              )}
            </div>
          </div>
        ))}
        {drivers.length === 0 && (
          <p className="text-caption text-neutral-gray text-center py-10">Không tìm thấy tài xế</p>
        )}
      </div>

      {/* Block modal */}
      {blockTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-[430px] rounded-t-2xl p-6 flex flex-col gap-4">
            <div className="bg-danger-red/10 rounded-card p-4 text-center">
              <span className="material-symbols-outlined text-danger-red text-4xl">warning</span>
              <p className="text-sm font-semibold text-danger-red mt-2">
                Tài khoản này sẽ bị khoá vĩnh viễn. Xác nhận?
              </p>
              <p className="text-caption text-neutral-gray mt-1">{blockTarget.name} · {blockTarget.phone}</p>
            </div>
            <textarea value={blockReason} onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Lý do block..." rows={3}
              className="border border-border-gray rounded-input px-3 py-2 text-sm outline-none resize-none" />
            <div className="flex gap-3">
              <Button fullWidth variant="outline" onClick={() => setBlockTarget(null)}>Huỷ</Button>
              <Button fullWidth variant="danger"
                loading={blockMutation.isPending}
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
