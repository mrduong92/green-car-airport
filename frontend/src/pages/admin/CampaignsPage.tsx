import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getCampaigns, createCampaign, updateCampaign } from '@/api/admin'
import { useUiStore } from '@/stores/ui'
import Button from '@/components/common/Button'

type ApiError = { response?: { data?: { message?: string } } }

// Khớp App\Support\CampaignTrigger ở backend — thêm loại mới thì thêm ở đó trước,
// dropdown này mới có gì để chọn.
const TRIGGERS = ['customer_registered', 'customer_logged_in'] as const
const TRIGGER_LABELS: Record<string, string> = {
  customer_registered: 'Ra mắt — khách đăng ký mới',
  customer_logged_in: 'Theo dịp (Tết…) — khách mở app trong khoảng ngày',
}

const schema = z.object({
  name: z.string().min(3),
  trigger: z.enum(TRIGGERS),
  voucher_count: z.number({ coerce: true }).min(1).max(20),
  voucher_value: z.number({ coerce: true }).min(1000),
  voucher_expires_days: z.number({ coerce: true }).min(1).max(365),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  max_grants: z.number({ coerce: true }).min(1).optional(),
})
type FormData = z.infer<typeof schema>

// Sửa không có `trigger` — đổi loại chiến dịch sau khi đã có grants sẽ gây nhầm lẫn
// (sổ campaign_grants đang gắn theo trigger cũ), xem spec. `name` sửa được bình thường.
const editSchema = schema.omit({ trigger: true })
type EditFormData = z.infer<typeof editSchema>

function toDateInput(v: string | null): string {
  return v ? v.slice(0, 10) : ''
}

function EditCampaignForm({ campaign, onDone }: { campaign: App.Campaign; onDone: () => void }) {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)

  const { register, handleSubmit, formState: { errors } } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: campaign.name,
      voucher_count: campaign.reward.voucher_count,
      voucher_value: campaign.reward.voucher_value,
      voucher_expires_days: campaign.reward.voucher_expires_days,
      starts_at: toDateInput(campaign.starts_at),
      ends_at: toDateInput(campaign.ends_at),
      max_grants: campaign.max_grants ?? undefined,
    },
  })

  const updateMutation = useMutation({
    mutationFn: (d: EditFormData) => updateCampaign(campaign.id, {
      name: d.name,
      reward: {
        voucher_count: d.voucher_count,
        voucher_value: d.voucher_value,
        voucher_expires_days: d.voucher_expires_days,
      },
      starts_at: d.starts_at || null,
      ends_at: d.ends_at || null,
      max_grants: d.max_grants ?? null,
    }),
    onSuccess: () => {
      showToast('Đã lưu thay đổi', 'success')
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      onDone()
    },
    onError: (err: ApiError) => showToast(err.response?.data?.message ?? 'Lưu thất bại', 'error'),
  })

  return (
    <form onSubmit={handleSubmit((d) => updateMutation.mutate(d))}
      className="bg-light-green rounded-card p-4 flex flex-col gap-3 mt-2">
      <div>
        <label className="text-xs text-neutral-gray mb-1 block">Tên chiến dịch</label>
        <input {...register('name')}
          className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
        {errors.name && <p className="text-danger-red text-xs mt-1">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-neutral-gray mb-1 block">Số voucher</label>
          <input type="number" {...register('voucher_count')}
            className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
          {errors.voucher_count && <p className="text-danger-red text-xs mt-1">{errors.voucher_count.message}</p>}
        </div>
        <div>
          <label className="text-xs text-neutral-gray mb-1 block">Mệnh giá (đ)</label>
          <input type="number" {...register('voucher_value')}
            className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
          {errors.voucher_value && <p className="text-danger-red text-xs mt-1">{errors.voucher_value.message}</p>}
        </div>
        <div>
          <label className="text-xs text-neutral-gray mb-1 block">Hạn (ngày)</label>
          <input type="number" {...register('voucher_expires_days')}
            className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
          {errors.voucher_expires_days && <p className="text-danger-red text-xs mt-1">{errors.voucher_expires_days.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-neutral-gray mb-1 block">Bắt đầu (để trống = ngay)</label>
          <input type="date" {...register('starts_at')}
            className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
        </div>
        <div>
          <label className="text-xs text-neutral-gray mb-1 block">Kết thúc (để trống = chưa chốt)</label>
          <input type="date" {...register('ends_at')}
            className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
        </div>
      </div>

      <div>
        <label className="text-xs text-neutral-gray mb-1 block">Trần số người nhận (để trống = không trần)</label>
        <input type="number" {...register('max_grants')}
          className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
      </div>

      <div className="flex gap-2">
        <Button type="submit" fullWidth loading={updateMutation.isPending}>Lưu</Button>
        <button type="button" onClick={onDone}
          className="text-sm text-neutral-gray border border-border-gray rounded-input px-4">Huỷ</button>
      </div>
    </form>
  )
}

export default function CampaignsPage() {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => getCampaigns().then((r) => r.data),
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { trigger: 'customer_registered' },
  })
  const trigger = watch('trigger')

  const createMutation = useMutation({
    mutationFn: (d: FormData) => createCampaign({
      name: d.name,
      trigger: d.trigger,
      reward: {
        voucher_count: d.voucher_count,
        voucher_value: d.voucher_value,
        voucher_expires_days: d.voucher_expires_days,
      },
      starts_at: d.starts_at || null,
      ends_at: d.ends_at || null,
      max_grants: d.max_grants ?? null,
    }),
    onSuccess: () => {
      showToast('Tạo chiến dịch thành công', 'success')
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      reset()
      setShowForm(false)
    },
    onError: (err: ApiError) => showToast(err.response?.data?.message ?? 'Tạo chiến dịch thất bại', 'error'),
  })

  const toggleActiveMutation = useMutation({
    mutationFn: (c: App.Campaign) => updateCampaign(c.id, { is_active: !c.is_active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }) },
  })

  return (
    <div className="flex flex-col px-4 py-4 gap-4">
      <div className="flex items-center justify-between">
        <h1 className="hidden lg:block text-h2 text-navy font-semibold">Chiến dịch</h1>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <span className="material-symbols-outlined text-lg">add</span>
          Tạo mới
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))}
          className="bg-white rounded-card shadow-card p-4 flex flex-col gap-3">
          <div>
            <input {...register('name')} placeholder="Tên chiến dịch"
              className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
            {errors.name && <p className="text-danger-red text-xs mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="text-xs text-neutral-gray mb-1 block">Loại chiến dịch</label>
            <div className="flex flex-col gap-1.5">
              {TRIGGERS.map((t) => (
                <button key={t} type="button" onClick={() => setValue('trigger', t)}
                  className={`text-left px-3 py-2 rounded-input border text-sm transition-colors ${
                    trigger === t ? 'border-primary bg-light-green text-primary font-medium' : 'border-border-gray text-navy'
                  }`}>
                  {TRIGGER_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-neutral-gray mb-1 block">Số voucher</label>
              <input type="number" {...register('voucher_count')}
                className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
              {errors.voucher_count && <p className="text-danger-red text-xs mt-1">{errors.voucher_count.message}</p>}
            </div>
            <div>
              <label className="text-xs text-neutral-gray mb-1 block">Mệnh giá (đ)</label>
              <input type="number" {...register('voucher_value')}
                className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
              {errors.voucher_value && <p className="text-danger-red text-xs mt-1">{errors.voucher_value.message}</p>}
            </div>
            <div>
              <label className="text-xs text-neutral-gray mb-1 block">Hạn (ngày)</label>
              <input type="number" {...register('voucher_expires_days')}
                className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
              {errors.voucher_expires_days && <p className="text-danger-red text-xs mt-1">{errors.voucher_expires_days.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-gray mb-1 block">
                Bắt đầu {trigger === 'customer_logged_in' ? '' : '(để trống = ngay)'}
              </label>
              <input type="date" {...register('starts_at')}
                className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs text-neutral-gray mb-1 block">
                Kết thúc {trigger === 'customer_logged_in' ? '' : '(để trống = chưa chốt)'}
              </label>
              <input type="date" {...register('ends_at')}
                className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
            </div>
          </div>
          {trigger === 'customer_logged_in' && (
            <p className="text-caption text-neutral-gray -mt-1">
              Nên đặt đủ ngày bắt đầu/kết thúc cho chương trình theo dịp — để trống nghĩa là chạy vô thời hạn.
            </p>
          )}

          <div>
            <label className="text-xs text-neutral-gray mb-1 block">Trần số người nhận (để trống = không trần)</label>
            <input type="number" {...register('max_grants')}
              className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
          </div>

          <Button type="submit" fullWidth loading={createMutation.isPending}>Tạo chiến dịch</Button>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {campaigns.map((c) => (
          <div key={c.id} className="bg-white rounded-card shadow-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-navy text-sm">{c.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-pill ${c.is_active ? 'bg-light-green text-primary' : 'bg-border-gray text-neutral-gray'}`}>
                    {c.is_active ? 'Đang chạy' : 'Đã tắt'}
                  </span>
                </div>
                <p className="text-caption text-neutral-gray">{TRIGGER_LABELS[c.trigger] ?? c.trigger}</p>
                <p className="text-caption text-neutral-gray">
                  {c.reward.voucher_count} × {c.reward.voucher_value.toLocaleString('vi')}đ, hạn {c.reward.voucher_expires_days} ngày
                  {' · '}{c.grants_count}/{c.max_grants ?? '∞'} đã phát
                </p>
              </div>
              <button onClick={() => setEditingId(editingId === c.id ? null : c.id)}
                className="text-xs text-primary border border-primary rounded-pill px-3 py-1.5">
                {editingId === c.id ? 'Đóng' : 'Sửa'}
              </button>
              <button onClick={() => toggleActiveMutation.mutate(c)}
                className="text-xs text-neutral-gray border border-border-gray rounded-pill px-3 py-1.5">
                {c.is_active ? 'Tắt' : 'Bật'}
              </button>
            </div>

            {editingId === c.id && (
              <EditCampaignForm campaign={c} onDone={() => setEditingId(null)} />
            )}
          </div>
        ))}
        {campaigns.length === 0 && (
          <p className="text-caption text-neutral-gray text-center py-10">Chưa có chiến dịch nào</p>
        )}
      </div>
    </div>
  )
}
