import { lazy, Suspense, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getBooking, cancelBooking } from '@/api/bookings'
import { useMutation } from '@tanstack/react-query'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import StatusBadge from '@/components/common/StatusBadge'
import VipBadge from '@/components/common/VipBadge'
import Button from '@/components/common/Button'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import { fmtDateTime } from '@/utils/date'
import dayjs from 'dayjs'
import clsx from 'clsx'

const GoongTripMap = lazy(() => import('@/components/common/GoongTripMap'))

const STEPS: { key: App.BookingStatus; label: string }[] = [
  { key: 'pending',        label: 'Đã đặt xe' },
  { key: 'finding_driver', label: 'Đang tìm tài xế' },
  { key: 'accepted',       label: 'Tài xế đang đón' },
  { key: 'in_progress',   label: 'Đang di chuyển' },
  { key: 'completed',      label: 'Hoàn thành' },
]
const ORDER: App.BookingStatus[] = ['pending', 'finding_driver', 'accepted', 'in_progress', 'completed']

const STATUS_INFO: Record<string, { label: string; icon: string; bg: string; step: string }> = {
  accepted:    {
    label: 'Tài xế đang trên đường đến đón bạn',
    icon:  'directions_car',
    bg:    'linear-gradient(135deg, #006a36 0%, #004d27 100%)',
    step:  'Bước 1/2 · Đang đón',
  },
  in_progress: {
    label: 'Bạn đang trên đường đến sân bay',
    icon:  'route',
    bg:    'linear-gradient(135deg, #059669 0%, #047857 100%)',
    step:  'Bước 2/2 · Đang di chuyển',
  },
}

export default function BookingStatusPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const showToast = useUiStore((s) => s.showToast)
  const isCollaborator = useAuthStore((s) => s.user?.is_collaborator ?? false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data, refetch } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => getBooking(Number(id)).then((r) => r.data),
  })

  const [reasonOpen, setReasonOpen] = useState(false)
  const [selectedReason, setSelectedReason] = useState<string>('')

  const cancelMutation = useMutation({
    mutationFn: () => cancelBooking(Number(id), selectedReason || undefined),
    onSuccess: () => { showToast('Đã huỷ chuyến', 'info'); setConfirmOpen(false); setReasonOpen(false); refetch() },
    onError: () => { showToast('Không thể huỷ chuyến', 'error'); setConfirmOpen(false); setReasonOpen(false) },
  })

  const booking = data
  const currentIdx = ORDER.indexOf(booking?.status ?? 'pending')
  const minutesSinceAccepted = booking?.accepted_at
    ? dayjs().diff(dayjs(booking.accepted_at), 'minute')
    : 0
  const canCancel = booking && ['finding_driver', 'accepted'].includes(booking.status)
  const isFreeCancel = !booking?.accepted_at || minutesSinceAccepted < 60
  const minutesLeft = booking?.accepted_at ? Math.max(0, 60 - minutesSinceAccepted) : 60

  if (!booking) return (
    <div className="flex items-center justify-center h-40">
      <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
    </div>
  )

  const isActive = ['accepted', 'in_progress'].includes(booking.status)

  // Cuốc đặt trước: tài xế mới NHẬN cuốc chứ chưa lên đường. Dùng chung nhãn
  // "đang trên đường đến đón bạn" cho cả cuốc của 2 ngày sau là sai thực tế —
  // khách sẽ tưởng xe đang tới và gọi điện hỏi tài xế đang ở đâu.
  //
  // So sánh theo NGÀY (không theo giờ), khớp với modal xác nhận bên app tài xế:
  // trong cùng ngày thì tài xế sắp đi đón thật, nói "đang đến đón" là đúng.
  // `booking.date` là chuỗi 'YYYY-MM-DD' nên so chuỗi là đủ, không dính lệch múi giờ.
  const isScheduledAhead =
    booking.status === 'accepted' && !!booking.date && booking.date.slice(0, 10) > dayjs().format('YYYY-MM-DD')

  const statusInfo = isScheduledAhead
    ? {
        ...STATUS_INFO.accepted,
        label: `Tài xế đã nhận cuốc · Đón bạn lúc ${fmtDateTime(booking.date, booking.time)}`,
        icon:  'event_available',
        step:  'Đã có tài xế · Chờ đến giờ đón',
      }
    : STATUS_INFO[booking.status]
  const hasMap = booking.pickup_lat && booking.pickup_lng && booking.destination_lat && booking.destination_lng

  // ── In-progress view ─────────────────────────────────────────────────────
  if (isActive) {
    const progressPct = booking.status === 'in_progress' ? 100 : 50
    return (
      <div className="w-full flex flex-col gap-4 pb-6">
        {/* Status header */}
        <div className="px-4 py-5 flex flex-col gap-2" style={{ background: statusInfo.bg }}>
          {/* Top row */}
          <div className="flex items-center gap-2">
            {/* Chấm nhấp nháy = "đang diễn ra". Cuốc còn chờ tới ngày thì để
                tĩnh, nhấp nháy sẽ khiến khách tưởng xe đang chạy tới. */}
            <span className={clsx(
              'inline-block w-2 h-2 rounded-full bg-white/80',
              !isScheduledAhead && 'animate-pulse',
            )} />
            <span className="text-white/70 text-[11px] font-semibold uppercase tracking-widest flex-1">
              {statusInfo.step}
            </span>
            {booking.is_vip && <VipBadge />}
            <StatusBadge status={booking.status} />
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 rounded-full bg-white/25 overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-all duration-700 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-white/60 text-[11px] shrink-0">{progressPct}%</span>
          </div>

          {/* Main label + icon */}
          <div className="flex items-center gap-3 mt-1">
            <span className="material-symbols-outlined text-white text-[28px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}>
              {statusInfo.icon}
            </span>
            <div>
              <p className="text-white text-[16px] font-bold leading-snug">{statusInfo.label}</p>
              <p className="text-white/50 text-[11px] mt-0.5">
                Đơn #{booking.id} · {fmtDateTime(booking.date, booking.time)}
              </p>
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="mx-4 rounded-card overflow-hidden h-52 bg-primary-tint">
          {hasMap ? (
            <Suspense fallback={
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
                <p className="text-caption text-neutral-gray">Đang tải bản đồ...</p>
              </div>
            }>
              <GoongTripMap
                pickupLat={booking.pickup_lat!}
                pickupLng={booking.pickup_lng!}
                destLat={booking.destination_lat!}
                destLng={booking.destination_lng!}
              />
            </Suspense>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <span className="material-symbols-outlined text-4xl text-primary">map</span>
              <p className="text-caption text-neutral-gray">Không có tọa độ tuyến đường</p>
            </div>
          )}
        </div>

        {/* Driver card */}
        {booking.driver && (
          <div className="mx-4 bg-white rounded-card shadow-card p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary-tint flex items-center justify-center text-primary font-bold text-lg shrink-0">
              {booking.driver.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-navy text-[14px]">{booking.driver.name}</p>
              {booking.driver.rating != null && (
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-gold text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <span className="text-[12px] text-neutral-gray">{booking.driver.rating}</span>
                </div>
              )}
              <p className="text-[12px] text-neutral-gray truncate">
                {[booking.driver.vehicle_color, booking.driver.vehicle_make, booking.driver.vehicle_model].filter(Boolean).join(' ')}
                {booking.driver.vehicle_plate ? ` · ${booking.driver.vehicle_plate}` : ''}
              </p>
            </div>
            {booking.driver.phone && (
              <a href={`tel:${booking.driver.phone}`}
                className="w-11 h-11 rounded-full bg-primary-tint flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-xl">call</span>
              </a>
            )}
          </div>
        )}

        {/* Route card */}
        <div className="mx-4 bg-white rounded-card shadow-card p-4 flex gap-3">
          <div className="flex flex-col items-center pt-1 shrink-0">
            <span className="material-symbols-outlined text-primary text-base"
                  style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
            <div className="w-[2px] flex-1 bg-border-gray my-0.5 min-h-[20px]" />
            <span className="material-symbols-outlined text-gold text-base"
                  style={{ fontVariationSettings: "'FILL' 1" }}>flag</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-navy truncate">{booking.pickup}</p>
            <p className="text-[11px] text-neutral-gray my-1.5">{booking.distance_km} km</p>
            <p className="text-sm font-semibold text-navy truncate">{booking.destination}</p>
          </div>
        </div>

        {/* Price */}
        <div className="mx-4 bg-primary-tint rounded-card p-4 flex items-center justify-between">
          <span className="text-[13px] text-neutral-gray">Tổng thanh toán</span>
          <span className="text-[18px] font-bold text-primary tabular-nums">
            {(booking.final_price ?? booking.price).toLocaleString('vi')} đ
          </span>
        </div>

        {/* Note */}
        {booking.note && (
          <div className="mx-4 bg-white rounded-card shadow-card p-4 flex gap-3">
            <span className="material-symbols-outlined text-neutral-gray text-xl shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}>sticky_note_2</span>
            <div>
              <p className="text-[11px] font-semibold text-neutral-gray mb-0.5">Ghi chú cho tài xế</p>
              <p className="text-sm text-navy">{booking.note}</p>
            </div>
          </div>
        )}

        {/* Cancel section */}
        {canCancel && (
          <div className="mx-4 flex flex-col items-center gap-2 pb-2">
            {isFreeCancel ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-success-green bg-light-green px-3 py-1 rounded-pill">
                <span className="material-symbols-outlined text-[14px]">timer</span>
                {booking.accepted_at ? `Huỷ miễn phí · còn ${minutesLeft} phút` : 'Huỷ miễn phí'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-danger-red bg-red-50 px-3 py-1 rounded-pill">
                <span className="material-symbols-outlined text-[14px]">warning</span>
                Huỷ sẽ bị phạt 50,000đ
              </span>
            )}
            <button
              onClick={() => setReasonOpen(true)}
              className="text-danger-red text-sm text-center underline"
            >
              Huỷ chuyến
            </button>
          </div>
        )}

        {isCollaborator && (
          <div className="mx-4 pb-2">
            <Button fullWidth variant="outline" onClick={() => navigate('/customer/booking')}>
              + Đặt xe mới
            </Button>
          </div>
        )}

        {/* Reason selector modal */}
        {reasonOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setReasonOpen(false)}>
            <div className="w-full max-w-md bg-white rounded-t-2xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
              <p className="text-[15px] font-semibold text-navy mb-4">Lý do huỷ chuyến</p>
              <div className="flex flex-col gap-2">
                {['Tài xế yêu cầu hủy', 'Đổi lộ trình', 'Đổi xe khác', 'Lý do khác'].map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setSelectedReason(reason)}
                    className={`w-full text-left px-4 py-3 rounded-input border text-sm transition-colors ${
                      selectedReason === reason
                        ? 'border-primary bg-light-green text-primary font-medium'
                        : 'border-border-gray text-navy'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => { setReasonOpen(false); setSelectedReason('') }}
                  className="flex-1 py-3 rounded-input border border-border-gray text-sm text-neutral-gray"
                >
                  Đóng
                </button>
                <button
                  onClick={() => { setReasonOpen(false); setConfirmOpen(true) }}
                  disabled={!selectedReason}
                  className="flex-1 py-3 rounded-input bg-danger-red text-white text-sm font-semibold disabled:opacity-40"
                >
                  Tiếp tục
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={confirmOpen}
          title={isFreeCancel ? 'Xác nhận huỷ chuyến?' : 'Huỷ chuyến · Phạt 50,000đ'}
          description={[
            isFreeCancel
              ? 'Chuyến sẽ bị huỷ và tài xế sẽ không được phân công.'
              : 'Bạn đã quá 1 giờ kể từ khi tài xế nhận cuốc. Phí phạt 50,000đ sẽ được cộng vào cuốc xe tiếp theo.',
            booking.voucher_code
              ? `Voucher ${booking.voucher_code} đã dùng sẽ không được hoàn lại.`
              : '',
          ].filter(Boolean).join(' ')}
          confirmLabel="Xác nhận huỷ"
          loading={cancelMutation.isPending}
          onConfirm={() => cancelMutation.mutate()}
          onCancel={() => setConfirmOpen(false)}
        />
      </div>
    )
  }

  // ── Standard status view ─────────────────────────────────────────────────
  return (
    <div className="w-full flex flex-col gap-4 px-4 py-4">
      {/* Booking ref + status */}
      <div className="flex items-center justify-between">
        <span className="text-caption text-neutral-gray">Đơn #{booking.id}</span>
        <div className="flex items-center gap-1.5">
          {booking.is_vip && <VipBadge />}
          <StatusBadge status={booking.status} />
        </div>
      </div>

      {/* Progress stepper */}
      <div className="bg-white rounded-card shadow-card p-4">
        {STEPS.map((step, i) => {
          const allDone = booking.status === 'completed'
          const done   = allDone || currentIdx > i
          const active = !allDone && currentIdx === i
          return (
            <div key={step.key} className="flex items-start gap-3 mb-3 last:mb-0">
              <div className={clsx(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
                done ? 'bg-success-green text-white' : active ? 'bg-primary text-white' : 'bg-border-gray text-neutral-gray',
              )}>
                {done
                  ? <span className="material-symbols-outlined text-sm">check</span>
                  : <span>{i + 1}</span>
                }
              </div>
              <div className="flex-1">
                <span className={clsx('text-sm',
                  active ? 'font-semibold text-navy' : done ? 'text-neutral-gray' : 'text-neutral-gray/60',
                )}>
                  {step.label}
                </span>
              </div>
              {active && (
                <span className="material-symbols-outlined text-primary animate-spin text-sm mt-0.5">
                  progress_activity
                </span>
              )}
            </div>
          )
        })}
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
              pickupLat={booking.pickup_lat!}
              pickupLng={booking.pickup_lng!}
              destLat={booking.destination_lat!}
              destLng={booking.destination_lng!}
            />
          </Suspense>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-4xl text-primary">map</span>
            <p className="text-caption text-neutral-gray">Không có tọa độ tuyến đường</p>
          </div>
        )}
      </div>

      {/* Trip summary */}
      <div className="bg-white rounded-card shadow-card p-4 flex flex-col gap-2.5">
        {/* Route */}
        <div className="flex gap-3">
          <div className="flex flex-col items-center pt-0.5 shrink-0">
            <span className="material-symbols-outlined text-primary text-base"
                  style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
            <div className="w-[2px] flex-1 bg-border-gray my-0.5 min-h-[14px]" />
            <span className="material-symbols-outlined text-orange-500 text-base"
                  style={{ fontVariationSettings: "'FILL' 1" }}>flight_takeoff</span>
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <p className="text-sm text-navy leading-tight">{booking.pickup}</p>
            <p className="text-sm text-navy leading-tight">{booking.destination}</p>
          </div>
        </div>

        <div className="h-px bg-border-gray" />

        {/* Thời gian + khoảng cách */}
        <div className="flex justify-between text-[12px] text-neutral-gray">
          <span>{fmtDateTime(booking.date, booking.time)}</span>
          <span>{booking.distance_km} km</span>
        </div>

        <div className="h-px bg-border-gray" />

        {/* Price breakdown */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[13px]">
            <span className="text-neutral-gray">Giá cuốc</span>
            <span className="text-navy font-medium">{booking.price.toLocaleString('vi')}đ</span>
          </div>

          {(booking.discount ?? 0) > 0 && (
            <>
              <div className="flex justify-between text-[13px]">
                <div className="flex items-center gap-1.5 text-neutral-gray">
                  <span className="material-symbols-outlined text-[13px]">confirmation_number</span>
                  <span className="font-mono">{booking.voucher_code}</span>
                </div>
                <span className="text-success-green font-medium">-{(booking.discount ?? 0).toLocaleString('vi')}đ</span>
              </div>
              <p className="text-[11px] text-neutral-gray">Giảm tối đa 10% giá cuốc</p>
            </>
          )}

          {(booking.surcharge ?? 0) > 0 && (
            <div className="flex justify-between text-[13px]">
              <span className="text-neutral-gray">Phụ phí huỷ trước</span>
              <span className="text-danger-red font-medium">+{(booking.surcharge ?? 0).toLocaleString('vi')}đ</span>
            </div>
          )}

          {(booking.collection_fee ?? 0) > 0 && (
            <div className="flex justify-between text-[13px]">
              <span className="text-neutral-gray">Thu hộ</span>
              <span className="text-navy font-medium">+{(booking.collection_fee ?? 0).toLocaleString('vi')}đ</span>
            </div>
          )}

          <div className="h-px bg-border-gray mt-0.5" />

          <div className="flex justify-between">
            <span className="text-[13px] font-semibold text-navy">Tổng thanh toán</span>
            <span className="text-[16px] font-bold text-primary">{(booking.final_price ?? booking.price).toLocaleString('vi')}đ</span>
          </div>
        </div>
      </div>

      {/* Note */}
      {booking.note && (
        <div className="bg-white rounded-card shadow-card p-4 flex gap-3">
          <span className="material-symbols-outlined text-neutral-gray text-xl shrink-0"
            style={{ fontVariationSettings: "'FILL' 1" }}>sticky_note_2</span>
          <div>
            <p className="text-[11px] font-semibold text-neutral-gray mb-0.5">Ghi chú cho tài xế</p>
            <p className="text-sm text-navy">{booking.note}</p>
          </div>
        </div>
      )}

      {/* Driver card (appears after accepted) */}
      {booking.driver && (
        <div className="bg-white rounded-card shadow-card p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-light-green flex items-center justify-center text-primary font-bold text-lg shrink-0">
            {booking.driver.name[0]}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-navy text-sm">{booking.driver.name}</p>
            {booking.driver.rating != null && (
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-gold text-sm">star</span>
                <span className="text-caption text-neutral-gray">{booking.driver.rating}</span>
              </div>
            )}
            <p className="text-caption text-neutral-gray">
              {booking.driver.vehicle_make} {booking.driver.vehicle_model} · {booking.driver.vehicle_plate}
            </p>
          </div>
          {booking.driver.phone && (
            <a href={`tel:${booking.driver.phone}`}
              className="w-10 h-10 rounded-full bg-light-green flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-xl">call</span>
            </a>
          )}
        </div>
      )}

      {/* Actions */}
      {canCancel && (
        <div className="flex flex-col items-center gap-2">
          {isFreeCancel ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-success-green bg-light-green px-3 py-1 rounded-pill">
              <span className="material-symbols-outlined text-[14px]">timer</span>
              {booking?.accepted_at ? `Huỷ miễn phí · còn ${minutesLeft} phút` : 'Huỷ miễn phí'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-danger-red bg-red-50 px-3 py-1 rounded-pill">
              <span className="material-symbols-outlined text-[14px]">warning</span>
              Huỷ sẽ bị phạt 50,000đ
            </span>
          )}
          <button
            onClick={() => setReasonOpen(true)}
            className="text-danger-red text-sm text-center underline"
          >
            Huỷ chuyến
          </button>
        </div>
      )}
      {(booking.status === 'completed' || booking.status === 'cancelled' || isCollaborator) && (
        <Button fullWidth variant="outline" onClick={() => navigate('/customer/booking')}>
          {booking.status === 'completed' || booking.status === 'cancelled' ? 'Đặt xe mới' : '+ Đặt xe mới'}
        </Button>
      )}

      {/* Reason selector modal */}
      {reasonOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setReasonOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-t-2xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <p className="text-[15px] font-semibold text-navy mb-4">Lý do huỷ chuyến</p>
            <div className="flex flex-col gap-2">
              {['Tài xế yêu cầu hủy', 'Đổi lộ trình', 'Đổi xe khác', 'Lý do khác'].map((reason) => (
                <button
                  key={reason}
                  onClick={() => setSelectedReason(reason)}
                  className={`w-full text-left px-4 py-3 rounded-input border text-sm transition-colors ${
                    selectedReason === reason
                      ? 'border-primary bg-light-green text-primary font-medium'
                      : 'border-border-gray text-navy'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setReasonOpen(false); setSelectedReason('') }}
                className="flex-1 py-3 rounded-input border border-border-gray text-sm text-neutral-gray"
              >
                Đóng
              </button>
              <button
                onClick={() => { setReasonOpen(false); setConfirmOpen(true) }}
                disabled={!selectedReason}
                className="flex-1 py-3 rounded-input bg-danger-red text-white text-sm font-semibold disabled:opacity-40"
              >
                Tiếp tục
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={isFreeCancel ? 'Xác nhận huỷ chuyến?' : 'Huỷ chuyến · Phạt 50,000đ'}
        description={[
          isFreeCancel
            ? 'Chuyến sẽ bị huỷ và tài xế sẽ không được phân công.'
            : 'Bạn đã quá 1 giờ kể từ khi tài xế nhận cuốc. Phí phạt 50,000đ sẽ được cộng vào cuốc xe tiếp theo.',
          booking.voucher_code
            ? `Voucher ${booking.voucher_code} đã dùng sẽ không được hoàn lại.`
            : '',
        ].filter(Boolean).join(' ')}
        confirmLabel="Xác nhận huỷ"
        loading={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
