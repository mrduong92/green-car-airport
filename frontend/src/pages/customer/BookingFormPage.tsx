import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { createBooking, applyVoucher } from '@/api/bookings'
import { getPriceConfigs } from '@/api/priceConfig'
import { goongDistanceMatrix } from '@/api/goong'
import type { LatLng } from '@/api/goong'
import { useUiStore } from '@/stores/ui'
import { useEffect, useRef } from 'react'
import Button from '@/components/common/Button'
import AddressInput from '@/components/common/AddressInput'

// ─── Vehicle types ────────────────────────────────────────────────────────────

type VehicleType = App.VehicleType

const VEHICLE_TYPES: { value: VehicleType; label: string; icon: string }[] = [
  { value: 'sedan_4', label: '4 chỗ', icon: 'directions_car'  },
  { value: 'suv_5',   label: '5 chỗ', icon: 'directions_car'  },
  { value: 'mpv_7',   label: '7 chỗ', icon: 'airport_shuttle' },
]

// Keywords để detect xe sân bay
const AIRPORT_KEYWORDS = ['sân bay', 'nội bài', 'noi bai', 'airport', 'terminal']

function detectServiceType(pickup: string, destination: string): 'airport' | 'provincial' {
  const text = `${pickup} ${destination}`.toLowerCase()
  return AIRPORT_KEYWORDS.some((kw) => text.includes(kw)) ? 'airport' : 'provincial'
}

// ─── Date chips (7 days from today) ──────────────────────────────────────────

const VI_DAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

const DATE_CHIPS = Array.from({ length: 7 }, (_, i) => {
  const d = dayjs().add(i, 'day')
  return {
    value: d.format('YYYY-MM-DD'),
    topLabel: i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : VI_DAY[d.day()],
    bottomLabel: d.format('D/M'),
  }
})

// ─── Time grid: 3 scroll rows × 16 chips (8h × :00+:30 interleaved) ──────────

const fmtTimeLabel = (val: string) => {
  const [hh, mm] = val.split(':')
  return `${parseInt(hh)}h${mm}`
}
const fmtTimeValue = (h: number, m: number) =>
  `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`

const TIME_ROWS: string[][] = [
  Array.from({ length: 8 }, (_, i) => i).flatMap((h)      => [fmtTimeValue(h, 0), fmtTimeValue(h, 30)]),
  Array.from({ length: 8 }, (_, i) => i + 8).flatMap((h)  => [fmtTimeValue(h, 0), fmtTimeValue(h, 30)]),
  Array.from({ length: 8 }, (_, i) => i + 16).flatMap((h) => [fmtTimeValue(h, 0), fmtTimeValue(h, 30)]),
]

// ─── Form schema ──────────────────────────────────────────────────────────────

const schema = z.object({
  vehicle_type: z.enum(['sedan_4', 'suv_5', 'mpv_7']),
  pickup:       z.string().min(1, 'Vui lòng nhập điểm đón'),
  destination:  z.string().min(1, 'Vui lòng nhập điểm đến'),
  date:         z.string().min(1),
  time:         z.string().min(1),
  distance_km:  z.number({ coerce: true }).min(0.1, 'Vui lòng chọn điểm đón và điểm đến'),
  price:        z.number({ coerce: true }).min(1, 'Vui lòng nhập giá'),
})
type FormData = z.infer<typeof schema>

// ─── Component ───────────────────────────────────────────────────────────────

export default function BookingFormPage() {
  const navigate   = useNavigate()
  const showToast  = useUiStore((s) => s.showToast)

  const [voucherCode, setVoucherCode] = useState('')
  const [discount,    setDiscount]    = useState(0)
  const [vehicleType, setVehicleType] = useState<VehicleType>('sedan_4')
  const [pickupLatLng,   setPickupLatLng]   = useState<LatLng | null>(null)
  const [destLatLng,     setDestLatLng]     = useState<LatLng | null>(null)

  const vehicleTypeRef = useRef(vehicleType)
  vehicleTypeRef.current = vehicleType

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      vehicle_type: 'sedan_4',
      date: DATE_CHIPS[0].value,
      time: '08:00',
    },
  })

  const distance     = watch('distance_km') || 0
  const price        = watch('price') || 0
  const pickup       = watch('pickup') ?? ''
  const destination  = watch('destination') ?? ''
  const selectedDate = watch('date')
  const selectedTime = watch('time')
  const currentVehicle   = VEHICLE_TYPES.find((v) => v.value === vehicleType) ?? VEHICLE_TYPES[0]
  const detectedService  = detectServiceType(pickup, destination)
  const total = Math.max(0, price - discount)

  // Bảng giá từ API
  const { data: priceConfigs = [] } = useQuery({
    queryKey: ['price-configs'],
    queryFn: getPriceConfigs,
    staleTime: 5 * 60 * 1000,
  })

  const activeConfig = priceConfigs.find(
    (c) => c.trip_type === 'one_way' && c.vehicle_type === vehicleType && c.service_type === detectedService && c.is_active
  )

  // Tính khoảng giá tham khảo từ config API
  const suggestedMin = activeConfig
    ? activeConfig.price_type === 'per_km'
      ? Math.round(distance * activeConfig.min_price / 1000) * 1000
      : activeConfig.min_price
    : 0
  const suggestedMax = activeConfig
    ? activeConfig.price_type === 'per_km'
      ? Math.round(distance * activeConfig.max_price / 1000) * 1000
      : activeConfig.max_price
    : 0

  // ── Auto-calculate distance + auto-fill price when both locations are pinned ─
  useEffect(() => {
    if (!pickupLatLng || !destLatLng) return

    const applyKm = (km: number, label: string) => {
      setValue('distance_km', km, { shouldValidate: true })
      // Auto-fill giá từ config API (nếu có), fallback về 0
      const cfg = priceConfigs.find(
        (c) => c.trip_type === 'one_way' && c.vehicle_type === vehicleTypeRef.current && c.is_active
      )
      if (cfg) {
        const minP = cfg.price_type === 'per_km' ? Math.round(km * cfg.min_price / 1000) * 1000 : cfg.min_price
        const maxP = cfg.price_type === 'per_km' ? Math.round(km * cfg.max_price / 1000) * 1000 : cfg.max_price
        setValue('price', Math.round((minP + maxP) / 2 / 1000) * 1000, { shouldValidate: true })
      }
      showToast(`${label}: ~${km.toFixed(1)} km`, 'success')
    }

    goongDistanceMatrix(pickupLatLng, destLatLng)
      .then((km) => applyKm(km, 'Khoảng cách lái xe'))
      .catch(() => {
        const toRad = (d: number) => (d * Math.PI) / 180
        const dLat = toRad(destLatLng.lat - pickupLatLng.lat)
        const dLng = toRad(destLatLng.lng - pickupLatLng.lng)
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(pickupLatLng.lat)) *
            Math.cos(toRad(destLatLng.lat)) *
            Math.sin(dLng / 2) ** 2
        const km = Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.3 * 10) / 10
        applyKm(km, 'Khoảng cách ước tính')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupLatLng, destLatLng, setValue, showToast, priceConfigs])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleVehicleChange = (v: VehicleType) => {
    setVehicleType(v)
    setValue('vehicle_type', v)
    if (distance > 0) {
      const cfg = priceConfigs.find((c) => c.trip_type === 'one_way' && c.vehicle_type === v && c.is_active)
      if (cfg) {
        const minP = cfg.price_type === 'per_km' ? Math.round(distance * cfg.min_price / 1000) * 1000 : cfg.min_price
        const maxP = cfg.price_type === 'per_km' ? Math.round(distance * cfg.max_price / 1000) * 1000 : cfg.max_price
        setValue('price', Math.round((minP + maxP) / 2 / 1000) * 1000, { shouldValidate: true })
      }
    }
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
      createBooking({
        ...data,
        pickup_lat:      pickupLatLng?.lat,
        pickup_lng:      pickupLatLng?.lng,
        destination_lat: destLatLng?.lat,
        destination_lng: destLatLng?.lng,
        voucher_code:    voucherCode || undefined,
      }),
    onSuccess: ({ data }) => navigate(`/customer/booking/${data.id}`),
    onError: () => showToast('Đặt xe thất bại, vui lòng thử lại', 'error'),
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full">

      {/* Header */}
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
                <span className={clsx('material-symbols-outlined text-2xl', vehicleType === v.value ? 'text-primary' : 'text-neutral-gray')}>
                  {v.icon}
                </span>
                <span className={clsx('text-sm font-semibold', vehicleType === v.value ? 'text-primary' : 'text-navy')}>
                  {v.label}
                </span>
              </button>
            ))}
          </div>

          {/* Location inputs */}
          <div className="bg-white rounded-card shadow-card border-l-4 border-primary p-4 flex flex-col gap-3">
            <AddressInput
              icon="location_on"
              placeholder="Tìm địa điểm đón..."
              value={watch('pickup') ?? ''}
              onChange={(v) => setValue('pickup', v, { shouldValidate: true })}
              onPlaceSelect={(addr, latlng) => {
                setValue('pickup', addr, { shouldValidate: true })
                setPickupLatLng(latlng)
              }}
              error={errors.pickup?.message}
            />
            <div className="h-px bg-border-gray ml-9" />
            <AddressInput
              icon="flight_takeoff"
              placeholder="Sân bay hoặc điểm đến..."
              value={watch('destination') ?? ''}
              onChange={(v) => setValue('destination', v, { shouldValidate: true })}
              onPlaceSelect={(addr, latlng) => {
                setValue('destination', addr, { shouldValidate: true })
                setDestLatLng(latlng)
              }}
              error={errors.destination?.message}
            />
          </div>

          {/* Date + Time */}
          <div className="bg-white rounded-card shadow-card p-4 flex flex-col gap-3">

            {/* Date chips */}
            <p className="text-caption text-neutral-gray">Ngày khởi hành</p>
            <div className="overflow-x-auto -mx-1 px-1 pb-0.5">
              <div className="flex gap-2" style={{ width: 'max-content' }}>
                {DATE_CHIPS.map((chip) => (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => setValue('date', chip.value, { shouldValidate: true })}
                    className={clsx(
                      'flex flex-col items-center px-3.5 py-2 rounded-card border-2 shrink-0 min-w-[60px] transition-colors',
                      selectedDate === chip.value
                        ? 'border-primary bg-light-green'
                        : 'border-border-gray bg-white'
                    )}
                  >
                    <span className={clsx('text-xs font-medium', selectedDate === chip.value ? 'text-primary' : 'text-neutral-gray')}>
                      {chip.topLabel}
                    </span>
                    <span className={clsx('text-sm font-bold mt-0.5', selectedDate === chip.value ? 'text-primary' : 'text-navy')}>
                      {chip.bottomLabel}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-border-gray" />

            {/* Time grid — 3 rows scrolling together as one unit */}
            <p className="text-caption text-neutral-gray">Giờ đón</p>
            <div className="overflow-x-auto -mx-1 px-1 pb-0.5">
              <div className="flex flex-col gap-1.5" style={{ width: 'max-content' }}>
                {TIME_ROWS.map((row, ri) => (
                  <div key={ri} className="flex gap-1.5">
                    {row.map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setValue('time', val, { shouldValidate: true })}
                        className={clsx(
                          'w-14 py-2 rounded-input text-xs font-medium border-2 transition-colors shrink-0',
                          selectedTime === val
                            ? 'border-primary bg-light-green text-primary'
                            : 'border-border-gray bg-white text-navy'
                        )}
                      >
                        {fmtTimeLabel(val)}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Price */}
          <div className="bg-white rounded-card shadow-card p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-caption text-neutral-gray mb-1.5">
                  Giá tham khảo · {currentVehicle.label}
                  {activeConfig && (
                    <span className="ml-1 text-primary">
                      ({activeConfig.price_type === 'per_km' ? 'theo km' : detectedService === 'airport' ? 'sân bay' : 'cố định'})
                    </span>
                  )}
                </p>
                {activeConfig && (suggestedMin > 0 || activeConfig.price_type === 'range') ? (
                  <span className="bg-light-green text-primary text-xs font-semibold rounded-pill px-3 py-1">
                    {suggestedMin.toLocaleString('vi')} – {suggestedMax.toLocaleString('vi')} đ
                  </span>
                ) : (
                  <span className="text-xs text-neutral-gray">
                    {activeConfig ? 'Chọn điểm đón & đến để tính' : 'Chọn điểm đón & đến để xem'}
                  </span>
                )}
              </div>
              {distance > 0 && (
                <div className="flex items-center gap-1.5 bg-light-green rounded-pill px-3 py-1">
                  <span className="material-symbols-outlined text-primary text-sm">straighten</span>
                  <span className="text-xs font-semibold text-primary">~{distance.toFixed(1)} km</span>
                </div>
              )}
            </div>
            {errors.distance_km && (
              <p className="text-danger-red text-xs -mt-2">{errors.distance_km.message}</p>
            )}

            <div>
              <p className="text-caption text-neutral-gray mb-2">Giá bạn muốn trả</p>
              <div className="flex items-center border border-border-gray rounded-input overflow-hidden">
                <span className="px-3 py-3 text-neutral-gray text-sm bg-light-green border-r border-border-gray">đ</span>
                <input
                  type="number"
                  {...register('price')}
                  placeholder="Tự động tính khi chọn địa điểm"
                  className="flex-1 px-3 py-3 outline-none text-navy text-sm"
                />
              </div>
              {errors.price && <p className="text-danger-red text-xs mt-1">{errors.price.message}</p>}
            </div>
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

    </div>
  )
}
