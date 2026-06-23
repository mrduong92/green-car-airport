import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getVouchers, createVoucher, deactivateVoucher } from '@/api/admin'
import { useUiStore } from '@/stores/ui'
import Button from '@/components/common/Button'
import dayjs from 'dayjs'

const schema = z.object({
  code: z.string().min(3),
  type: z.enum(['fixed', 'percent']),
  value: z.number({ coerce: true }).min(1),
  target: z.enum(['all', 'specific']),
  expires_at: z.string().min(1),
  usage_limit: z.number({ coerce: true }).min(1),
})
type FormData = z.infer<typeof schema>

export default function VouchersPage() {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [showForm, setShowForm] = useState(false)

  const { data: vouchers = [] } = useQuery({
    queryKey: ['vouchers'],
    queryFn: () => getVouchers().then((r) => r.data),
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'fixed', target: 'all', usage_limit: 100 },
  })
  const type = watch('type')

  const createMutation = useMutation({
    mutationFn: (d: FormData) => createVoucher(d),
    onSuccess: () => { showToast('Tạo voucher thành công', 'success'); qc.invalidateQueries({ queryKey: ['vouchers'] }); reset(); setShowForm(false) },
    onError: () => showToast('Tạo voucher thất bại', 'error'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => deactivateVoucher(id),
    onSuccess: () => { showToast('Đã vô hiệu hoá voucher', 'info'); qc.invalidateQueries({ queryKey: ['vouchers'] }) },
  })

  const genCode = () => setValue('code', `${import.meta.env.VITE_CODE_PREFIX}${Math.random().toString(36).slice(2, 8).toUpperCase()}`)

  return (
    <div className="flex flex-col px-4 py-4 gap-4">
      <div className="flex items-center justify-between">
        <h1 className="hidden lg:block text-h2 text-navy font-semibold">Voucher</h1>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <span className="material-symbols-outlined text-lg">add</span>
          Tạo mới
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))}
          className="bg-white rounded-card shadow-card p-4 flex flex-col gap-3">
          {/* Code */}
          <div className="flex gap-2">
            <input {...register('code')} placeholder="Mã voucher"
              className="flex-1 border border-border-gray rounded-input px-3 py-2 text-sm outline-none uppercase" />
            <button type="button" onClick={genCode}
              className="text-xs text-primary border border-primary rounded-input px-3">Tự tạo</button>
          </div>

          {/* Type toggle */}
          <div className="flex rounded-input overflow-hidden border border-border-gray">
            {(['fixed', 'percent'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setValue('type', t)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${type === t ? 'bg-primary text-white' : 'text-neutral-gray'}`}>
                {t === 'fixed' ? 'Số tiền cố định' : 'Phần trăm'}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <input type="number" {...register('value')} placeholder={type === 'fixed' ? 'Giá trị (đ)' : 'Phần trăm (%)'}
                className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
              {errors.value && <p className="text-danger-red text-xs mt-1">{errors.value.message}</p>}
            </div>
            <div className="flex-1">
              <input type="number" {...register('usage_limit')} placeholder="Giới hạn dùng"
                className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
            </div>
          </div>

          <input type="date" {...register('expires_at')}
            className="border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />

          <Button type="submit" fullWidth loading={createMutation.isPending}>Tạo Voucher</Button>
        </form>
      )}

      {/* Voucher list */}
      <div className="flex flex-col gap-3">
        {vouchers.map((v) => (
          <div key={v.id} className="bg-white rounded-card shadow-card p-4 flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono font-bold text-navy text-sm">{v.code}</span>
                {!v.is_active && <span className="text-xs text-neutral-gray line-through">Đã vô hiệu</span>}
              </div>
              <p className="text-caption text-neutral-gray">
                {v.type === 'fixed' ? `${v.value.toLocaleString('vi')} đ` : `${v.value}%`}
                {' · '}HSD: {dayjs(v.expires_at).format('DD/MM/YYYY')}
                {' · '}{v.usage_count}/{v.usage_limit} lượt
              </p>
            </div>
            {v.is_active && (
              <div className="flex gap-2">
                <button onClick={() => navigator.clipboard.writeText(v.code).then(() => alert('Đã sao chép'))}
                  className="text-xs text-primary border border-primary rounded-pill px-3 py-1.5">Sao chép</button>
                <button onClick={() => deactivateMutation.mutate(v.id)}
                  className="text-xs text-neutral-gray border border-border-gray rounded-pill px-3 py-1.5">Tắt</button>
              </div>
            )}
          </div>
        ))}
        {vouchers.length === 0 && (
          <p className="text-caption text-neutral-gray text-center py-10">Chưa có voucher nào</p>
        )}
      </div>
    </div>
  )
}
