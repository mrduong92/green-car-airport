import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getDriverProfile, updateDriverProfile } from '@/api/trips'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { useLogout } from '@/hooks/useLogout'
import StatusBadge from '@/components/common/StatusBadge'
import Button from '@/components/common/Button'
import { BRAND } from '@/brand'

interface EditForm {
  name: string
  vehicle_make: string
  vehicle_model: string
  vehicle_plate: string
  vehicle_year: string
  vehicle_color: string
}

export default function DriverProfilePage() {
  const { user } = useAuthStore()
  const showToast = useUiStore((s) => s.showToast)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { canInstall } = usePwaInstall()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EditForm>({
    name: '', vehicle_make: '', vehicle_model: '',
    vehicle_plate: '', vehicle_year: '', vehicle_color: '',
  })

  const { data: profile } = useQuery({
    queryKey: ['driver-profile'],
    queryFn: () => getDriverProfile().then((r) => r.data),
  })

  const isNewDriver = profile !== undefined && !profile?.vehicle_plate

  useEffect(() => {
    if (isNewDriver) setEditing(true)
  }, [isNewDriver])

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name ?? '',
        vehicle_make:  profile.vehicle_make  ?? '',
        vehicle_model: profile.vehicle_model ?? '',
        vehicle_plate: profile.vehicle_plate ?? '',
        vehicle_year:  profile.vehicle_year?.toString() ?? '',
        vehicle_color: profile.vehicle_color ?? '',
      })
    }
  }, [profile])

  const logoutMutation = useLogout()

  const updateMutation = useMutation({
    mutationFn: () => updateDriverProfile({
      name:          form.name,
      vehicle_make:  form.vehicle_make,
      vehicle_model: form.vehicle_model,
      vehicle_plate: form.vehicle_plate,
      vehicle_year:  form.vehicle_year ? Number(form.vehicle_year) : undefined,
      vehicle_color: form.vehicle_color,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-profile'] })
      showToast('Đã cập nhật hồ sơ', 'success')
      setEditing(false)
    },
    onError: () => showToast('Cập nhật thất bại', 'error'),
  })

  const field = (key: keyof EditForm, label: string, placeholder?: string, type = 'text') => (
    <div className="flex flex-col gap-1">
      <label className="text-[12px] text-neutral-gray font-medium">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder ?? label}
        className="border border-border-gray rounded-input px-3 py-2.5 text-sm text-navy outline-none focus:border-primary transition-colors"
      />
    </div>
  )

  return (
    <div className="w-full flex flex-col">
      {/* Profile header */}
      <div className="bg-white px-4 py-6 flex flex-col items-center border-b border-border-gray">
        <div className="w-20 h-20 rounded-full bg-light-green flex items-center justify-center text-primary text-3xl font-bold mb-3">
          {profile?.name?.[0] ?? 'T'}
        </div>
        <p className="text-lg font-bold text-navy">{profile?.name ?? '—'}</p>
        <p className="text-caption text-neutral-gray mb-2">{profile?.phone ?? '—'}</p>
        <StatusBadge status={profile?.is_verified ? 'active' : 'waiting_approval'} />
      </div>

      {/* Onboarding banner — new driver without vehicle info */}
      {isNewDriver && (
        <div className="mx-4 mt-4 rounded-card border border-alert-orange/30 bg-alert-orange/10 p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-alert-orange text-[20px] mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>
            info
          </span>
          <div>
            <p className="text-sm font-semibold text-navy">Hoàn tất hồ sơ tài xế</p>
            <p className="text-[13px] text-neutral-gray mt-0.5">
              Vui lòng điền thông tin xe để bắt đầu nhận cuốc.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="bg-white mx-4 mt-4 rounded-card shadow-card p-4 grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Chuyến xong', value: profile?.trips_count ?? 0 },
          { label: 'Đánh giá',   value: profile?.rating?.toFixed(1) ?? '—' },
          { label: 'Tháng',      value: profile?.months_active ?? 0 },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xl font-bold text-primary">{value}</p>
            <p className="text-caption text-neutral-gray">{label}</p>
          </div>
        ))}
      </div>

      {/* Vehicle info + edit button */}
      <div className="bg-white mx-4 mt-3 rounded-card shadow-card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-navy">Thông tin xe</p>
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-primary text-[12px] font-semibold"
          >
            <span className="material-symbols-outlined text-[15px]">edit</span>
            Chỉnh sửa
          </button>
        </div>
        {profile ? (
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
            {[
              { label: 'Hãng xe',   value: `${profile.vehicle_make} ${profile.vehicle_model}` },
              { label: 'Biển số',   value: profile.vehicle_plate },
              { label: 'Năm SX',   value: profile.vehicle_year },
              { label: 'Màu xe',   value: profile.vehicle_color },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[11px] text-neutral-gray">{label}</p>
                <p className="font-medium text-navy">{value ?? '—'}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-gray">Chưa có thông tin xe. Nhấn Chỉnh sửa để thêm.</p>
        )}
      </div>

      {/* Actions */}
      <div className="bg-white mx-4 mt-3 rounded-card shadow-card divide-y divide-border-gray">
        {canInstall && (
          <button
            onClick={() => navigate('/install')}
            className="w-full flex items-center gap-3 px-4 py-4 text-navy"
          >
            <span className="material-symbols-outlined text-primary">install_mobile</span>
            <span className="text-sm font-medium flex-1 text-left">Cài đặt ứng dụng</span>
            <span className="material-symbols-outlined text-neutral-gray text-[16px]">chevron_right</span>
          </button>
        )}
        <button
          onClick={() => logoutMutation.mutate()}
          className="w-full flex items-center gap-3 px-4 py-4 text-danger-red"
        >
          <span className="material-symbols-outlined">logout</span>
          <span className="text-sm font-medium">Đăng xuất</span>
        </button>
      </div>

      {/* Referral section */}
      {user?.referral_code && (
        <div className="bg-white mx-4 mt-3 rounded-card shadow-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary text-[18px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}>group_add</span>
            <p className="text-sm font-semibold text-navy">Giới thiệu tài xế</p>
          </div>
          <p className="text-[12px] text-neutral-gray mb-3">
            Mời tài xế mới — cả hai nhận 50 điểm (50.000đ) khi họ hoàn thành chuyến đầu tiên
          </p>
          <div className="bg-light-green rounded-input px-3 py-2.5 flex items-center mb-3">
            <span className="text-primary font-bold text-sm tracking-wider flex-1">{user.referral_code}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/login?ref=${user.referral_code}`)
                showToast('Đã sao chép link giới thiệu', 'success')
              }}
              className="flex-1 h-10 rounded-pill border border-primary text-primary text-[13px] font-semibold flex items-center justify-center gap-1"
            >
              <span className="material-symbols-outlined text-[15px]">content_copy</span>
              Sao chép link
            </button>
            {typeof navigator.share === 'function' && (
              <button
                onClick={() => navigator.share({
                  title: BRAND.name,
                  text: `Tham gia ${BRAND.name} và nhận 50 điểm (50.000đ)!`,
                  url: `${window.location.origin}/login?ref=${user.referral_code}`,
                })}
                className="flex-1 h-10 rounded-pill bg-primary text-white text-[13px] font-semibold flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-[15px]">share</span>
                Chia sẻ
              </button>
            )}
          </div>
        </div>
      )}

      {/* Edit bottom sheet */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setEditing(false)}>
          <div
            className="w-full bg-white rounded-t-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft shrink-0">
              <p className="text-[15px] font-semibold text-navy">Chỉnh sửa hồ sơ</p>
              <button onClick={() => setEditing(false)} className="text-neutral-gray">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Form fields */}
            <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-3">
              {field('name', 'Họ và tên', 'Nguyễn Văn A')}
              <div className="h-px bg-border-gray" />
              <p className="text-[12px] font-semibold text-neutral-gray uppercase tracking-wide">Thông tin xe</p>
              <div className="grid grid-cols-2 gap-3">
                {field('vehicle_make',  'Hãng xe',   'Toyota')}
                {field('vehicle_model', 'Dòng xe',   'Camry')}
              </div>
              {field('vehicle_plate', 'Biển số xe', '51G-12345')}
              <div className="grid grid-cols-2 gap-3">
                {field('vehicle_year',  'Năm sản xuất', '2022', 'number')}
                {field('vehicle_color', 'Màu xe',        'Trắng')}
              </div>
            </div>

            {/* Actions */}
            <div className="px-4 pb-6 pt-3 flex gap-3 shrink-0 border-t border-border-soft">
              <Button fullWidth variant="outline" onClick={() => setEditing(false)}>Huỷ</Button>
              <Button fullWidth loading={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
                Lưu
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
