// frontend/src/pages/admin/StaticPagesPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import clsx from 'clsx'
import { listPages, createPage, updatePage, deletePage } from '@/api/staticPages'
import { useUiStore } from '@/stores/ui'
import Button from '@/components/common/Button'
import TiptapEditor from '@/components/admin/TiptapEditor'

const createSchema = z.object({
  slug:    z.string().min(1, 'Bắt buộc').regex(/^[a-z0-9-]+$/, 'Chỉ chữ thường, số và dấu gạch ngang'),
  title:   z.string().min(1, 'Bắt buộc').max(150),
  content: z.string().min(1, 'Bắt buộc'),
})
const editSchema = createSchema.omit({ slug: true })
type FormData = z.infer<typeof createSchema>

export default function StaticPagesPage() {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const { data: pages = [] } = useQuery({
    queryKey: ['admin-static-pages'],
    queryFn: listPages,
  })

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(editingId ? editSchema : createSchema),
    defaultValues: { slug: '', title: '', content: '' },
  })

  const createMutation = useMutation({
    mutationFn: (d: FormData) => createPage(d),
    onSuccess: () => {
      showToast('Đã tạo trang', 'success')
      qc.invalidateQueries({ queryKey: ['admin-static-pages'] })
      reset(); setShowForm(false)
    },
    onError: () => showToast('Tạo trang thất bại', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<App.StaticPage> }) => updatePage(id, data),
    onSuccess: () => {
      showToast('Đã cập nhật', 'success')
      qc.invalidateQueries({ queryKey: ['admin-static-pages'] })
      setEditingId(null); reset(); setShowForm(false)
    },
    onError: () => showToast('Cập nhật thất bại', 'error'),
  })

  const toggleMutation = useMutation({
    mutationFn: (p: App.StaticPage) =>
      p.is_active ? deletePage(p.id) : updatePage(p.id, { is_active: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-static-pages'] }),
  })

  const startEdit = (p: App.StaticPage) => {
    setEditingId(p.id)
    reset({ slug: p.slug, title: p.title, content: p.content })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelForm = () => { setShowForm(false); setEditingId(null); reset({ slug: '', title: '', content: '' }) }

  const onSubmit = (d: FormData) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: { title: d.title, content: d.content } })
    } else {
      createMutation.mutate(d)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="flex flex-col px-4 py-4 gap-4">
      <div className="flex items-center justify-between">
        <h1 className="hidden lg:block text-h2 text-navy font-semibold">Trang tĩnh</h1>
        <Button size="sm" onClick={() => { cancelForm(); setShowForm(!showForm) }}>
          <span className="material-symbols-outlined text-lg">add</span>
          Tạo trang mới
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit(onSubmit)}
          className="bg-white rounded-card shadow-card p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-navy">
            {editingId ? 'Chỉnh sửa trang' : 'Tạo trang mới'}
          </p>

          {editingId ? (
            <div>
              <label className="text-xs text-neutral-gray mb-1 block">Đường dẫn (slug)</label>
              <p className="text-sm text-navy font-mono">/pages/{pages.find((p) => p.id === editingId)?.slug}</p>
            </div>
          ) : (
            <div>
              <label className="text-xs text-neutral-gray mb-1 block">Đường dẫn (slug)</label>
              <input {...register('slug')}
                placeholder="vd: huong-dan-su-dung"
                className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none font-mono" />
              {errors.slug && <p className="text-danger-red text-xs mt-1">{errors.slug.message}</p>}
            </div>
          )}

          <div>
            <label className="text-xs text-neutral-gray mb-1 block">Tiêu đề</label>
            <input {...register('title')}
              className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
            {errors.title && <p className="text-danger-red text-xs mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <label className="text-xs text-neutral-gray mb-1 block">Nội dung</label>
            <Controller
              name="content"
              control={control}
              render={({ field }) => <TiptapEditor value={field.value} onChange={field.onChange} />}
            />
            {errors.content && <p className="text-danger-red text-xs mt-1">{errors.content.message}</p>}
          </div>

          <div className="flex gap-2">
            <Button type="submit" fullWidth loading={isPending}>
              {editingId ? 'Lưu thay đổi' : 'Tạo trang'}
            </Button>
            <button type="button" onClick={cancelForm}
              className="px-4 py-2 text-sm text-neutral-gray border border-border-gray rounded-input">
              Huỷ
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {pages.map((p) => (
          <div key={p.id}
            className={clsx('bg-white rounded-card shadow-card p-4 flex items-center gap-3',
              !p.is_active && 'opacity-50')}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-navy">{p.title}</p>
              <p className="text-xs text-neutral-gray font-mono">/pages/{p.slug}</p>
              {!p.is_active && <p className="text-xs text-neutral-gray mt-0.5">Đã ẩn</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => startEdit(p)}
                className="text-xs text-primary border border-primary rounded-pill px-3 py-1.5">
                Sửa
              </button>
              <button onClick={() => toggleMutation.mutate(p)}
                className="text-xs text-neutral-gray border border-border-gray rounded-pill px-3 py-1.5">
                {p.is_active ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
          </div>
        ))}
        {pages.length === 0 && (
          <p className="text-caption text-neutral-gray text-center py-10">Chưa có trang nào</p>
        )}
      </div>
    </div>
  )
}
