import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getBooking, cancelBooking } from '@/api/bookings'
import { useMutation } from '@tanstack/react-query'
import { useUiStore } from '@/stores/ui'
import StatusBadge from '@/components/common/StatusBadge'
import Button from '@/components/common/Button'
import dayjs from 'dayjs'
import clsx from 'clsx'

const STEPS: { key: App.BookingStatus; label: string }[] = [
  { key: 'pending',        label: 'Đã đặt xe' },
  { key: 'finding_driver', label: 'Đang tìm tài xế' },
  { key: 'accepted',       label: 'Tài xế đã nhận' },
  { key: 'completed',      label: 'Hoàn thành' },
]
const ORDER: App.BookingStatus[] = ['pending', 'finding_driver', 'accepted', 'in_progress', 'completed']

export default function BookingStatusPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const showToast = useUiStore((s) => s.showToast)

  const { data, refetch } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => getBooking(Number(id)).then((r) => r.data),
    refetchInterval: 10_000,
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelBooking(Number(id)),
    onSuccess: () => { showToast('Đã huỷ chuyến', 'info'); refetch() },
    onError: () => showToast('Không thể huỷ chuyến', 'error'),
  })

  const booking = data
  const currentIdx = ORDER.indexOf(booking?.status ?? 'pending')
  const minutesSinceBooking = booking ? dayjs().diff(dayjs(booking.created_at), 'minute') : 0
  const canCancel = booking && !['completed', 'cancelled'].includes(booking.status) && minutesSinceBooking < 60

  if (!booking) return <div className="flex items-center justify-center h-40"><span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span></div>

  return (
    <div className="w-full flex flex-col gap-4 px-4 py-4">
      {/* Booking ref + status */}
      <div className="flex items-center justify-between">
        <span className="text-caption text-neutral-gray">Đơn #{booking.id}</span>
        <StatusBadge status={booking.status} />
      </div>

      {/* Progress stepper */}
      <div className="bg-white rounded-card shadow-card p-4">
        {STEPS.map((step, i) => {
          const done = currentIdx > i
          const active = currentIdx === i
          return (
            <div key={step.key} className="flex items-center gap-3 mb-3 last:mb-0">
              <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                done ? 'bg-success-green text-white' : active ? 'bg-primary text-white' : 'bg-border-gray text-neutral-gray')}>
                {done ? <span className="material-symbols-outlined text-sm">check</span> : i + 1}
              </div>
              <div className="flex-1">
                <span className={clsx('text-sm', active ? 'font-semibold text-navy' : done ? 'text-neutral-gray line-through' : 'text-neutral-gray')}>
                  {step.label}
                </span>
              </div>
              {active && <span className="material-symbols-outlined text-primary animate-spin text-sm">progress_activity</span>}
            </div>
          )
        })}
      </div>

      {/* Trip summary */}
      <div className="bg-white rounded-card shadow-card p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-lg">location_on</span>
          <span className="text-sm text-navy">{booking.pickup}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-orange-500 text-lg">flight_takeoff</span>
          <span className="text-sm text-navy">{booking.destination}</span>
        </div>
        <div className="h-px bg-border-gray my-1" />
        <div className="flex justify-between text-sm">
          <span className="text-neutral-gray">{dayjs(booking.date).format('DD/MM/YYYY')} · {booking.time}</span>
          <span className="font-bold text-primary">{booking.price.toLocaleString('vi')} đ</span>
        </div>
      </div>

      {/* Driver card (appears after accepted) */}
      {booking.driver && (
        <div className="bg-white rounded-card shadow-card p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-light-green flex items-center justify-center text-primary font-bold text-lg shrink-0">
            {booking.driver.name[0]}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-navy text-sm">{booking.driver.name}</p>
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-gold text-sm">star</span>
              <span className="text-caption text-neutral-gray">{booking.driver.rating}</span>
            </div>
            <p className="text-caption text-neutral-gray">{booking.driver.vehicle_make} {booking.driver.vehicle_model} · {booking.driver.vehicle_plate}</p>
          </div>
          <div className="flex gap-2">
            <a href={`tel:${booking.driver.phone}`}
              className="w-10 h-10 rounded-full bg-light-green flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-xl">call</span>
            </a>
          </div>
        </div>
      )}

      {/* Actions */}
      {canCancel && (
        <button onClick={() => cancelMutation.mutate()}
          className="text-danger-red text-sm text-center underline">
          Huỷ chuyến (còn {60 - minutesSinceBooking} phút)
        </button>
      )}
      {booking.status === 'completed' && (
        <Button fullWidth variant="outline" onClick={() => navigate('/customer/booking')}>
          Đặt xe mới
        </Button>
      )}
    </div>
  )
}
