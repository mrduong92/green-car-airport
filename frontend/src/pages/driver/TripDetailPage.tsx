import { useState, lazy, Suspense } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMyTrips, updateTripStatus, cancelTrip } from '@/api/trips'
import dayjs from 'dayjs'
import { fmtDateTime } from '@/utils/date'
import { useUiStore } from '@/stores/ui'
import Button from '@/components/common/Button'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import StatusBadge from '@/components/common/StatusBadge'

const GoongTripMap = lazy(() => import('@/components/common/GoongTripMap'))

const NEXT_STEP: Partial<Record<App.TripStatus, { status: App.TripStatus; label: string }>> = {
  accepted:    { status: 'in_progress', label: 'Đã đón khách' },
  in_progress: { status: 'completed',   label: 'Hoàn thành chuyến' },
}

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [earlyOpen, setEarlyOpen]   = useState(false)

  const { data: trips, isPending } = useQuery({
    queryKey: ['my-trips'],
    queryFn: () => getMyTrips().then((r) => r.data),
    refetchOnMount: 'always',
  })
  const trip = trips?.find((t) => t.id === Number(id))

  const statusMutation = useMutation({
    mutationFn: (status: App.TripStatus) => updateTripStatus(Number(id), status),
    onSuccess: (_, status) => {
      qc.invalidateQueries({ queryKey: ['my-trips'] })
      qc.invalidateQueries({ queryKey: ['trips'] })
      if (status === 'completed') {
        qc.invalidateQueries({ queryKey: ['trip-history'] })
        qc.invalidateQueries({ queryKey: ['wallet'] })
        qc.invalidateQueries({ queryKey: ['transactions'] })
        showToast('Hoàn thành chuyến!', 'success')
        navigate('/driver/trips')
      }
    },
    onError: () => showToast('Cập nhật thất bại', 'error'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelTrip(Number(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-trips'] })
      qc.invalidateQueries({ queryKey: ['trips'] })
      qc.invalidateQueries({ queryKey: ['wallet'] })
      showToast('Đã huỷ cuốc', 'info')
      navigate('/driver/trips', { replace: true })
    },
    onError: () => { showToast('Huỷ cuốc thất bại', 'error'); setCancelOpen(false) },
  })

  if (isPending) return (
    <div className="flex items-center justify-center h-40">
      <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
    </div>
  )

  if (!trip) return (
    <div className="flex flex-col items-center justify-center h-40 gap-2 px-6 text-center">
      <span className="material-symbols-outlined text-4xl text-neutral-dim">search_off</span>
      <p className="text-sm text-neutral-gray">Không tìm thấy cuốc xe này</p>
      <button onClick={() => navigate('/driver/trips')} className="text-primary text-sm font-medium">
        Quay lại danh sách
      </button>
    </div>
  )

  if (trip.status === 'cancelled') return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
        <span className="material-symbols-outlined text-3xl text-danger-red"
              style={{ fontVariationSettings: "'FILL' 1" }}>cancel</span>
      </div>
      <div>
        <p className="text-[16px] font-semibold text-navy">Khách đã hủy cuốc xe</p>
        <p className="text-sm text-neutral-gray mt-1">Cuốc #{trip.id} đã bị hủy bởi khách hàng</p>
      </div>
      <Button variant="outline" onClick={() => navigate('/driver/trips')}>
        Quay lại danh sách
      </Button>
    </div>
  )

  const nextStep = NEXT_STEP[trip.status] ?? null

  // Cuốc đặt cho NGÀY khác hôm nay -> hỏi lại trước khi đổi trạng thái.
  // So sánh theo ngày (không theo giờ) đúng như yêu cầu: tài xế đến sớm vài
  // phút trong cùng ngày là chuyện bình thường, hỏi lại sẽ thành phiền.
  // `trip.date` là chuỗi 'YYYY-MM-DD' nên so sánh chuỗi là đủ và không dính
  // lệch múi giờ như khi dựng Date rồi so.
  const isEarly = !!trip.date && trip.date > dayjs().format('YYYY-MM-DD')

  const hasMap = trip.pickup_lat && trip.pickup_lng && trip.destination_lat && trip.destination_lng

  return (
    <div className="w-full flex flex-col gap-4 px-4 py-4">
      <div className="flex items-center justify-between">
        <span className="text-caption text-neutral-gray">Cuốc #{trip.id}</span>
        <StatusBadge status={trip.status} />
      </div>

      {/* Map */}
      <div className="rounded-card overflow-hidden h-48 bg-primary-tint">
        {hasMap ? (
          <Suspense fallback={
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
              <p className="text-caption text-neutral-gray">Đang tải bản đồ...</p>
            </div>
          }>
            <GoongTripMap
              pickupLat={trip.pickup_lat!}
              pickupLng={trip.pickup_lng!}
              destLat={trip.destination_lat!}
              destLng={trip.destination_lng!}
            />
          </Suspense>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-4xl text-primary">map</span>
            <p className="text-caption text-neutral-gray">Không có tọa độ tuyến đường</p>
          </div>
        )}
      </div>

      {/* Route summary */}
      <div className="bg-white rounded-card shadow-card p-4 flex gap-3">
        <div className="flex flex-col items-center pt-1 shrink-0">
          <span className="material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
          <div className="w-[2px] flex-1 bg-border-gray my-0.5 min-h-[20px]" />
          <span className="material-symbols-outlined text-gold text-base" style={{ fontVariationSettings: "'FILL' 1" }}>flag</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-navy truncate">{trip.pickup}</p>
          <p className="text-[11px] text-neutral-gray my-1.5">{trip.distance_km} km · ~{trip.duration_min} phút</p>
          <p className="text-sm font-semibold text-navy truncate">{trip.destination}</p>
        </div>
      </div>

      {/* Customer info */}
      <div className="bg-white rounded-card shadow-card p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary-tint flex items-center justify-center text-primary font-bold shrink-0">K</div>
        <span className="flex-1 text-sm text-navy">{trip.customer_phone_masked}</span>
        <a href={`tel:${trip.customer_phone}`}
          className="w-10 h-10 rounded-full bg-primary-tint flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-xl">call</span>
        </a>
      </div>

      {/* Customer note */}
      {trip.customer_note && (
        <div className="bg-alert-orange/10 rounded-card p-4 flex gap-3">
          <span className="material-symbols-outlined text-alert-orange text-xl shrink-0"
            style={{ fontVariationSettings: "'FILL' 1" }}>sticky_note_2</span>
          <div>
            <p className="text-[11px] font-semibold text-alert-orange mb-0.5">Ghi chú của khách</p>
            <p className="text-sm text-navy">{trip.customer_note}</p>
          </div>
        </div>
      )}

      {/* Trip specs */}
      <div className="bg-white rounded-card shadow-card p-4 grid grid-cols-2 gap-3">
        {[
          { icon: 'calendar_today', label: 'Ngày giờ',      value: fmtDateTime(trip.date, trip.time) },
          { icon: 'straighten',     label: 'Khoảng cách',   value: `${trip.distance_km} km` },
          { icon: 'payments',       label: 'Giá khách trả', value: `${trip.final_price.toLocaleString('vi')} đ` },
          { icon: 'receipt',        label: 'Phí app (20%)', value: `${trip.app_fee.toLocaleString('vi')} đ` },
        ].map(({ icon, label, value }) => (
          <div key={label} className="flex flex-col gap-1">
            <div className="flex items-center gap-1 text-[11px] text-neutral-gray">
              <span className="material-symbols-outlined text-sm">{icon}</span>
              {label}
            </div>
            <span className="text-sm font-medium text-navy">{value}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      {nextStep && (
        <Button fullWidth size="lg" loading={statusMutation.isPending}
          onClick={() => isEarly ? setEarlyOpen(true) : statusMutation.mutate(nextStep.status)}>
          {nextStep.label}
        </Button>
      )}
      {['accepted', 'picking_up'].includes(trip.status) && (
        <button
          onClick={() => setCancelOpen(true)}
          className="w-full text-center text-[13px] text-danger-red underline py-1"
        >
          Huỷ cuốc
        </button>
      )}

      {/* Cuốc đặt trước: bấm nhầm là KHÔNG lùi lại được (không có đường chuyển
          completed/in_progress ngược về accepted), nên chặn bằng một lần xác nhận. */}
      <ConfirmDialog
        open={earlyOpen}
        title={`Cuốc này đặt cho ${fmtDateTime(trip.date, trip.time)}`}
        description={
          nextStep?.status === 'completed'
            ? 'Chưa tới ngày đón khách. Hoàn thành bây giờ sẽ chốt cuốc và trừ phí app — KHÔNG hoàn tác được. Bạn chắc chắn chứ?'
            : 'Chưa tới ngày đón khách. Bạn chắc chắn muốn bắt đầu cuốc này bây giờ? Thao tác này KHÔNG hoàn tác được.'
        }
        confirmLabel={nextStep?.label ?? 'Xác nhận'}
        loading={statusMutation.isPending}
        onConfirm={() => { if (nextStep) statusMutation.mutate(nextStep.status); setEarlyOpen(false) }}
        onCancel={() => setEarlyOpen(false)}
      />

      <ConfirmDialog
        open={cancelOpen}
        title="Xác nhận huỷ cuốc?"
        description={`Phí app 20% (${trip.app_fee.toLocaleString('vi')}đ) đã trừ khi nhận sẽ không được hoàn lại.`}
        confirmLabel="Xác nhận huỷ"
        loading={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate()}
        onCancel={() => setCancelOpen(false)}
      />
    </div>
  )
}
