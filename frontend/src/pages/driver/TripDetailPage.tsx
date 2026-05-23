import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMyTrips, updateTripStatus } from '@/api/trips'
import { useUiStore } from '@/stores/ui'
import Button from '@/components/common/Button'
import StatusBadge from '@/components/common/StatusBadge'

const STATUS_FLOW: { status: App.TripStatus; label: string }[] = [
  { status: 'picking_up',  label: 'Đang đến đón' },
  { status: 'in_progress', label: 'Đang chạy' },
  { status: 'completed',   label: 'Hoàn thành' },
]

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)

  const { data: trips = [] } = useQuery({
    queryKey: ['my-trips'],
    queryFn: () => getMyTrips().then((r) => r.data),
  })
  const trip = trips.find((t) => t.id === Number(id))

  const statusMutation = useMutation({
    mutationFn: (status: App.TripStatus) => updateTripStatus(Number(id), status),
    onSuccess: (_, status) => {
      qc.invalidateQueries({ queryKey: ['trips'] })
      if (status === 'completed') { showToast('Hoàn thành chuyến!', 'success'); navigate('/driver/trips') }
    },
    onError: () => showToast('Cập nhật thất bại', 'error'),
  })

  if (!trip) return (
    <div className="flex items-center justify-center h-40">
      <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
    </div>
  )

  const nextStep = STATUS_FLOW.find((s) =>
    trip.status === 'accepted' ? s.status === 'picking_up' :
    trip.status === 'picking_up' ? s.status === 'in_progress' :
    trip.status === 'in_progress' ? s.status === 'completed' : false
  )

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="flex items-center justify-between">
        <span className="text-caption text-neutral-gray">Cuốc #{trip.id}</span>
        <StatusBadge status={trip.status} />
      </div>

      {/* Map placeholder */}
      <div className="bg-light-green rounded-card h-40 flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-4xl text-primary">map</span>
          <p className="text-caption text-neutral-gray mt-1">Bản đồ tuyến đường</p>
        </div>
      </div>

      {/* Customer info */}
      <div className="bg-white rounded-card shadow-card p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-light-green flex items-center justify-center text-primary font-bold">K</div>
        <span className="flex-1 text-sm text-navy">{trip.customer_phone_masked}</span>
        <a href={`tel:${trip.customer_phone_masked}`}
          className="w-10 h-10 rounded-full bg-light-green flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-xl">call</span>
        </a>
      </div>

      {/* Trip specs */}
      <div className="bg-white rounded-card shadow-card p-4 grid grid-cols-2 gap-3">
        {[
          { icon: 'calendar_today', label: 'Ngày giờ', value: `${trip.date} ${trip.time}` },
          { icon: 'straighten',     label: 'Khoảng cách', value: `${trip.distance_km} km` },
          { icon: 'payments',       label: 'Giá khách trả', value: `${trip.price.toLocaleString('vi')} đ` },
          { icon: 'receipt',        label: 'Phí app (20%)', value: `${trip.app_fee.toLocaleString('vi')} đ` },
        ].map(({ icon, label, value }) => (
          <div key={label} className="flex flex-col gap-1">
            <div className="flex items-center gap-1 text-caption text-neutral-gray">
              <span className="material-symbols-outlined text-sm">{icon}</span>
              {label}
            </div>
            <span className="text-sm font-medium text-navy">{value}</span>
          </div>
        ))}
      </div>

      {/* Net earnings */}
      <div className="bg-light-green rounded-card p-4 text-center">
        <p className="text-caption text-neutral-gray mb-1">Bạn nhận</p>
        <p className="text-3xl font-bold text-primary">{trip.net_earning.toLocaleString('vi')} đ</p>
      </div>

      {/* Action */}
      {nextStep && (
        <Button fullWidth size="lg" loading={statusMutation.isPending}
          onClick={() => statusMutation.mutate(nextStep.status)}>
          {nextStep.label}
        </Button>
      )}
      {trip.status === 'accepted' && (
        <Button fullWidth variant="ghost" onClick={() => navigate(-1)}>Bỏ qua</Button>
      )}
    </div>
  )
}
