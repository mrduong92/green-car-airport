import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createBooking, applyVoucher } from '@/api/bookings'
import { useUiStore } from '@/stores/ui'
import Button from '@/components/common/Button'

const schema = z.object({
  pickup: z.string().min(1, 'Vui lòng nhập điểm đón'),
  destination: z.string().min(1, 'Vui lòng nhập điểm đến'),
  date: z.string().min(1),
  time: z.string().min(1),
  distance_km: z.number({ coerce: true }).min(1),
  price: z.number({ coerce: true }).min(1, 'Vui lòng nhập giá'),
})
type FormData = z.infer<typeof schema>

export default function BookingFormPage() {
  const navigate = useNavigate()
  const showToast = useUiStore((s) => s.showToast)
  const [voucherCode, setVoucherCode] = useState('')
  const [discount, setDiscount] = useState(0)

  const today = new Date().toISOString().split('T')[0]
  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: today, time: '08:00', distance_km: 12 },
  })
  const price = watch('price') || 0
  const distance = watch('distance_km') || 0
  const suggestedMin = Math.round(distance * 25000 / 1000) * 1000
  const suggestedMax = Math.round(distance * 30000 / 1000) * 1000

  const voucherMutation = useMutation({
    mutationFn: () => applyVoucher(voucherCode),
    onSuccess: ({ data }) => { setDiscount(data.discount); showToast('Áp dụng voucher thành công', 'success') },
    onError: () => showToast('Mã voucher không hợp lệ', 'error'),
  })

  const bookingMutation = useMutation({
    mutationFn: (data: FormData) => createBooking({ ...data, voucher_code: voucherCode || undefined }),
    onSuccess: ({ data }) => navigate(`/customer/booking/${data.id}`),
    onError: () => showToast('Đặt xe thất bại, vui lòng thử lại', 'error'),
  })

  const total = Math.max(0, price - discount)

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-white px-4 py-4 border-b border-border-gray safe-top">
        <h1 className="text-h2 text-navy font-semibold">Đặt xe sân bay</h1>
      </div>

      <form onSubmit={handleSubmit((d) => bookingMutation.mutate(d))} className="flex flex-col flex-1 pb-28">
        <div className="px-4 py-4 flex flex-col gap-4">
          {/* Trip info card */}
          <div className="bg-white rounded-card shadow-card border-l-4 border-primary p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">location_on</span>
              <input {...register('pickup')} placeholder="Nhập địa điểm đón"
                className="flex-1 outline-none text-navy text-sm" />
            </div>
            <div className="h-px bg-border-gray ml-9" />
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-orange-500">flight_takeoff</span>
              <input {...register('destination')} placeholder="Sân bay Tân Sơn Nhất"
                className="flex-1 outline-none text-navy text-sm" />
            </div>
          </div>
          {(errors.pickup || errors.destination) && (
            <p className="text-danger-red text-xs -mt-2">{errors.pickup?.message || errors.destination?.message}</p>
          )}

          {/* Date / Time */}
          <div className="bg-white rounded-card shadow-card p-4 flex gap-3">
            <div className="flex-1 flex items-center gap-2 border border-border-gray rounded-input px-3 py-2">
              <span className="material-symbols-outlined text-neutral-gray text-xl">calendar_today</span>
              <input type="date" {...register('date')} className="flex-1 outline-none text-sm text-navy" />
            </div>
            <div className="flex-1 flex items-center gap-2 border border-border-gray rounded-input px-3 py-2">
              <span className="material-symbols-outlined text-neutral-gray text-xl">schedule</span>
              <input type="time" {...register('time')} className="flex-1 outline-none text-sm text-navy" />
            </div>
          </div>

          {/* Distance + Price */}
          <div className="bg-white rounded-card shadow-card p-4 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-gray w-32">Số km ước tính</span>
              <div className="flex-1 flex items-center gap-2 border border-border-gray rounded-input px-3 py-2">
                <input type="number" {...register('distance_km')} className="flex-1 outline-none text-sm text-navy" />
                <span className="text-neutral-gray text-sm">km</span>
              </div>
            </div>

            <div>
              <p className="text-caption text-neutral-gray mb-2">Bảng giá tham khảo</p>
              <span className="bg-light-green text-primary text-xs font-semibold rounded-pill px-3 py-1">
                {suggestedMin.toLocaleString('vi')} – {suggestedMax.toLocaleString('vi')} đ
              </span>
            </div>

            <div className="flex items-center border border-border-gray rounded-input overflow-hidden">
              <span className="px-3 py-3 text-neutral-gray text-sm bg-light-green border-r border-border-gray">đ</span>
              <input type="number" {...register('price')} placeholder="Nhập giá bạn muốn trả"
                className="flex-1 px-3 py-3 outline-none text-navy text-sm" />
            </div>
            {errors.price && <p className="text-danger-red text-xs">{errors.price.message}</p>}
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
                <input value={voucherCode} onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                  placeholder="Nhập mã voucher" className="flex-1 outline-none text-sm text-navy" />
                {voucherCode && (
                  <button type="button" onClick={() => voucherMutation.mutate()}
                    className="text-primary text-sm font-medium">Áp dụng</button>
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
