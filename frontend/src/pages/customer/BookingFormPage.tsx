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

// ─── Tra bảng giá ─────────────────────────────────────────────────────────────
// Hai helper này là bộ lọc + công thức DUY NHẤT cho giá: dải "Mức giá tham khảo"
// hiển thị và giá auto-fill vào ô "Giá bạn muốn trả" đều đi qua đây.
// Trước đây mỗi chỗ lọc riêng và phía auto-fill thiếu điều kiện `service_type`,
// nên `.find()` có thể trả về config của loại dịch vụ khác (airport vs provincial)
// → giá điền vào lệch khỏi dải giá đang hiển thị ngay bên trên.
function findPriceConfig(
  configs: App.PriceConfig[],
  vehicleType: VehicleType,
  serviceType: 'airport' | 'provincial',
): App.PriceConfig | undefined {
  return configs.find(
    (c) =>
      c.trip_type === 'one_way' &&
      c.vehicle_type === vehicleType &&
      c.service_type === serviceType &&
      c.is_active,
  )
}

// `per_km`: nhân số km rồi làm tròn nghìn. `range`: lấy nguyên giá trong config.
function configPrice(cfg: App.PriceConfig | undefined, km: number, bound: 'min' | 'max'): number {
  if (!cfg) return 0
  const base = bound === 'min' ? cfg.min_price : cfg.max_price
  return cfg.price_type === 'per_km' ? Math.round((km * base) / 1000) * 1000 : base
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
  // Ô này là TUỲ CHỌN nhưng `register(..., { valueAsNumber: true })` biến ô
  // trống thành NaN, mà `.optional()`/`.default()` chỉ xử lý `undefined` —
  // NaN rớt `.min(0)` và chặn luôn nút đặt xe. Phải quy NaN/rỗng về 0 TRƯỚC
  // khi validate. Giữ `.min(0)` để số âm vẫn bị chặn.
  collection_fee: z.preprocess(
    (v) => (v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? 0 : v),
    z.coerce.number().min(0),
  ),
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
  // Địa chỉ ĐÃ chọn từ gợi ý (khác text đang gõ) — xem detectedService bên dưới
  const [pinnedPickup,   setPinnedPickup]   = useState('')
  const [pinnedDest,     setPinnedDest]     = useState('')

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
      collection_fee: 0,
    },
  })

  const distance     = watch('distance_km') || 0
  const price        = watch('price') || 0
  const selectedDate = watch('date')
  const selectedTime = watch('time')
  const collectionFee = Number(watch('collection_fee') || 0)
  // Tính từ địa chỉ ĐÃ pin, không phải text đang gõ: khoảng cách và giá chỉ đổi
  // khi khách chọn gợi ý, nên nếu service type chạy theo text thô thì chỉ cần gõ
  // chữ "sân bay" là dải giá tham khảo nhảy sang bảng giá sân bay trong khi giá
  // trong ô vẫn tính theo pin cũ → hai số lệch nhau.
  const detectedService  = detectServiceType(pinnedPickup, pinnedDest)
  // Ref để effect auto-fill giá đọc được service type mới nhất mà không phải
  // đưa nó vào dependency (cùng lý do với vehicleTypeRef ở trên)
  const detectedServiceRef = useRef(detectedService)
  detectedServiceRef.current = detectedService
  const total = Math.max(0, price - discount) + collectionFee

  // Giờ đặt xe hôm nay phải cách ít nhất 30 phút so với hiện tại
  const minTimeForToday = (() => {
    const slotMins = Math.ceil((dayjs().hour() * 60 + dayjs().minute() + 30) / 30) * 30
    return `${Math.floor(slotMins / 60).toString().padStart(2, '0')}:${(slotMins % 60).toString().padStart(2, '0')}`
  })()
  const hasValidSlotsToday  = TIME_ROWS.flat().some((t) => t >= minTimeForToday)
  const availableDateChips  = hasValidSlotsToday ? DATE_CHIPS : DATE_CHIPS.slice(1)
  const isTimeDisabled = (val: string) => selectedDate === DATE_CHIPS[0].value && val < minTimeForToday

  // Bảng giá từ API
  const { data: priceConfigs = [] } = useQuery({
    queryKey: ['price-configs'],
    queryFn: getPriceConfigs,
    staleTime: 5 * 60 * 1000,
  })

  const activeConfig = findPriceConfig(priceConfigs, vehicleType, detectedService)

  // Khoảng giá tham khảo hiển thị cho khách
  const suggestedMin = configPrice(activeConfig, distance, 'min')
  const suggestedMax = configPrice(activeConfig, distance, 'max')

  // ── Auto-calculate distance + auto-fill price when both locations are pinned ─
  useEffect(() => {
    if (!pickupLatLng || !destLatLng) return

    const applyKm = (km: number, label: string) => {
      setValue('distance_km', km, { shouldValidate: true })
      // Auto-fill giá = ĐÁY của dải giá tham khảo đang hiển thị
      const cfg = findPriceConfig(priceConfigs, vehicleTypeRef.current, detectedServiceRef.current)
      if (cfg) {
        setValue('price', configPrice(cfg, km, 'min'), { shouldValidate: true })
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

  // Khi hết giờ hôm nay, tự động chuyển sang ngày mai
  useEffect(() => {
    if (!hasValidSlotsToday && selectedDate === DATE_CHIPS[0].value) {
      setValue('date', DATE_CHIPS[1].value, { shouldValidate: true })
      setValue('time', '08:00', { shouldValidate: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidSlotsToday])

  // Khi chuyển sang hôm nay, tự động nhảy sang slot giờ hợp lệ gần nhất
  useEffect(() => {
    if (selectedDate !== DATE_CHIPS[0].value) return
    if (!selectedTime || selectedTime < minTimeForToday) {
      const firstValid = TIME_ROWS.flat().find((t) => t >= minTimeForToday)
      if (firstValid) setValue('time', firstValid, { shouldValidate: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleVehicleChange = (v: VehicleType) => {
    setVehicleType(v)
    setValue('vehicle_type', v)
    if (distance > 0) {
      const cfg = findPriceConfig(priceConfigs, v, detectedService)
      if (cfg) {
        setValue('price', configPrice(cfg, distance, 'min'), { shouldValidate: true })
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
        collection_fee:  data.collection_fee && data.collection_fee > 0 ? data.collection_fee : undefined,
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
  })

  useEffect(() => {
    if (activeBooking?.id && !user?.is_collaborator) {
      navigate(`/customer/booking/${activeBooking.id}`, { replace: true })
    }
  }, [activeBooking, navigate, user?.is_collaborator])

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
                  setPinnedPickup(addr)
                }}
                onClear={() => {
                  setPickupLatLng(null)
                  setPinnedPickup('')
                }}
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
                  setPinnedDest(addr)
                }}
                onClear={() => {
                  setDestLatLng(null)
                  setPinnedDest('')
                }}
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
            {availableDateChips.map((chip) => {
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
                  const active   = selectedTime === val
                  const disabled = isTimeDisabled(val)
                  return (
                    <button
                      key={val}
                      type="button"
                      disabled={disabled}
                      onClick={() => !disabled && setValue('time', val, { shouldValidate: true })}
                      className={clsx(
                        'w-[56px] py-[7px] rounded-pill text-[13px] font-medium border shrink-0 transition-colors',
                        disabled
                          ? 'bg-border-gray/40 text-neutral-gray/40 border-border-gray/30 cursor-not-allowed'
                          : active
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

        {/* ── THU HỘ (chỉ hiện với cộng tác viên) ─────────── */}
        {user?.is_collaborator && (
          <div className="flex flex-col gap-1.5 mt-4">
            <label className="text-[13px] font-medium text-navy">
              Thu Hộ <span className="text-neutral-gray font-normal">(tuỳ chọn)</span>
            </label>
            {/* setValueAs thay cho valueAsNumber: xoá trắng ô sẽ ra 0 chứ không
                phải NaN, nên khách xoá số đi vẫn đặt xe được. */}
            <div className="relative">
              <input
                type="number"
                min={0}
                step={1000}
                placeholder="0"
                {...register('collection_fee', {
                  setValueAs: (v) => (v === '' || v === null || v === undefined ? 0 : Number(v)),
                })}
                className="w-full rounded-input border border-border-gray px-3 py-2.5 text-[14px] text-navy pr-8 focus:outline-none focus:border-primary"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-neutral-gray pointer-events-none">đ</span>
            </div>
            <p className="text-[11px] text-neutral-gray">Số tiền thu hộ từ khách (không tính vào giá tài xế nhận)</p>
          </div>
        )}

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
