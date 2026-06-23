import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getDashboard, clearDashboardCache } from '@/api/admin'
import { useUiStore } from '@/stores/ui'
import StatusBadge from '@/components/common/StatusBadge'
import dayjs from 'dayjs'

interface KpiCardProps { icon: string; label: string; value: string; sub?: string; color?: string }
function KpiCard({ icon, label, value, sub, color = 'text-primary' }: KpiCardProps) {
  return (
    <div className="bg-white rounded-card shadow-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`material-symbols-outlined ${color}`}>{icon}</span>
        <span className="text-caption text-neutral-gray">{label}</span>
      </div>
      <p className="text-2xl font-bold text-navy">{value}</p>
      {sub && <p className="text-caption text-success-green mt-1">{sub}</p>}
    </div>
  )
}

export default function AdminDashboardPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: () => getDashboard().then((r) => r.data) })

  const clearCacheMutation = useMutation({
    mutationFn: clearDashboardCache,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      showToast('Đã xoá cache, đang tải dữ liệu mới', 'success')
    },
    onError: () => showToast('Xoá cache thất bại', 'error'),
  })

  return (
    <div className="flex flex-col px-4 py-4 gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-gray">Cập nhật mỗi 15 phút</p>
        <button
          onClick={() => clearCacheMutation.mutate()}
          disabled={clearCacheMutation.isPending}
          className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 rounded-pill px-3 py-1.5 disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-[14px] ${clearCacheMutation.isPending ? 'animate-spin' : ''}`}>
            refresh
          </span>
          Làm mới
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard icon="directions_car" label="Cuốc hôm nay"
          value={data?.trips_today?.toString() ?? '—'}
          sub={data?.trips_today_change != null ? `↑${data.trips_today_change}% vs hôm qua` : undefined} />
        <KpiCard icon="payments" label="Doanh thu" color="text-success-green"
          value={data ? `${(data.revenue_today / 1_000_000).toFixed(1)}M đ` : '—'} />
        <KpiCard icon="person" label="Tài xế online"
          value={data ? `${data.drivers_online}/${data.drivers_total}` : '—'} />
        <KpiCard icon="confirmation_number" label="Phí app thu" color="text-gold"
          value={data ? `${(data.app_fee_today / 1_000_000).toFixed(1)}M đ` : '—'} />
        <KpiCard
          icon="group_add"
          label="Điểm giới thiệu TX"
          value={data ? `${((data.driver_referral_points_total ?? 0) / 1_000_000).toFixed(1)}M đ` : '—'}
        />
        <KpiCard
          icon="redeem"
          label="Voucher giới thiệu KH"
          color="text-gold"
          value={data ? `${((data.customer_referral_vouchers_total ?? 0) / 1_000_000).toFixed(1)}M đ` : '—'}
        />
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 overflow-x-auto">
        {[
          { label: 'Duyệt tài xế', icon: 'how_to_reg', to: '/admin/drivers' },
          { label: 'Tạo voucher',  icon: 'confirmation_number', to: '/admin/vouchers' },
          { label: 'Báo cáo',     icon: 'bar_chart', to: '/admin/revenue' },
        ].map(({ label, icon, to }) => (
          <button key={label} onClick={() => navigate(to)}
            className="flex items-center gap-2 bg-white rounded-card shadow-card px-4 py-3 text-sm font-medium text-navy whitespace-nowrap">
            <span className="material-symbols-outlined text-primary text-xl">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Recent trips table */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border-gray">
          <p className="text-sm font-semibold text-navy">Chuyến gần đây</p>
        </div>
        {data?.recent_trips?.map((trip) => (
          <div key={trip.id} className="px-4 py-3 border-b border-border-gray last:border-b-0 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs text-neutral-gray">#{trip.id}</span>
                <span className="text-sm text-navy font-medium truncate">{trip.customer_name}</span>
                <span className="text-xs text-neutral-gray">→</span>
                <span className="text-sm text-neutral-gray truncate">{trip.driver_name}</span>
              </div>
              <p className="text-caption text-neutral-gray truncate">{trip.route}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <StatusBadge status={trip.status} />
              <span className="text-caption text-neutral-gray">{dayjs(trip.created_at).format('HH:mm')}</span>
            </div>
          </div>
        ))}
        {!data?.recent_trips?.length && (
          <p className="text-caption text-neutral-gray text-center py-6">Không có dữ liệu</p>
        )}
      </div>
    </div>
  )
}
