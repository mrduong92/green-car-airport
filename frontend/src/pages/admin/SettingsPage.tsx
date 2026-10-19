// frontend/src/pages/admin/SettingsPage.tsx
import { useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getAdminSettings, updateAdminSettings } from '@/api/settings'
import { useUiStore } from '@/stores/ui'
import Button from '@/components/common/Button'
import { apiMessage } from '@/utils/apiError'

const schema = z.object({
  contact_hotline:    z.string().min(1, 'Bắt buộc').max(50),
  contact_email:      z.string().min(1, 'Bắt buộc').email('Email không hợp lệ'),
  contact_zalo_phone: z.string().min(1, 'Bắt buộc').max(20),
  app_fee_percent:        z.number({ coerce: true }).min(0, 'Từ 0 đến 100').max(100, 'Từ 0 đến 100'),
  referral_voucher_value: z.number({ coerce: true }).int('Phải là số nguyên').min(1000, 'Tối thiểu 1.000đ'),
  referral_driver_points: z.number({ coerce: true }).int('Phải là số nguyên').min(0, 'Tối thiểu 0'),
  free_unlock_fee_vnd:    z.number({ coerce: true }).int('Phải là số nguyên').min(0, 'Tối thiểu 0'),
  free_show_sender_name: z.boolean(),
  free_show_group_name: z.boolean(),
  free_show_raw_text: z.boolean(),
  affiliate_cashback_percent:   z.coerce.number().min(0, 'Từ 0 đến 50').max(50, 'Từ 0 đến 50'),
  affiliate_commission_percent: z.coerce.number().min(0, 'Từ 0 đến 50').max(50, 'Từ 0 đến 50'),
  points_max_rate_percent:      z.coerce.number().min(0, 'Từ 0 đến 50').max(50, 'Từ 0 đến 50'),
})
type FormData = z.infer<typeof schema>

export default function AdminSettingsPage() {
  const showToast = useUiStore((s) => s.showToast)

  const { data: settings } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: getAdminSettings,
  })

  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { contact_hotline: '', contact_email: '', contact_zalo_phone: '', app_fee_percent: 20, referral_voucher_value: 100000, referral_driver_points: 50, free_unlock_fee_vnd: 300000, free_show_sender_name: true, free_show_group_name: true, free_show_raw_text: true, affiliate_cashback_percent: 5, affiliate_commission_percent: 5, points_max_rate_percent: 10 },
  })

  useEffect(() => {
    if (settings) reset(settings)
  }, [settings, reset])

  const updateMutation = useMutation({
    mutationFn: (d: FormData) => updateAdminSettings(d),
    onSuccess: () => showToast('Đã lưu cài đặt', 'success'),
    onError: (err) => {
      // 422 của Laravel: { message, errors: { field: [msg] } } — gắn lỗi lên đúng ô thay vì
      // chỉ hiện toast chung chung (vd points_max_rate_percent > app_fee_percent).
      const fieldErrors = (err as { response?: { status?: number; data?: { errors?: Record<string, string[]> } } })
        ?.response?.data?.errors
      if (fieldErrors) {
        for (const [field, messages] of Object.entries(fieldErrors)) {
          setError(field as keyof FormData, { message: messages[0] })
        }
      }
      showToast(apiMessage(err, 'Lưu cài đặt thất bại'), 'error')
    },
  })

  return (
    <div className="flex flex-col px-4 py-4 gap-4">
      <h1 className="hidden lg:block text-h2 text-navy font-semibold">Cài đặt</h1>

      <form onSubmit={handleSubmit((d) => updateMutation.mutate(d))}
        className="bg-white rounded-card shadow-card p-4 flex flex-col gap-3 max-w-md">
        <p className="text-sm font-semibold text-navy">Thông tin liên hệ hỗ trợ</p>
        <p className="text-xs text-neutral-gray -mt-1">
          Hiển thị cho Khách hàng và Tài xế trong màn Hồ sơ / Trợ giúp &amp; Liên hệ.
        </p>

        <div>
          <label className="text-xs text-neutral-gray mb-1 block">Hotline hỗ trợ</label>
          <input {...register('contact_hotline')} placeholder="1800 6789"
            className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
          {errors.contact_hotline && <p className="text-danger-red text-xs mt-1">{errors.contact_hotline.message}</p>}
        </div>

        <div>
          <label className="text-xs text-neutral-gray mb-1 block">Email hỗ trợ</label>
          <input {...register('contact_email')} placeholder="support@greenca.vn"
            className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
          {errors.contact_email && <p className="text-danger-red text-xs mt-1">{errors.contact_email.message}</p>}
        </div>

        <div>
          <label className="text-xs text-neutral-gray mb-1 block">Số điện thoại Zalo Admin</label>
          <input {...register('contact_zalo_phone')} placeholder="0931919786"
            className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
          {errors.contact_zalo_phone && <p className="text-danger-red text-xs mt-1">{errors.contact_zalo_phone.message}</p>}
        </div>

        <hr className="border-border-gray" />
        <p className="text-sm font-semibold text-navy">Phí app &amp; thưởng giới thiệu</p>

        <div>
          <label className="text-xs text-neutral-gray mb-1 block">Phí app (% trên giá cuốc sau voucher)</label>
          <input type="number" step="0.1" {...register('app_fee_percent')}
            className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
          {errors.app_fee_percent && <p className="text-danger-red text-xs mt-1">{errors.app_fee_percent.message}</p>}
        </div>

        <div>
          <label className="text-xs text-neutral-gray mb-1 block">Voucher cho người giới thiệu khách (đ)</label>
          <input type="number" {...register('referral_voucher_value')}
            className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
          {errors.referral_voucher_value && <p className="text-danger-red text-xs mt-1">{errors.referral_voucher_value.message}</p>}
        </div>

        <div>
          <label className="text-xs text-neutral-gray mb-1 block">Điểm thưởng giới thiệu tài xế (mỗi bên, 1 điểm = 1.000đ)</label>
          <input type="number" {...register('referral_driver_points')}
            className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
          {errors.referral_driver_points && <p className="text-danger-red text-xs mt-1">{errors.referral_driver_points.message}</p>}
        </div>

        <div>
          <label className="text-xs text-neutral-gray mb-1 block">Phí mở khóa Nhận cuốc Free (1 năm, VNĐ) — 0 = QR không điền sẵn số tiền</label>
          <input type="number" data-testid="setting-free-unlock-fee" {...register('free_unlock_fee_vnd')}
            className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
          {errors.free_unlock_fee_vnd && <p className="text-danger-red text-xs mt-1">{errors.free_unlock_fee_vnd.message}</p>}
        </div>

        <hr className="border-border-gray" />
        <p className="text-sm font-semibold text-navy">Chương trình điểm thưởng</p>

        <div>
          <label htmlFor="affiliate_cashback_percent" className="text-xs text-neutral-gray mb-1 block">% hoàn điểm cho khách</label>
          <input id="affiliate_cashback_percent" type="number" step="0.1" {...register('affiliate_cashback_percent')}
            className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
          {errors.affiliate_cashback_percent && <p className="text-danger-red text-xs mt-1">{errors.affiliate_cashback_percent.message}</p>}
        </div>

        <div>
          <label htmlFor="affiliate_commission_percent" className="text-xs text-neutral-gray mb-1 block">% hoa hồng giới thiệu</label>
          <input id="affiliate_commission_percent" type="number" step="0.1" {...register('affiliate_commission_percent')}
            className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
          {errors.affiliate_commission_percent && <p className="text-danger-red text-xs mt-1">{errors.affiliate_commission_percent.message}</p>}
        </div>

        <div>
          <label htmlFor="points_max_rate_percent" className="text-xs text-neutral-gray mb-1 block">% tối đa trừ bằng điểm</label>
          <input id="points_max_rate_percent" type="number" step="0.1" {...register('points_max_rate_percent')}
            className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
          {errors.points_max_rate_percent && <p className="text-danger-red text-xs mt-1">{errors.points_max_rate_percent.message}</p>}
        </div>

        <hr className="border-border-gray" />
        <p className="text-sm font-semibold text-navy">Tab Cuốc Free — thông tin hiển thị cho tài xế</p>
        <p className="text-xs text-neutral-gray -mt-1">Tắt mục nào, server sẽ không gửi mục đó cho tài xế (bảo mật thông tin cá nhân).</p>
        <label className="flex items-center gap-2 text-sm text-navy cursor-pointer">
          <input type="checkbox" data-testid="setting-free-show-sender-name" {...register('free_show_sender_name')} />
          Hiện tên người bắn
        </label>

        <label className="flex items-center gap-2 text-sm text-navy cursor-pointer">
          <input type="checkbox" data-testid="setting-free-show-group-name" {...register('free_show_group_name')} />
          Hiện tên nhóm
        </label>

        <label className="flex items-center gap-2 text-sm text-navy cursor-pointer">
          <input type="checkbox" data-testid="setting-free-show-raw-text" {...register('free_show_raw_text')} />
          Hiện tin nhắn gốc
        </label>

        <Button type="submit" loading={updateMutation.isPending}>Lưu thay đổi</Button>
      </form>
    </div>
  )
}
