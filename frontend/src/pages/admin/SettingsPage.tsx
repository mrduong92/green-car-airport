// frontend/src/pages/admin/SettingsPage.tsx
import { useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getAdminSettings, updateAdminSettings } from '@/api/settings'
import { useUiStore } from '@/stores/ui'
import Button from '@/components/common/Button'

const schema = z.object({
  contact_hotline:    z.string().min(1, 'Bắt buộc').max(50),
  contact_email:      z.string().min(1, 'Bắt buộc').email('Email không hợp lệ'),
  contact_zalo_phone: z.string().min(1, 'Bắt buộc').max(20),
})
type FormData = z.infer<typeof schema>

export default function AdminSettingsPage() {
  const showToast = useUiStore((s) => s.showToast)

  const { data: settings } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: getAdminSettings,
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { contact_hotline: '', contact_email: '', contact_zalo_phone: '' },
  })

  useEffect(() => {
    if (settings) reset(settings)
  }, [settings, reset])

  const updateMutation = useMutation({
    mutationFn: (d: FormData) => updateAdminSettings(d),
    onSuccess: () => showToast('Đã lưu cài đặt', 'success'),
    onError: () => showToast('Lưu cài đặt thất bại', 'error'),
  })

  return (
    <div className="flex flex-col px-4 py-4 gap-4">
      <h1 className="hidden lg:block text-h2 text-navy font-semibold">Cài đặt liên hệ</h1>

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

        <Button type="submit" loading={updateMutation.isPending}>Lưu thay đổi</Button>
      </form>
    </div>
  )
}
