import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getVouchers, createVoucher, updateVoucher, deactivateVoucher, bulkGrantVouchers, getCustomers } from '@/api/admin'
import { useUiStore } from '@/stores/ui'
import Button from '@/components/common/Button'
import dayjs from 'dayjs'

interface PickedCustomer { id: number; name: string; phone: string }

const TYPE_OPTIONS = [
  { value: 'fixed', label: 'Giảm số tiền cố định', hint: 'VD: giảm 50.000đ mỗi cuốc' },
  { value: 'percent', label: 'Giảm theo phần trăm', hint: 'VD: giảm 10% giá cuốc' },
] as const

const TARGET_OPTIONS = [
  { value: 'all', label: 'Công khai', hint: 'Mọi khách dùng chung 1 mã, tới khi hết lượt' },
  { value: 'specific', label: 'Cấp riêng cho khách', hint: 'Chọn 1 hoặc nhiều khách, mỗi người nhận 1 mã riêng' },
] as const

// Dạng thẻ chọn (giống trang Chiến dịch) — rõ nghĩa hơn segmented button ngang.
function OptionCards<T extends string>({
  options, value, onChange,
}: { options: readonly { value: T; label: string; hint: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`text-left px-3 py-2 rounded-input border transition-colors ${
            value === o.value ? 'border-primary bg-light-green' : 'border-border-gray'
          }`}>
          <p className={`text-sm font-medium ${value === o.value ? 'text-primary' : 'text-navy'}`}>{o.label}</p>
          <p className="text-xs text-neutral-gray">{o.hint}</p>
        </button>
      ))}
    </div>
  )
}

const createFields = z.object({
  type: z.enum(['fixed', 'percent']),
  target: z.enum(['all', 'specific']),
  code: z.string().optional(),
  value: z.number({ coerce: true }).min(1),
  expires_at: z.string().min(1),
  usage_limit: z.number({ coerce: true }).min(1),
}).refine((d) => d.target === 'specific' || (!!d.code && d.code.length >= 3), {
  message: 'Nhập mã voucher (ít nhất 3 ký tự)', path: ['code'],
})
type CreateFormData = z.infer<typeof createFields>

const editFields = z.object({
  type: z.enum(['fixed', 'percent']),
  target: z.enum(['all', 'specific']),
  value: z.number({ coerce: true }).min(1),
  expires_at: z.string().min(1),
  usage_limit: z.number({ coerce: true }).min(1),
})
type EditFormData = z.infer<typeof editFields>

// Chọn NHIỀU khách — dùng ở form tạo, khi cấp riêng cho khách (1 hoặc nhiều người,
// mỗi người nhận 1 voucher cá nhân riêng, mã tự sinh).
function MultiCustomerPicker({ value, onChange }: { value: PickedCustomer[]; onChange: (list: PickedCustomer[]) => void }) {
  const [search, setSearch] = useState('')
  const { data: results = [] } = useQuery({
    queryKey: ['customers', 'search', search],
    queryFn: () => getCustomers({ search }).then((r) => r.data),
    enabled: search.length >= 3,
  })

  const add = (c: App.AdminCustomer) => {
    if (!value.some((v) => v.id === c.id)) onChange([...value, { id: c.id, name: c.name, phone: c.phone }])
    setSearch('')
  }
  const remove = (id: number) => onChange(value.filter((v) => v.id !== id))

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((c) => (
            <span key={c.id} className="flex items-center gap-1 bg-light-green text-primary text-xs rounded-pill pl-2.5 pr-1.5 py-1">
              {c.name} · {c.phone}
              <button type="button" onClick={() => remove(c.id)} className="flex items-center">
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </span>
          ))}
        </div>
      )}
      <input value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm khách theo số điện thoại để thêm"
        className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
      {results.length > 0 && (
        <div className="border border-border-gray rounded-input overflow-hidden max-h-40 overflow-y-auto">
          {results.map((c) => {
            const picked = value.some((v) => v.id === c.id)
            return (
              <button key={c.id} type="button" onClick={() => add(c)} disabled={picked}
                className="w-full text-left px-3 py-2 text-sm hover:bg-light-green border-b border-border-gray last:border-b-0 disabled:opacity-40 disabled:hover:bg-transparent">
                {c.name} · {c.phone}{picked ? ' (đã chọn)' : ''}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EditVoucherForm({ voucher, onDone }: { voucher: App.Voucher; onDone: () => void }) {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [recipients, setRecipients] = useState<PickedCustomer[]>(
    voucher.target === 'specific' && voucher.user && voucher.user_id
      ? [{ id: voucher.user_id, name: voucher.user.name, phone: voucher.user.phone }]
      : [],
  )

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<EditFormData>({
    resolver: zodResolver(editFields),
    defaultValues: {
      type: voucher.type,
      target: voucher.target,
      value: voucher.value,
      expires_at: voucher.expires_at.slice(0, 10),
      usage_limit: voucher.usage_limit,
    },
  })
  const type = watch('type')
  const target = watch('target')

  // Voucher chỉ gắn được đúng 1 user_id — người đầu trong danh sách chọn thì "giữ"
  // đúng voucher này (update), người thêm vào sau được cấp voucher MỚI cùng điều
  // khoản (mã tự sinh riêng), vì 1 mã không thể gắn cho nhiều người.
  const updateMutation = useMutation({
    mutationFn: async (d: EditFormData) => {
      const [first, ...rest] = recipients
      await updateVoucher(voucher.id, {
        type: d.type,
        value: d.value,
        target: d.target,
        user_id: d.target === 'specific' ? first?.id ?? null : null,
        expires_at: d.expires_at,
        usage_limit: d.usage_limit,
      })
      if (d.target === 'specific' && rest.length > 0) {
        await bulkGrantVouchers({
          user_ids: rest.map((c) => c.id), type: d.type, value: d.value,
          expires_at: d.expires_at, usage_limit: d.usage_limit,
        })
      }
    },
    onSuccess: () => {
      showToast('Đã lưu thay đổi', 'success')
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      onDone()
    },
    onError: () => showToast('Lưu thất bại', 'error'),
  })

  const onSubmitEdit = (d: EditFormData) => {
    if (d.target === 'specific' && recipients.length === 0) {
      showToast('Chọn ít nhất 1 khách', 'error')
      return
    }
    updateMutation.mutate(d)
  }

  return (
    <form onSubmit={handleSubmit(onSubmitEdit)}
      className="bg-light-green rounded-card p-4 flex flex-col gap-3 mt-2">
      <div>
        <label className="text-xs text-neutral-gray mb-1 block">Loại giảm giá</label>
        <OptionCards options={TYPE_OPTIONS} value={type} onChange={(v) => setValue('type', v)} />
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-neutral-gray mb-1 block">{type === 'fixed' ? 'Giá trị giảm (đ)' : 'Phần trăm giảm (%)'}</label>
          <input type="number" {...register('value')}
            className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
          {errors.value && <p className="text-danger-red text-xs mt-1">{errors.value.message}</p>}
        </div>
        <div className="flex-1">
          <label className="text-xs text-neutral-gray mb-1 block">Giới hạn lượt dùng</label>
          <input type="number" {...register('usage_limit')}
            className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
        </div>
      </div>

      <div>
        <label className="text-xs text-neutral-gray mb-1 block">Ngày hết hạn</label>
        <input type="date" {...register('expires_at')}
          className="border border-border-gray rounded-input px-3 py-2 text-sm outline-none w-full" />
        {errors.expires_at && <p className="text-danger-red text-xs mt-1">Vui lòng chọn ngày hết hạn</p>}
      </div>

      <div>
        <label className="text-xs text-neutral-gray mb-1 block">Phạm vi áp dụng</label>
        <OptionCards
          options={TARGET_OPTIONS.map((o) => o.value === 'specific'
            ? { ...o, label: 'Cấp riêng cho khách', hint: '1 người giữ voucher này, thêm người khác sẽ nhận mã mới cùng điều khoản' }
            : o)}
          value={target}
          onChange={(v) => {
            setValue('target', v)
            if (v === 'all') setRecipients([])
          }}
        />
      </div>

      {target === 'specific' && (
        <div>
          <label className="text-xs text-neutral-gray mb-1 block">Khách nhận voucher</label>
          <MultiCustomerPicker value={recipients} onChange={setRecipients} />
        </div>
      )}

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
  const [recipients, setRecipients] = useState<PickedCustomer[]>([])

  const { data: vouchers = [] } = useQuery({
    queryKey: ['vouchers'],
    queryFn: () => getVouchers().then((r) => r.data),
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CreateFormData>({
    resolver: zodResolver(createFields),
    defaultValues: { type: 'fixed', target: 'all', usage_limit: 100 },
  })
  const type = watch('type')
  const target = watch('target')

  const closeForm = () => {
    reset()
    setRecipients([])
    setShowForm(false)
  }

  const createMutation = useMutation({
    mutationFn: (d: CreateFormData) => createVoucher({
      code: d.code!, type: d.type, value: d.value, expires_at: d.expires_at, usage_limit: d.usage_limit,
    }),
    onSuccess: () => {
      showToast('Tạo voucher thành công', 'success')
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      closeForm()
    },
    onError: () => showToast('Tạo voucher thất bại', 'error'),
  })

  const bulkGrantMutation = useMutation({
    mutationFn: (d: CreateFormData) => bulkGrantVouchers({
      user_ids: recipients.map((c) => c.id), type: d.type, value: d.value, expires_at: d.expires_at, usage_limit: d.usage_limit,
    }),
    onSuccess: (res) => {
      showToast(`Đã cấp voucher cho ${res.data.length} khách`, 'success')
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      closeForm()
    },
    onError: () => showToast('Cấp voucher thất bại', 'error'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => deactivateVoucher(id),
    onSuccess: () => { showToast('Đã vô hiệu hoá voucher', 'info'); qc.invalidateQueries({ queryKey: ['vouchers'] }) },
  })

  const genCode = () => setValue('code', `${import.meta.env.VITE_CODE_PREFIX}${Math.random().toString(36).slice(2, 8).toUpperCase()}`)

  const onSubmitCreate = (d: CreateFormData) => {
    if (d.target === 'specific') {
      if (recipients.length === 0) { showToast('Chọn ít nhất 1 khách', 'error'); return }
      bulkGrantMutation.mutate(d)
    } else {
      createMutation.mutate(d)
    }
  }

  return (
    <div className="flex flex-col px-4 py-4 gap-4">
      <div className="flex items-center justify-between">
        <h1 className="hidden lg:block text-h2 text-navy font-semibold">Voucher</h1>
        <Button size="sm" onClick={() => (showForm ? closeForm() : setShowForm(true))}>
          <span className="material-symbols-outlined text-lg">add</span>
          Tạo mới
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleSubmit(onSubmitCreate)}
          className="bg-white rounded-card shadow-card p-4 flex flex-col gap-3">
          <div>
            <label className="text-xs text-neutral-gray mb-1 block">Loại giảm giá</label>
            <OptionCards options={TYPE_OPTIONS} value={type} onChange={(v) => setValue('type', v)} />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-neutral-gray mb-1 block">{type === 'fixed' ? 'Giá trị giảm (đ)' : 'Phần trăm giảm (%)'}</label>
              <input type="number" {...register('value')}
                className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
              {errors.value && <p className="text-danger-red text-xs mt-1">{errors.value.message}</p>}
            </div>
            <div className="flex-1">
              <label className="text-xs text-neutral-gray mb-1 block">Giới hạn lượt dùng</label>
              <input type="number" {...register('usage_limit')}
                className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-gray mb-1 block">Ngày hết hạn</label>
            <input type="date" {...register('expires_at')}
              className="border border-border-gray rounded-input px-3 py-2 text-sm outline-none w-full" />
            {errors.expires_at && <p className="text-danger-red text-xs mt-1">Vui lòng chọn ngày hết hạn</p>}
          </div>

          <div>
            <label className="text-xs text-neutral-gray mb-1 block">Phạm vi áp dụng</label>
            <OptionCards options={TARGET_OPTIONS} value={target} onChange={(v) => {
              setValue('target', v)
              setValue('usage_limit', v === 'specific' ? 1 : 100)
              if (v === 'specific') setValue('code', undefined)
            }} />
          </div>

          {target === 'all' ? (
            <div>
              <label className="text-xs text-neutral-gray mb-1 block">Mã voucher</label>
              <div className="flex gap-2">
                <input {...register('code')} placeholder="VD: AIRPORT50K"
                  className="flex-1 border border-border-gray rounded-input px-3 py-2 text-sm outline-none uppercase" />
                <button type="button" onClick={genCode}
                  className="text-xs text-primary border border-primary rounded-input px-3">Tự tạo</button>
              </div>
              {errors.code && <p className="text-danger-red text-xs mt-1">{errors.code.message}</p>}
            </div>
          ) : (
            <div>
              <label className="text-xs text-neutral-gray mb-1 block">Khách nhận voucher</label>
              <MultiCustomerPicker value={recipients} onChange={setRecipients} />
              <p className="text-xs text-neutral-gray mt-1">Gõ SĐT để tìm và thêm — chọn được nhiều khách, mỗi người nhận 1 mã voucher riêng.</p>
            </div>
          )}

          <Button type="submit" fullWidth loading={createMutation.isPending || bulkGrantMutation.isPending}>
            {target === 'specific' ? `Cấp cho ${recipients.length || ''} khách`.trim() : 'Tạo Voucher'}
          </Button>
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
