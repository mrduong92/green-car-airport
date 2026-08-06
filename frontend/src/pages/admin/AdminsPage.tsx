import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  getAdminUsers, createAdminUser, updateAdminUser,
  blockAdminUser, unblockAdminUser, resetAdminUserPassword, changeOwnPassword,
} from '@/api/admin'
import { useUiStore } from '@/stores/ui'
import EmptyState from '@/components/common/EmptyState'
import Button from '@/components/common/Button'

type ApiError = { response?: { data?: { message?: string } } }

const PASSWORD_RE = /^\d{6}$/

const createSchema = z.object({
  name: z.string().min(1, 'Nhập họ tên'),
  phone: z.string().regex(/^0\d{8,10}$/, 'Số điện thoại không hợp lệ'),
  password: z.string().regex(PASSWORD_RE, 'Mật khẩu phải là 6 chữ số'),
})
type CreateForm = z.infer<typeof createSchema>

const INPUT_CLASS = 'border border-border-gray rounded-input px-3 py-2.5 text-sm text-navy outline-none focus:border-primary transition-colors'

export default function AdminsPage() {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)

  const [showCreate, setShowCreate] = useState(false)
  const [renameTarget, setRenameTarget] = useState<App.AdminUser | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [resetTarget, setResetTarget] = useState<App.AdminUser | null>(null)
  const [resetValue, setResetValue] = useState('')
  const [blockTarget, setBlockTarget] = useState<App.AdminUser | null>(null)
  const [showOwnPassword, setShowOwnPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const { data: admins = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => getAdminUsers().then((r) => r.data),
  })

  const { register, handleSubmit, reset: resetCreateForm, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-users'] })

  const createMutation = useMutation({
    mutationFn: (d: CreateForm) => createAdminUser(d),
    onSuccess: () => {
      showToast('Đã tạo quản trị viên', 'success')
      refresh()
      resetCreateForm()
      setShowCreate(false)
    },
    onError: (err: ApiError) => showToast(err.response?.data?.message ?? 'Tạo quản trị viên thất bại', 'error'),
  })

  const renameMutation = useMutation({
    mutationFn: () => updateAdminUser(renameTarget!.id, { name: renameValue.trim() }),
    onSuccess: () => {
      showToast('Đã cập nhật tên', 'success')
      refresh()
      setRenameTarget(null)
    },
    onError: (err: ApiError) => showToast(err.response?.data?.message ?? 'Cập nhật thất bại', 'error'),
  })

  const blockMutation = useMutation({
    mutationFn: (a: App.AdminUser) => (a.is_blocked ? unblockAdminUser(a.id) : blockAdminUser(a.id)),
    onSuccess: (_, a) => {
      showToast(a.is_blocked ? 'Đã bỏ khoá quản trị viên' : 'Đã khoá quản trị viên', 'success')
      refresh()
      setBlockTarget(null)
    },
    onError: (err: ApiError) => showToast(err.response?.data?.message ?? 'Thao tác thất bại', 'error'),
  })

  const resetMutation = useMutation({
    mutationFn: () => resetAdminUserPassword(resetTarget!.id, { password: resetValue }),
    onSuccess: () => {
      showToast('Đã đặt lại mật khẩu', 'success')
      setResetTarget(null)
      setResetValue('')
    },
    onError: (err: ApiError) => showToast(err.response?.data?.message ?? 'Đặt lại mật khẩu thất bại', 'error'),
  })

  const ownPasswordMutation = useMutation({
    mutationFn: () => changeOwnPassword({ current_password: currentPassword, password: newPassword }),
    onSuccess: () => {
      showToast('Đã đổi mật khẩu', 'success')
      setShowOwnPassword(false)
      setCurrentPassword('')
      setNewPassword('')
    },
    onError: (err: ApiError) => showToast(err.response?.data?.message ?? 'Đổi mật khẩu thất bại', 'error'),
  })

  const openRename = (a: App.AdminUser) => {
    setRenameTarget(a)
    setRenameValue(a.name ?? '')
  }

  const openReset = (a: App.AdminUser) => {
    setResetTarget(a)
    setResetValue('')
  }

  // Bỏ khoá là thao tác nhẹ, chạy thẳng; khoá thì hỏi lại vì đá người ta ra khỏi phiên.
  const onBlockClick = (a: App.AdminUser) => (a.is_blocked ? blockMutation.mutate(a) : setBlockTarget(a))

  return (
    <div className="flex flex-col px-4 py-4 gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="hidden lg:block text-h2 text-navy font-semibold">Quản trị viên</h1>
        <Button size="sm" className="ml-auto" onClick={() => setShowCreate(true)}>
          <span className="material-symbols-outlined text-lg">person_add</span>
          Thêm
        </Button>
      </div>

      <p className="text-[12px] text-neutral-gray -mt-1">
        Mọi quản trị viên có quyền như nhau. Bạn không thể tự khoá hoặc tự đặt lại mật khẩu của chính mình.
      </p>

      <div className="flex flex-col gap-3">
        {admins.length === 0 && (
          <EmptyState icon="admin_panel_settings" title="Chưa có quản trị viên"
            description="Thêm quản trị viên đầu tiên" />
        )}

        {admins.map((a) => (
          <div key={a.id} className="bg-white rounded-card shadow-card p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold shrink-0 ${a.is_blocked ? 'bg-danger-red/10 text-danger-red' : 'bg-primary-tint text-primary'}`}>
                {a.is_blocked
                  ? <span className="material-symbols-outlined text-xl">block</span>
                  : (a.name?.[0] ?? '?')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[14px] font-semibold text-navy truncate">{a.name}</p>
                  {a.is_self && (
                    <span className="text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-pill shrink-0">Bạn</span>
                  )}
                  {a.is_blocked && (
                    <span className="text-[10px] font-semibold text-danger-red bg-danger-red/10 rounded-full px-2 py-0.5 shrink-0">Đã khoá</span>
                  )}
                </div>
                <p className="text-[12px] text-neutral-gray">{a.phone}</p>
                <p className="text-[11px] text-neutral-gray mt-0.5">Tạo ngày {a.created_at}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {a.is_self ? (
                <button type="button" onClick={() => setShowOwnPassword(true)}
                  className="text-xs bg-primary/10 text-primary rounded-pill px-3 py-1.5 font-medium">
                  Đổi mật khẩu của tôi
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => openRename(a)}
                    className="text-xs bg-primary/10 text-primary rounded-pill px-3 py-1.5 font-medium">
                    Đổi tên
                  </button>
                  <button type="button" onClick={() => openReset(a)}
                    className="text-xs bg-primary/10 text-primary rounded-pill px-3 py-1.5 font-medium">
                    Đặt lại mật khẩu
                  </button>
                  <button type="button" onClick={() => onBlockClick(a)}
                    className={`text-xs rounded-pill px-3 py-1.5 font-medium ${a.is_blocked ? 'bg-success-green/10 text-success-green' : 'bg-danger-red/10 text-danger-red'}`}>
                    {a.is_blocked ? 'Bỏ khoá' : 'Khoá'}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create sheet */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setShowCreate(false)}>
          <form
            onSubmit={handleSubmit((d) => createMutation.mutate(d))}
            className="bg-white w-full rounded-t-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft">
              <p className="text-[15px] font-semibold text-navy">Thêm quản trị viên</p>
              <button type="button" onClick={() => setShowCreate(false)}>
                <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
              </button>
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Họ và tên</label>
                <input {...register('name')} placeholder="Nguyễn Văn A" className={INPUT_CLASS} />
                {errors.name && <p className="text-[11px] text-danger-red">{errors.name.message}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Số điện thoại</label>
                <input {...register('phone')} inputMode="numeric" placeholder="09xxxxxxxx" className={INPUT_CLASS} />
                {errors.phone && <p className="text-[11px] text-danger-red">{errors.phone.message}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Mật khẩu (6 chữ số)</label>
                <input {...register('password')} inputMode="numeric" maxLength={6} placeholder="654321" className={INPUT_CLASS} />
                {errors.password && <p className="text-[11px] text-danger-red">{errors.password.message}</p>}
                <p className="text-[11px] text-neutral-gray">Gửi mật khẩu này cho người dùng, họ đổi lại sau khi đăng nhập.</p>
              </div>
            </div>
            <div className="px-4 pb-6 pt-3 flex gap-3 border-t border-border-soft">
              <Button type="button" fullWidth variant="outline" onClick={() => setShowCreate(false)}>Huỷ</Button>
              <Button type="submit" fullWidth loading={createMutation.isPending}>Tạo</Button>
            </div>
          </form>
        </div>
      )}

      {/* Rename sheet */}
      {renameTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setRenameTarget(null)}>
          <div className="bg-white w-full rounded-t-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft">
              <p className="text-[15px] font-semibold text-navy">Đổi tên quản trị viên</p>
              <button onClick={() => setRenameTarget(null)}>
                <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
              </button>
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Số điện thoại</label>
                <p className="text-sm text-neutral-gray bg-warm-white rounded-input px-3 py-2.5">{renameTarget.phone}</p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Họ và tên</label>
                <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                  placeholder="Nguyễn Văn A" className={INPUT_CLASS} />
              </div>
            </div>
            <div className="px-4 pb-6 pt-3 flex gap-3 border-t border-border-soft">
              <Button fullWidth variant="outline" onClick={() => setRenameTarget(null)}>Huỷ</Button>
              <Button fullWidth loading={renameMutation.isPending} disabled={!renameValue.trim()}
                onClick={() => renameMutation.mutate()}>
                Lưu
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password sheet */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setResetTarget(null)}>
          <div className="bg-white w-full rounded-t-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft">
              <p className="text-[15px] font-semibold text-navy">Đặt lại mật khẩu</p>
              <button onClick={() => setResetTarget(null)}>
                <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
              </button>
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              <p className="text-[13px] text-neutral-gray">
                Đặt mật khẩu mới cho <span className="font-semibold text-navy">{resetTarget.name}</span> ({resetTarget.phone}).
                Người này sẽ bị đăng xuất khỏi mọi thiết bị.
              </p>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Mật khẩu mới (6 chữ số)</label>
                <input value={resetValue} onChange={(e) => setResetValue(e.target.value)}
                  inputMode="numeric" maxLength={6} placeholder="654321" className={INPUT_CLASS} />
              </div>
            </div>
            <div className="px-4 pb-6 pt-3 flex gap-3 border-t border-border-soft">
              <Button fullWidth variant="outline" onClick={() => setResetTarget(null)}>Huỷ</Button>
              <Button fullWidth loading={resetMutation.isPending} disabled={!PASSWORD_RE.test(resetValue)}
                onClick={() => resetMutation.mutate()}>
                Đặt lại
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Block confirm sheet */}
      {blockTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setBlockTarget(null)}>
          <div className="bg-white w-full rounded-t-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft">
              <p className="text-[15px] font-semibold text-navy">Khoá quản trị viên</p>
              <button onClick={() => setBlockTarget(null)}>
                <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
              </button>
            </div>
            <div className="px-4 py-4">
              <p className="text-[13px] text-neutral-gray">
                Khoá <span className="font-semibold text-navy">{blockTarget.name}</span> ({blockTarget.phone})?
                Người này bị đăng xuất khỏi mọi thiết bị và không đăng nhập lại được cho tới khi bạn bỏ khoá.
              </p>
            </div>
            <div className="px-4 pb-6 pt-3 flex gap-3 border-t border-border-soft">
              <Button fullWidth variant="outline" onClick={() => setBlockTarget(null)}>Huỷ</Button>
              <Button fullWidth variant="danger" loading={blockMutation.isPending}
                onClick={() => blockMutation.mutate(blockTarget)}>
                Khoá
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Own password sheet */}
      {showOwnPassword && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setShowOwnPassword(false)}>
          <div className="bg-white w-full rounded-t-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft">
              <p className="text-[15px] font-semibold text-navy">Đổi mật khẩu của tôi</p>
              <button onClick={() => setShowOwnPassword(false)}>
                <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
              </button>
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Mật khẩu hiện tại</label>
                <input value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                  type="password" inputMode="numeric" maxLength={6} className={INPUT_CLASS} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Mật khẩu mới (6 chữ số)</label>
                <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  type="password" inputMode="numeric" maxLength={6} className={INPUT_CLASS} />
              </div>
            </div>
            <div className="px-4 pb-6 pt-3 flex gap-3 border-t border-border-soft">
              <Button fullWidth variant="outline" onClick={() => setShowOwnPassword(false)}>Huỷ</Button>
              <Button fullWidth loading={ownPasswordMutation.isPending}
                disabled={!currentPassword || !PASSWORD_RE.test(newPassword)}
                onClick={() => ownPasswordMutation.mutate()}>
                Đổi mật khẩu
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
