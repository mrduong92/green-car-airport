import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { createBooking, getActiveBooking } from '@/api/bookings'
import { getPriceConfigs } from '@/api/priceConfig'
import { goongDistanceMatrix } from '@/api/goong'
import type { LatLng } from '@/api/goong'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import Button from '@/components/common/Button'
import AddressInput from '@/components/common/AddressInput'
import VoucherSheet from '@/components/common/VoucherSheet'

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
    label: i === 0 ? 'Hôm nay' : `${VI_DAY[d.day()]} ${d.format('D/M')}`,
  }
})

// ─── Time grid: 3 scroll rows (morning / afternoon / evening) ─────────────────

const fmtTimeValue = (h: number, m: number) =>
  `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`

const TIME_ROWS: string[][] = [
  Array.from({ length: 7 }, (_, i) => i + 5).flatMap((h) => [fmtTimeValue(h, 0), fmtTimeValue(h, 30)]),   // 05:00–11:30
  Array.from({ length: 7 }, (_, i) => i + 12).flatMap((h) => [fmtTimeValue(h, 0), fmtTimeValue(h, 30)]),  // 12:00–18:30
  Array.from({ length: 5 }, (_, i) => i + 19).flatMap((h) => [fmtTimeValue(h, 0), fmtTimeValue(h, 30)]),  // 19:00–23:30
]

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-widest mt-5 mb-2.5">
      {children}
    </p>
  )
}

// ─── Form schema ──────────────────────────────────────────────────────────────

const schema = z.object({
  vehicle_type: z.enum(['sedan_4', 'suv_5', 'mpv_7']),
  pickup:       z.string().min(1, 'Vui lòng nhập điểm đón'),
  destination:  z.string().min(1, 'Vui lòng nhập điểm đến'),
  date:         z.string().min(1),
  time:         z.string().min(1),
  distance_km:  z.number({ coerce: true }).min(0.1, 'Vui lòng chọn điểm đón và điểm đến'),
  price:        z.number({ coerce: true }).min(1, 'Vui lòng nhập giá'),
  note:         z.string().max(500).optional(),
})
type FormData = z.infer<typeof schema>

// ─── Component ───────────────────────────────────────────────────────────────

export default function BookingFormPage() {
  const navigate     = useNavigate()
  const showToast    = useUiStore((s) => s.showToast)
  const user         = useAuthStore((s) => s.user)
  const queryClient  = useQueryClient()

  const [voucherCode,   setVoucherCode]   = useState('')
  const [discount,      setDiscount]      = useState(0)
  const [, setVoucherIsCapped] = useState(false)
  const [showVouchers,  setShowVouchers]  = useState(false)
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

  const bookingMutation = useMutation({
    mutationFn: (data: FormData) =>
      createBooking({
        ...data,
        pickup_lat:      pickupLatLng?.lat,
        pickup_lng:      pickupLatLng?.lng,
        destination_lat: destLatLng?.lat,
        destination_lng: destLatLng?.lng,
        voucher_code:    voucherCode || undefined,
        note:            data.note || undefined,
      }),
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ['vouchers-list'] })
      navigate(`/customer/booking/${data.id}`)
    },
    onError: () => showToast('Đặt xe thất bại, vui lòng thử lại', 'error'),
  })

  const { data: activeBooking } = useQuery({
    queryKey: ['active-booking'],
    queryFn: () => getActiveBooking().then((r) => (r.data && 'id' in r.data ? r.data : null)),
    refetchInterval: 15_000,
  })

  useEffect(() => {
    if (activeBooking?.id) {
      navigate(`/customer/booking/${activeBooking.id}`, { replace: true })
    }
  }, [activeBooking, navigate])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <form
      onSubmit={handleSubmit((d) => bookingMutation.mutate(d))}
      className="flex flex-col min-h-full pb-44"
    >
      <div className="px-4 pt-4 flex flex-col">

        {/* ── Penalty banner ────────────────────────────────── */}
        {(user?.pending_penalty ?? 0) > 0 && (
          <div className="flex items-start gap-3 bg-alert-orange/10 border border-alert-orange/30 rounded-card px-4 py-3 mb-3">
            <span className="material-symbols-outlined text-alert-orange text-xl shrink-0 mt-0.5">warning</span>
            <div>
              <p className="text-[13px] font-semibold text-navy">Bạn đang có khoản phạt chưa thanh toán</p>
              <p className="text-[12px] text-neutral-gray mt-0.5">
                Phí phạt <span className="font-semibold text-alert-orange">{(user!.pending_penalty!).toLocaleString('vi-VN')}đ</span> do huỷ chuyến muộn sẽ được cộng vào chuyến xe này.
              </p>
            </div>
          </div>
        )}

        {/* ── Location card ─────────────────────────────────── */}
        <div className="bg-white rounded-card shadow-card border border-border-soft">
          {/* Điểm đón */}
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-7 h-7 rounded-full bg-primary-tint flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 15, fontVariationSettings: "'FILL' 1" }}>location_on</span>
            </div>
            <div className="flex-1 min-w-0">
              <AddressInput
                label="Điểm đón"
                placeholder="Tìm địa điểm đón..."
                showMyLocation
                value={watch('pickup') ?? ''}
                onChange={(v) => setValue('pickup', v, { shouldValidate: true })}
                onPlaceSelect={(addr, latlng) => {
                  setValue('pickup', addr, { shouldValidate: true })
                  setPickupLatLng(latlng)
                }}
                onClear={() => setPickupLatLng(null)}
                error={errors.pickup?.message}
              />
            </div>
          </div>

          <div className="h-px bg-border-soft ml-[52px]" />

          {/* Điểm đến */}
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-7 h-7 rounded-full bg-gold-tint flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-gold" style={{ fontSize: 15, fontVariationSettings: "'FILL' 1" }}>flight</span>
            </div>
            <div className="flex-1 min-w-0">
              <AddressInput
                label="Điểm đến"
                placeholder="Sân bay hoặc điểm đến..."
                value={watch('destination') ?? ''}
                onChange={(v) => setValue('destination', v, { shouldValidate: true })}
                onPlaceSelect={(addr, latlng) => {
                  setValue('destination', addr, { shouldValidate: true })
                  setDestLatLng(latlng)
                }}
                onClear={() => setDestLatLng(null)}
                error={errors.destination?.message}
              />
            </div>
          </div>
        </div>

        {/* ── LOẠI XE ───────────────────────────────────────── */}
        <SectionLabel>Loại xe</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {VEHICLE_TYPES.map((v) => {
            const active = vehicleType === v.value
            return (
              <button
                key={v.value}
                type="button"
                onClick={() => handleVehicleChange(v.value)}
                className={clsx(
                  'flex flex-col items-center gap-1 py-3 rounded-card border transition-all',
                  active
                    ? 'border-primary bg-primary-tint shadow-[0_0_0_3px_rgba(0,106,54,0.18)]'
                    : 'border-border-gray bg-white'
                )}
              >
                <span
                  className={clsx('material-symbols-outlined text-[26px]', active ? 'text-primary' : 'text-neutral-gray')}
                  style={{ fontVariationSettings: "'wght' 300" }}
                >
                  {v.icon}
                </span>
                <span className={clsx('text-[13px] font-semibold', active ? 'text-primary' : 'text-navy')}>
                  {v.label}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── NGÀY KHỞI HÀNH ────────────────────────────────── */}
        <SectionLabel>Ngày khởi hành</SectionLabel>
        <div className="overflow-x-auto -mx-4 px-4 pb-0.5">
          <div className="flex gap-2" style={{ width: 'max-content' }}>
            {DATE_CHIPS.map((chip) => {
              const active = selectedDate === chip.value
              return (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => setValue('date', chip.value, { shouldValidate: true })}
                  className={clsx(
                    'px-4 py-2 rounded-pill text-[13px] font-medium border whitespace-nowrap shrink-0 transition-colors',
                    active
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-navy border-border-gray'
                  )}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── GIỜ ĐÓN ──────────────────────────────────────── */}
        <SectionLabel>Giờ đón</SectionLabel>
        <div className="flex flex-col gap-1.5">
          {TIME_ROWS.map((row, ri) => (
            <div key={ri} className="overflow-x-auto -mx-4 px-4">
              <div className="flex gap-1.5" style={{ width: 'max-content' }}>
                {row.map((val) => {
                  const active = selectedTime === val
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setValue('time', val, { shouldValidate: true })}
                      className={clsx(
                        'w-[56px] py-[7px] rounded-pill text-[13px] font-medium border shrink-0 transition-colors',
                        active
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-navy border-border-gray'
                      )}
                    >
                      {val}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ── BẢNG GIÁ THAM KHẢO ───────────────────────────── */}
        <SectionLabel>Bảng giá tham khảo</SectionLabel>
        <div className="bg-white rounded-card shadow-card border border-border-soft">
          <div className="flex items-center gap-4 px-4 py-3.5">
            <div className="flex-1">
              <p className="text-[12px] text-neutral-gray mb-0.5">Khoảng cách</p>
              <p className="text-[16px] font-semibold text-navy tabular-nums">
                {distance > 0 ? `${distance.toFixed(1)} km` : '—'}
              </p>
            </div>
            <div className="w-px h-8 bg-border-soft" />
            <div className="flex-1">
              <p className="text-[12px] text-neutral-gray mb-0.5">Mức giá tham khảo</p>
              {activeConfig && suggestedMin > 0 ? (
                <p className="text-[15px] font-semibold text-navy tabular-nums">
                  {Number(suggestedMin || 0).toLocaleString('vi')} – {Number(suggestedMax || 0).toLocaleString('vi')} đ
                </p>
              ) : (
                <p className="text-[13px] text-neutral-gray">
                  {activeConfig ? 'Chọn điểm đón & đến' : 'Chọn địa điểm để xem'}
                </p>
              )}
            </div>
          </div>
          {errors.distance_km && (
            <p className="text-danger-red text-xs px-4 pb-3 -mt-1">{errors.distance_km.message}</p>
          )}
        </div>

        {/* ── GIÁ BẠN MUỐN TRẢ ────────────────────────────── */}
        <SectionLabel>Giá bạn muốn trả</SectionLabel>
        <div className="bg-white rounded-card shadow-card border border-border-soft flex items-center px-4 h-14">
          <input
            type="number"
            {...register('price')}
            placeholder="Tự động tính khi chọn địa điểm"
            className="flex-1 outline-none text-navy text-[18px] font-semibold tabular-nums min-w-0"
            style={{ color: '#006a36' }}
          />
          <span className="text-neutral-gray text-sm font-medium ml-2 shrink-0">đ</span>
        </div>
        {errors.price && <p className="text-danger-red text-xs mt-1">{errors.price.message}</p>}

        {/* ── VOUCHER ──────────────────────────────────────── */}
        <SectionLabel>Voucher</SectionLabel>
        <button
          type="button"
          onClick={() => setShowVouchers(true)}
          className="bg-white rounded-card shadow-card border border-border-soft w-full flex items-center gap-3 px-4 py-3 text-left"
        >
          <span
            className={clsx(
              'material-symbols-outlined text-[20px]',
              discount > 0 ? 'text-primary' : 'text-neutral-gray',
            )}
            style={{ fontVariationSettings: discount > 0 ? "'FILL' 1" : undefined }}
          >
            confirmation_number
          </span>
          {discount > 0 ? (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-navy">{voucherCode}</p>
                <p className="text-[11px] text-success-green">Tiết kiệm {discount.toLocaleString('vi')}đ</p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setVoucherCode(''); setDiscount(0); setVoucherIsCapped(false) }}
                className="w-6 h-6 rounded-full bg-border-gray flex items-center justify-center shrink-0"
              >
                <span className="material-symbols-outlined text-[14px] text-neutral-gray">close</span>
              </button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm text-neutral-gray">Chọn hoặc nhập mã voucher...</span>
              <span className="material-symbols-outlined text-neutral-dim text-[16px]">chevron_right</span>
            </>
          )}
        </button>

        <VoucherSheet
          open={showVouchers}
          onClose={() => setShowVouchers(false)}
          currentPrice={Number(watch('price')) || 0}
          selectedCode={voucherCode}
          onSelect={(v, disc, capped) => { setVoucherCode(v.code); setDiscount(disc); setVoucherIsCapped(capped) }}
        />

        {/* ── GHI CHÚ CHO TÀI XẾ ──────────────────────────── */}
        <SectionLabel>Ghi chú cho tài xế</SectionLabel>
        <div className="bg-white rounded-card shadow-card border border-border-soft">
          <textarea
            {...register('note')}
            rows={3}
            maxLength={500}
            placeholder="Ví dụ: có 2 vali lớn, gọi trước 30 phút, đón tại cổng B..."
            className="w-full px-4 py-3 text-sm text-navy outline-none resize-none rounded-card placeholder:text-neutral-gray/70"
          />
          <div className="px-4 pb-2 text-right">
            <span className="text-[11px] text-neutral-gray tabular-nums">
              {(watch('note') ?? '').length}/500
            </span>
          </div>
        </div>

        <div className="h-4" />
      </div>

      {/* ── Sticky footer — sits above bottom nav ──────── */}
      <div className="above-nav fixed left-0 w-full bg-white/[0.96] backdrop-blur-[10px] border-t border-border-soft shadow-card-up px-4 pt-3 pb-4 z-30">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-neutral-gray">Tổng thanh toán</p>
            <div className="flex flex-col">
              <div className="flex items-baseline gap-2">
                <span className="text-[22px] font-bold text-navy tabular-nums">{total.toLocaleString('vi')} đ</span>
                {discount > 0 && (
                  <span className="text-[12px] font-semibold text-success-green">-{discount.toLocaleString('vi')}đ</span>
                )}
              </div>
              {discount > 0 && (
                <span className="text-[11px] text-neutral-gray">Giảm tối đa 10% giá cuốc</span>
              )}
            </div>
          </div>
          <Button type="submit" size="lg" loading={bookingMutation.isPending} className="shrink-0">
            Đặt xe →
          </Button>
        </div>
      </div>
    </form>
  )
}
