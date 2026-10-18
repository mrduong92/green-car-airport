import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import clsx from 'clsx'
import { adminGetPriceConfigs, adminCreatePriceConfig, adminUpdatePriceConfig, adminDeletePriceConfig } from '@/api/priceConfig'
import { useUiStore } from '@/stores/ui'
import Button from '@/components/common/Button'

const VEHICLE_LABELS: Record<App.VehicleType, string> = {
  sedan_4: 'Sedan 4 chỗ',
  suv_5:   'SUV 5 chỗ',
  mpv_7:   'MPV 7 chỗ',
}

const SERVICE_LABELS: Record<string, string> = {
  airport:    'Sân bay',
  provincial: 'Đi tỉnh',
}

const schema = z.object({
  service_type: z.enum(['airport', 'provincial']),
  trip_type:    z.enum(['one_way', 'round_trip']),
  vehicle_type: z.enum(['sedan_4', 'suv_5', 'mpv_7']),
  price_type:   z.enum(['range', 'per_km']),
  min_price:    z.number({ coerce: true }).min(1),
  max_price:    z.number({ coerce: true }).min(1),
  sort_order:   z.number({ coerce: true }).min(0).default(0),
})
type FormData = z.infer<typeof schema>

export default function PriceConfigPage() {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const { data: configs = [] } = useQuery({
    queryKey: ['admin-price-configs'],
    queryFn: adminGetPriceConfigs,
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { service_type: 'airport', trip_type: 'one_way', vehicle_type: 'sedan_4', price_type: 'range', sort_order: 0 },
  })
  const priceType = watch('price_type')

  const createMutation = useMutation({
    mutationFn: (d: FormData) => adminCreatePriceConfig(d as Omit<App.PriceConfig, 'id' | 'is_active'>),
    onSuccess: () => {
      showToast('Đã thêm bảng giá', 'success')
      qc.invalidateQueries({ queryKey: ['admin-price-configs'] })
      reset(); setShowForm(false)
    },
    onError: () => showToast('Thêm thất bại', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<App.PriceConfig> }) => adminUpdatePriceConfig(id, data),
    onSuccess: () => {
      showToast('Đã cập nhật', 'success')
      qc.invalidateQueries({ queryKey: ['admin-price-configs'] })
      setEditingId(null); reset(); setShowForm(false)
    },
    onError: () => showToast('Cập nhật thất bại', 'error'),
  })

  const toggleMutation = useMutation({
    mutationFn: (cfg: App.PriceConfig) =>
      cfg.is_active
        ? adminDeletePriceConfig(cfg.id)
        : adminUpdatePriceConfig(cfg.id, { is_active: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-price-configs'] }),
  })

  const startEdit = (cfg: App.PriceConfig) => {
    setEditingId(cfg.id)
    setValue('service_type', cfg.service_type)
    setValue('trip_type', cfg.trip_type)
    setValue('vehicle_type', cfg.vehicle_type)
    setValue('price_type', cfg.price_type)
    setValue('min_price', cfg.min_price)
    setValue('max_price', cfg.max_price)
    setValue('sort_order', cfg.sort_order)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelForm = () => { setShowForm(false); setEditingId(null); reset() }

  const onSubmit = (d: FormData) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: d })
    } else {
      createMutation.mutate(d)
    }
  }

  const formatPrice = (cfg: App.PriceConfig) => {
    const suffix = cfg.price_type === 'per_km' ? '/km' : ''
    if (cfg.min_price === cfg.max_price) {
      return `${cfg.min_price.toLocaleString('vi')} đ${suffix}`
    }
    return `${cfg.min_price.toLocaleString('vi')} – ${cfg.max_price.toLocaleString('vi')} đ${suffix}`
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="flex flex-col px-4 py-4 gap-4">
      <div className="flex items-center justify-between">
        <h1 className="hidden lg:block text-h2 text-navy font-semibold">Bảng giá</h1>
        <Button size="sm" onClick={() => { cancelForm(); setShowForm(!showForm) }}>
          <span className="material-symbols-outlined text-lg">add</span>
          Thêm giá
        </Button>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit(onSubmit)}
          className="bg-white rounded-card shadow-card p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-navy">
            {editingId ? 'Chỉnh sửa bảng giá' : 'Thêm bảng giá mới'}
          </p>

          {/* Service type + Trip type */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-neutral-gray mb-1 block">Loại dịch vụ</label>
              <select {...register('service_type')}
                className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none bg-white">
                <option value="airport">Sân bay</option>
                <option value="provincial">Đi tỉnh</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-neutral-gray mb-1 block">Loại xe</label>
              <select {...register('vehicle_type')}
                className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none bg-white">
                <option value="sedan_4">Sedan 4 chỗ</option>
                <option value="suv_5">SUV 5 chỗ</option>
                <option value="mpv_7">MPV 7 chỗ</option>
              </select>
            </div>
          </div>

          {/* Price type toggle */}
          <div>
            <label className="text-xs text-neutral-gray mb-1 block">Cách tính giá</label>
            <div className="flex rounded-input overflow-hidden border border-border-gray">
              {(['range', 'per_km'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setValue('price_type', t)}
                  className={clsx('flex-1 py-2 text-sm font-medium transition-colors',
                    priceType === t ? 'bg-primary text-white' : 'text-neutral-gray')}>
                  {t === 'range' ? 'Giá cố định' : 'Theo km'}
                </button>
              ))}
            </div>
          </div>

          {/* Min / Max price */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-neutral-gray mb-1 block">
                {priceType === 'per_km' ? 'Từ (đ/km)' : 'Từ (đ)'}
              </label>
              <input type="number" {...register('min_price')}
                className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
              {errors.min_price && <p className="text-danger-red text-xs mt-1">Bắt buộc</p>}
            </div>
            <div className="flex-1">
              <label className="text-xs text-neutral-gray mb-1 block">
                {priceType === 'per_km' ? 'Đến (đ/km)' : 'Đến (đ)'}
              </label>
              <input type="number" {...register('max_price')}
                className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
              {errors.max_price && <p className="text-danger-red text-xs mt-1">Bắt buộc</p>}
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" fullWidth loading={isPending}>
              {editingId ? 'Lưu thay đổi' : 'Thêm bảng giá'}
            </Button>
            <button type="button" onClick={cancelForm}
              className="px-4 py-2 text-sm text-neutral-gray border border-border-gray rounded-input">
              Huỷ
            </button>
          </div>
        </form>
      )}

      {/* List */}
      <div className="flex flex-col gap-3">
        {configs.map((cfg) => (
          <div key={cfg.id}
            className={clsx('bg-white rounded-card shadow-card p-4 flex items-start gap-3',
              !cfg.is_active && 'opacity-50')}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-semibold text-white bg-primary rounded-pill px-2 py-0.5">
                  {SERVICE_LABELS[cfg.service_type]}
                </span>
                <span className="text-xs text-neutral-gray border border-border-gray rounded-pill px-2 py-0.5">
                  {VEHICLE_LABELS[cfg.vehicle_type]}
                </span>
                <span className="text-xs text-neutral-gray">
                  {cfg.price_type === 'per_km' ? 'Theo km' : 'Cố định'}
                </span>
              </div>
              <p className="text-sm font-bold text-navy">{formatPrice(cfg)}</p>
              {!cfg.is_active && <p className="text-xs text-neutral-gray mt-0.5">Đã ẩn</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => startEdit(cfg)}
                className="text-xs text-primary border border-primary rounded-pill px-3 py-1.5">
                Sửa
              </button>
              <button onClick={() => toggleMutation.mutate(cfg)}
                className="text-xs text-neutral-gray border border-border-gray rounded-pill px-3 py-1.5">
                {cfg.is_active ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
          </div>
        ))}
        {configs.length === 0 && (
          <p className="text-caption text-neutral-gray text-center py-10">Chưa có bảng giá nào</p>
        )}
      </div>
    </div>
  )
}
