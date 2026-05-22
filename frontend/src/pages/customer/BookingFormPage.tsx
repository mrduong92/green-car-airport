import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import clsx from 'clsx'
import { createBooking, applyVoucher } from '@/api/bookings'
import { useUiStore } from '@/stores/ui'
import Button from '@/components/common/Button'
import { loadMaps } from '@/hooks/useMapsLoader'

// ─── Vehicle types ────────────────────────────────────────────────────────────

type VehicleType = App.VehicleType

const VEHICLE_TYPES: {
  value: VehicleType
  label: string
  icon: string
  minRate: number
  maxRate: number
}[] = [
  { value: 'sedan_4', label: '4 chỗ', icon: 'directions_car',  minRate: 25000, maxRate: 30000 },
  { value: 'suv_5',   label: '5 chỗ', icon: 'directions_car',  minRate: 28000, maxRate: 34000 },
  { value: 'mpv_7',   label: '7 chỗ', icon: 'airport_shuttle', minRate: 35000, maxRate: 42000 },
]

// ─── Regulations ─────────────────────────────────────────────────────────────

const QUY_DINH = [
  { icon: 'schedule',       text: 'Đặt xe trước ít nhất 30 phút giờ khởi hành.' },
  { icon: 'cancel',         text: 'Hủy miễn phí trong vòng 1 giờ sau khi đặt.' },
  { icon: 'payments',       text: 'Hủy sau 1 giờ bị phạt 50.000đ, áp dụng cho chuyến tiếp theo.' },
  { icon: 'timer_off',      text: 'Chuyến tự động hủy sau 24 giờ nếu không có tài xế nhận.' },
  { icon: 'local_parking',  text: 'Giá đã bao gồm phí cầu đường và bãi đỗ sân bay.' },
  { icon: 'phone',          text: 'Tài xế sẽ chủ động liên hệ trước giờ đón để xác nhận.' },
  { icon: 'edit_off',       text: 'Không thể thay đổi điểm đón/đến sau khi đã đặt chuyến.' },
]

// ─── Form schema ──────────────────────────────────────────────────────────────

const schema = z.object({
  vehicle_type: z.enum(['sedan_4', 'suv_5', 'mpv_7']),
  pickup:       z.string().min(1, 'Vui lòng nhập điểm đón'),
  destination:  z.string().min(1, 'Vui lòng nhập điểm đến'),
  date:         z.string().min(1),
  time:         z.string().min(1),
  distance_km:  z.number({ coerce: true }).min(1, 'Vui lòng nhập số km'),
  price:        z.number({ coerce: true }).min(1, 'Vui lòng nhập giá'),
})
type FormData = z.infer<typeof schema>

type LatLng = { lat: number; lng: number }

// ─── Component ───────────────────────────────────────────────────────────────

export default function BookingFormPage() {
  const navigate   = useNavigate()
  const showToast  = useUiStore((s) => s.showToast)
  const today      = new Date().toISOString().split('T')[0]

  const [voucherCode,  setVoucherCode]  = useState('')
  const [discount,     setDiscount]     = useState(0)
  const [showQuyDinh,  setShowQuyDinh]  = useState(false)
  const [vehicleType,  setVehicleType]  = useState<VehicleType>('sedan_4')
  const [pickupLatLng, setPickupLatLng] = useState<LatLng | null>(null)
  const [destLatLng,   setDestLatLng]   = useState<LatLng | null>(null)
  const [mapsEnabled,  setMapsEnabled]  = useState(false)

  const pickupInputRef = useRef<HTMLInputElement>(null)
  const destInputRef   = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      vehicle_type: 'sedan_4',
      date: today,
      time: '08:00',
      distance_km: 12,
    },
  })

  const distance = watch('distance_km') || 0
  const price    = watch('price') || 0
  const currentVehicle = VEHICLE_TYPES.find((v) => v.value === vehicleType) ?? VEHICLE_TYPES[0]
  const suggestedMin = Math.round(distance * currentVehicle.minRate / 1000) * 1000
  const suggestedMax = Math.round(distance * currentVehicle.maxRate / 1000) * 1000
  const total = Math.max(0, price - discount)

  // ── Destructure RHF refs so we can merge with our own refs ─────────────────
  const { ref: pickupRegRef, onChange: onPickupChange, ...pickupRegProps } = register('pickup')
  const { ref: destRegRef,   onChange: onDestChange,   ...destRegProps   } = register('destination')

  // ── Load Google Maps and attach Autocomplete ───────────────────────────────
  useEffect(() => {
    let acPickup: google.maps.places.Autocomplete | null = null
    let acDest:   google.maps.places.Autocomplete | null = null

    loadMaps()
      .then(() => {
        setMapsEnabled(true)

        if (pickupInputRef.current) {
          acPickup = new google.maps.places.Autocomplete(pickupInputRef.current, {
            componentRestrictions: { country: 'vn' },
            fields: ['formatted_address', 'geometry'],
          })
          acPickup.addListener('place_changed', () => {
            const place = acPickup!.getPlace()
            if (place.formatted_address) {
              setValue('pickup', place.formatted_address, { shouldValidate: true })
            }
            const loc = place.geometry?.location
            setPickupLatLng(loc ? { lat: loc.lat(), lng: loc.lng() } : null)
          })
        }

        if (destInputRef.current) {
          acDest = new google.maps.places.Autocomplete(destInputRef.current, {
            componentRestrictions: { country: 'vn' },
            fields: ['formatted_address', 'geometry'],
          })
          acDest.addListener('place_changed', () => {
            const place = acDest!.getPlace()
            if (place.formatted_address) {
              setValue('destination', place.formatted_address, { shouldValidate: true })
            }
            const loc = place.geometry?.location
            setDestLatLng(loc ? { lat: loc.lat(), lng: loc.lng() } : null)
          })
        }
      })
      .catch(() => {
        // No API key configured — inputs fall back to plain text
      })
  }, [setValue])

  // ── Auto-calculate distance when both locations are pinned ─────────────────
  useEffect(() => {
    if (!pickupLatLng || !destLatLng) return

    if (window.google?.maps) {
      // Google Distance Matrix — actual driving distance
      const service = new google.maps.DistanceMatrixService()
      service.getDistanceMatrix(
        {
          origins:      [pickupLatLng as google.maps.LatLngLiteral],
          destinations: [destLatLng   as google.maps.LatLngLiteral],
          travelMode:   google.maps.TravelMode.DRIVING,
          unitSystem:   google.maps.UnitSystem.METRIC,
        },
        (response, status) => {
          if (status !== 'OK') return
          const element = response?.rows[0]?.elements[0]
          if (element?.status === 'OK') {
            const km = Math.round((element.distance.value / 1000) * 10) / 10
            setValue('distance_km', km, { shouldValidate: true })
            showToast(`Khoảng cách lái xe: ~${km.toFixed(1)} km`, 'success')
          }
        }
      )
    } else {
      // Haversine straight-line × 1.3 road factor
      const toRad = (d: number) => (d * Math.PI) / 180
      const dLat = toRad(destLatLng.lat - pickupLatLng.lat)
      const dLng = toRad(destLatLng.lng - pickupLatLng.lng)
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(pickupLatLng.lat)) *
          Math.cos(toRad(destLatLng.lat)) *
          Math.sin(dLng / 2) ** 2
      const straight = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      const km = Math.round(straight * 1.3 * 10) / 10
      setValue('distance_km', km, { shouldValidate: true })
      showToast(`Khoảng cách ước tính: ~${km.toFixed(1)} km`, 'success')
    }
  }, [pickupLatLng, destLatLng, setValue, showToast])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleVehicleChange = (v: VehicleType) => {
    setVehicleType(v)
    setValue('vehicle_type', v)
  }

  const voucherMutation = useMutation({
    mutationFn: () => applyVoucher(voucherCode),
    onSuccess: ({ data }) => {
      setDiscount(data.discount)
      showToast('Áp dụng voucher thành công', 'success')
    },
    onError: () => showToast('Mã voucher không hợp lệ', 'error'),
  })

  const bookingMutation = useMutation({
    mutationFn: (data: FormData) =>
      createBooking({ ...data, voucher_code: voucherCode || undefined }),
    onSuccess: ({ data }) => navigate(`/customer/booking/${data.id}`),
    onError: () => showToast('Đặt xe thất bại, vui lòng thử lại', 'error'),
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full">

      {/* Header */}
      <div className="bg-white px-4 py-4 border-b border-border-gray safe-top flex items-center justify-between">
        <h1 className="text-h2 text-navy font-semibold">Đặt xe sân bay</h1>
        <button
          type="button"
          onClick={() => setShowQuyDinh(true)}
          className="flex items-center gap-1 text-primary text-sm font-medium"
        >
          <span className="material-symbols-outlined text-base leading-none">info</span>
          Quy định
        </button>
      </div>

      <form
        onSubmit={handleSubmit((d) => bookingMutation.mutate(d))}
        className="flex flex-col flex-1 pb-28"
      >
        <div className="px-4 py-4 flex flex-col gap-4">

          {/* Vehicle type selector */}
          <div className="flex gap-2">
            {VEHICLE_TYPES.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => handleVehicleChange(v.value)}
                className={clsx(
                  'flex-1 flex flex-col items-center gap-1.5 py-3 rounded-card border-2 transition-colors',
                  vehicleType === v.value
                    ? 'border-primary bg-light-green'
                    : 'border-border-gray bg-white'
                )}
              >
                <span
                  className={clsx(
                    'material-symbols-outlined text-2xl',
                    vehicleType === v.value ? 'text-primary' : 'text-neutral-gray'
                  )}
                >
                  {v.icon}
                </span>
                <span
                  className={clsx(
                    'text-sm font-semibold',
                    vehicleType === v.value ? 'text-primary' : 'text-navy'
                  )}
                >
                  {v.label}
                </span>
              </button>
            ))}
          </div>

          {/* Location inputs */}
          <div className="bg-white rounded-card shadow-card border-l-4 border-primary p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary shrink-0">location_on</span>
              <input
                {...pickupRegProps}
                ref={(el) => {
                  pickupRegRef(el)
                  pickupInputRef.current = el
                }}
                onChange={(e) => {
                  onPickupChange(e)
                  setPickupLatLng(null)
                }}
                onBlur={() => trigger('pickup')}
                placeholder={mapsEnabled ? 'Tìm địa điểm đón...' : 'Nhập địa điểm đón'}
                className="flex-1 outline-none text-navy text-sm"
                autoComplete="off"
              />
              {mapsEnabled && (
                <span className="material-symbols-outlined text-neutral-gray text-base shrink-0">search</span>
              )}
            </div>

            <div className="h-px bg-border-gray ml-9" />

            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-orange-500 shrink-0">flight_takeoff</span>
              <input
                {...destRegProps}
                ref={(el) => {
                  destRegRef(el)
                  destInputRef.current = el
                }}
                onChange={(e) => {
                  onDestChange(e)
                  setDestLatLng(null)
                }}
                onBlur={() => trigger('destination')}
                placeholder={mapsEnabled ? 'Tìm sân bay hoặc điểm đến...' : 'Sân bay Tân Sơn Nhất'}
                className="flex-1 outline-none text-navy text-sm"
                autoComplete="off"
              />
              {mapsEnabled && (
                <span className="material-symbols-outlined text-neutral-gray text-base shrink-0">search</span>
              )}
            </div>
          </div>

          {(errors.pickup || errors.destination) && (
            <p className="text-danger-red text-xs -mt-2">
              {errors.pickup?.message ?? errors.destination?.message}
            </p>
          )}

          {/* Date / Time */}
          <div className="bg-white rounded-card shadow-card p-4 flex gap-3">
            <div className="flex-1 flex items-center gap-2 border border-border-gray rounded-input px-3 py-2">
              <span className="material-symbols-outlined text-neutral-gray text-xl">calendar_today</span>
              <input
                type="date"
                {...register('date')}
                className="flex-1 outline-none text-sm text-navy"
              />
            </div>
            <div className="flex-1 flex items-center gap-2 border border-border-gray rounded-input px-3 py-2">
              <span className="material-symbols-outlined text-neutral-gray text-xl">schedule</span>
              <input
                type="time"
                {...register('time')}
                className="flex-1 outline-none text-sm text-navy"
              />
            </div>
          </div>

          {/* Distance + Price */}
          <div className="bg-white rounded-card shadow-card p-4 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-gray w-32">Số km ước tính</span>
              <div className="flex-1 flex items-center gap-2 border border-border-gray rounded-input px-3 py-2">
                <input
                  type="number"
                  step="0.1"
                  {...register('distance_km')}
                  className="flex-1 outline-none text-sm text-navy"
                />
                <span className="text-neutral-gray text-sm">km</span>
              </div>
            </div>
            {errors.distance_km && (
              <p className="text-danger-red text-xs -mt-2">{errors.distance_km.message}</p>
            )}

            <div>
              <p className="text-caption text-neutral-gray mb-2">
                Giá tham khảo ({currentVehicle.label})
              </p>
              <span className="bg-light-green text-primary text-xs font-semibold rounded-pill px-3 py-1">
                {suggestedMin.toLocaleString('vi')} – {suggestedMax.toLocaleString('vi')} đ
              </span>
            </div>

            <div className="flex items-center border border-border-gray rounded-input overflow-hidden">
              <span className="px-3 py-3 text-neutral-gray text-sm bg-light-green border-r border-border-gray">
                đ
              </span>
              <input
                type="number"
                {...register('price')}
                placeholder="Nhập giá bạn muốn trả"
                className="flex-1 px-3 py-3 outline-none text-navy text-sm"
              />
            </div>
            {errors.price && (
              <p className="text-danger-red text-xs">{errors.price.message}</p>
            )}
          </div>

          {/* Voucher */}
          <div className="bg-white rounded-card shadow-card p-4">
            {discount > 0 ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-xl">confirmation_number</span>
                  <span className="text-sm text-navy">Voucher đã áp dụng</span>
                </div>
                <span className="bg-light-green text-primary text-xs font-semibold rounded-pill px-3 py-1">
                  -{discount.toLocaleString('vi')} đ
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-neutral-gray text-xl">confirmation_number</span>
                <input
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                  placeholder="Nhập mã voucher"
                  className="flex-1 outline-none text-sm text-navy"
                />
                {voucherCode && (
                  <button
                    type="button"
                    onClick={() => voucherMutation.mutate()}
                    className="text-primary text-sm font-medium"
                  >
                    Áp dụng
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sticky footer */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white shadow-card-up border-t border-border-gray px-4 py-4 safe-bottom">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-neutral-gray">Tổng thanh toán</span>
            <span className="text-xl font-bold text-primary">{total.toLocaleString('vi')} đ</span>
          </div>
          <Button type="submit" fullWidth size="lg" loading={bookingMutation.isPending}>
            Đặt xe ngay →
          </Button>
        </div>
      </form>

      {/* Quy định modal */}
      {showQuyDinh && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
          onClick={() => setShowQuyDinh(false)}
        >
          <div
            className="bg-white w-full max-w-[430px] rounded-t-2xl p-6 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-navy">Quy định đặt xe</h2>
              <button
                onClick={() => setShowQuyDinh(false)}
                className="w-8 h-8 rounded-full bg-light-green flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-neutral-gray text-sm">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {QUY_DINH.map(({ icon, text }, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-light-green flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary text-base">{icon}</span>
                  </div>
                  <p className="text-sm text-navy flex-1 pt-1">{text}</p>
                </div>
              ))}
            </div>

            <Button fullWidth onClick={() => setShowQuyDinh(false)}>
              Đã hiểu
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
