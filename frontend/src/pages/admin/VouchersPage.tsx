import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getVouchers, createVoucher, updateVoucher, deactivateVoucher, getCustomers } from '@/api/admin'
import { useUiStore } from '@/stores/ui'
import Button from '@/components/common/Button'
import dayjs from 'dayjs'

interface PickedCustomer { id: number; name: string; phone: string }

const voucherFields = z.object({
  type: z.enum(['fixed', 'percent']),
  value: z.number({ coerce: true }).min(1),
  target: z.enum(['all', 'specific']),
  user_id: z.number({ coerce: true }).optional(),
  expires_at: z.string().min(1),
  usage_limit: z.number({ coerce: true }).min(1),
})
const targetRefineMessage = { message: 'Chọn khách để cấp voucher riêng', path: ['user_id'] }

const schema = voucherFields.extend({ code: z.string().min(3) })
  .refine((d) => d.target === 'all' || d.user_id !== undefined, targetRefineMessage)
type FormData = z.infer<typeof schema>

const editSchema = voucherFields
  .refine((d) => d.target === 'all' || d.user_id !== undefined, targetRefineMessage)
type EditFormData = z.infer<typeof editSchema>

// Dùng chung cho form tạo + form sửa — tìm khách theo SĐT, chọn 1 người.
function CustomerPicker({ value, onChange }: { value: PickedCustomer | null; onChange: (c: PickedCustomer | null) => void }) {
  const [search, setSearch] = useState('')
  const { data: results = [] } = useQuery({
    queryKey: ['customers', 'search', search],
    queryFn: () => getCustomers({ search }).then((r) => r.data),
    enabled: search.length >= 3,
  })

  if (value) {
    return (
      <div className="flex items-center justify-between border border-border-gray rounded-input px-3 py-2 text-sm">
        <span>{value.name} · {value.phone}</span>
        <button type="button" onClick={() => onChange(null)} className="text-neutral-gray">
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>
    )
  }

  return (
    <>
      <input value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm khách theo số điện thoại"
        className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
      {results.length > 0 && (
        <div className="border border-border-gray rounded-input mt-1 overflow-hidden max-h-40 overflow-y-auto">
          {results.map((c) => (
            <button key={c.id} type="button" onClick={() => { onChange(c); setSearch('') }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-light-green border-b border-border-gray last:border-b-0">
              {c.name} · {c.phone}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function EditVoucherForm({ voucher, onDone }: { voucher: App.Voucher; onDone: () => void }) {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [selectedCustomer, setSelectedCustomer] = useState<PickedCustomer | null>(
    voucher.target === 'specific' && voucher.user && voucher.user_id
      ? { id: voucher.user_id, name: voucher.user.name, phone: voucher.user.phone }
      : null,
  )

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      type: voucher.type,
      value: voucher.value,
      target: voucher.target,
      user_id: voucher.user_id ?? undefined,
      expires_at: voucher.expires_at.slice(0, 10),
      usage_limit: voucher.usage_limit,
    },
  })
  const type = watch('type')
  const target = watch('target')

  const updateMutation = useMutation({
    mutationFn: (d: EditFormData) => updateVoucher(voucher.id, {
      type: d.type,
      value: d.value,
      target: d.target,
      user_id: d.target === 'specific' ? d.user_id : null,
      expires_at: d.expires_at,
      usage_limit: d.usage_limit,
    }),
    onSuccess: () => {
      showToast('Đã lưu thay đổi', 'success')
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      onDone()
    },
    onError: () => showToast('Lưu thất bại', 'error'),
  })

  return (
    <form onSubmit={handleSubmit((d) => updateMutation.mutate(d))}
      className="bg-light-green rounded-card p-4 flex flex-col gap-3 mt-2">
      <div className="flex rounded-input overflow-hidden border border-border-gray">
        {(['fixed', 'percent'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setValue('type', t)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${type === t ? 'bg-primary text-white' : 'text-neutral-gray'}`}>
            {t === 'fixed' ? 'Số tiền cố định' : 'Phần trăm'}
          </button>
        ))}
      </div>

      <div className="flex rounded-input overflow-hidden border border-border-gray">
        {(['all', 'specific'] as const).map((t) => (
          <button key={t} type="button" onClick={() => {
            setValue('target', t)
            if (t === 'all') { setValue('user_id', undefined); setSelectedCustomer(null) }
          }}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${target === t ? 'bg-primary text-white' : 'text-neutral-gray'}`}>
            {t === 'all' ? 'Công khai (mọi khách)' : 'Cấp riêng 1 khách'}
          </button>
        ))}
      </div>

      {target === 'specific' && (
        <div>
          <CustomerPicker value={selectedCustomer} onChange={(c) => { setSelectedCustomer(c); setValue('user_id', c?.id ?? undefined) }} />
          {errors.user_id && <p className="text-danger-red text-xs mt-1">{errors.user_id.message}</p>}
        </div>
      )}

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

      <div>
        <label className="text-xs text-neutral-gray mb-1 block">Ngày hết hạn</label>
        <input type="date" {...register('expires_at')}
          className="border border-border-gray rounded-input px-3 py-2 text-sm outline-none w-full" />
        {errors.expires_at && <p className="text-danger-red text-xs mt-1">Vui lòng chọn ngày hết hạn</p>}
      </div>

      <div className="flex gap-2">
        <Button type="submit" fullWidth loading={updateMutation.isPending}>Lưu</Button>
        <button type="button" onClick={onDone}
          className="text-sm text-neutral-gray border border-border-gray rounded-input px-4">Huỷ</button>
      </div>
    </form>
  )
}

export default function VouchersPage() {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<PickedCustomer | null>(null)

  const { data: vouchers = [] } = useQuery({
    queryKey: ['vouchers'],
    queryFn: () => getVouchers().then((r) => r.data),
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'fixed', target: 'all', usage_limit: 100 },
  })
  const type = watch('type')
  const target = watch('target')

  const createMutation = useMutation({
    mutationFn: (d: FormData) => createVoucher(d),
    onSuccess: () => {
      showToast('Tạo voucher thành công', 'success')
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      reset()
      setSelectedCustomer(null)
      setShowForm(false)
    },
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

          {/* Target toggle */}
          <div className="flex rounded-input overflow-hidden border border-border-gray">
            {(['all', 'specific'] as const).map((t) => (
              <button key={t} type="button" onClick={() => {
                setValue('target', t)
                if (t === 'all') { setValue('user_id', undefined); setSelectedCustomer(null) }
              }}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${target === t ? 'bg-primary text-white' : 'text-neutral-gray'}`}>
                {t === 'all' ? 'Công khai (mọi khách)' : 'Cấp riêng 1 khách'}
              </button>
            ))}
          </div>

          {target === 'specific' && (
            <div>
              <CustomerPicker value={selectedCustomer} onChange={(c) => { setSelectedCustomer(c); setValue('user_id', c?.id ?? undefined) }} />
              {errors.user_id && <p className="text-danger-red text-xs mt-1">{errors.user_id.message}</p>}
            </div>
          )}

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

          <div>
            <label className="text-xs text-neutral-gray mb-1 block">Ngày hết hạn</label>
            <input type="date" {...register('expires_at')}
              className="border border-border-gray rounded-input px-3 py-2 text-sm outline-none w-full" />
            {errors.expires_at && <p className="text-danger-red text-xs mt-1">Vui lòng chọn ngày hết hạn</p>}
          </div>

          <Button type="submit" fullWidth loading={createMutation.isPending}>Tạo Voucher</Button>
        </form>
      )}

      {/* Voucher list */}
      <div className="flex flex-col gap-3">
        {vouchers.map((v) => (
          <div key={v.id} className="bg-white rounded-card shadow-card p-4">
            <div className="flex items-center gap-3">
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
                {v.target === 'specific' && v.user && (
                  <p className="text-caption text-primary font-medium">Riêng: {v.user.name} · {v.user.phone}</p>
                )}
              </div>
              <button onClick={() => setEditingId(editingId === v.id ? null : v.id)}
                className="text-xs text-primary border border-primary rounded-pill px-3 py-1.5">
                {editingId === v.id ? 'Đóng' : 'Sửa'}
              </button>
              {v.is_active && (
                <div className="flex gap-2">
                  <button onClick={() => navigator.clipboard.writeText(v.code).then(() => alert('Đã sao chép'))}
                    className="text-xs text-primary border border-primary rounded-pill px-3 py-1.5">Sao chép</button>
                  <button onClick={() => deactivateMutation.mutate(v.id)}
                    className="text-xs text-neutral-gray border border-border-gray rounded-pill px-3 py-1.5">Tắt</button>
                </div>
              )}
            </div>

            {editingId === v.id && (
              <EditVoucherForm voucher={v} onDone={() => setEditingId(null)} />
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
