import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { logout } from '@/api/auth'
import { getCustomerProfile, updateCustomerProfile } from '@/api/customer'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import Button from '@/components/common/Button'
import VoucherSheet from '@/components/common/VoucherSheet'

export default function CustomerProfilePage() {
  const { user, setAuth, token, clearAuth } = useAuthStore()
  const showToast = useUiStore((s) => s.showToast)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [showEdit, setShowEdit] = useState(false)
  const [editName, setEditName] = useState('')
  const [showContact, setShowContact] = useState(false)
  const [showVouchers, setShowVouchers] = useState(false)

  const { data: profile } = useQuery({
    queryKey: ['customer-profile'],
    queryFn: () => getCustomerProfile().then((r) => r.data),
  })

  const logoutMutation = useMutation({ mutationFn: logout, onSettled: clearAuth })

  const updateMutation = useMutation({
    mutationFn: () => updateCustomerProfile({ name: editName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-profile'] })
      if (user && token) setAuth({ ...user, name: editName }, token)
      showToast('Đã cập nhật thông tin', 'success')
      setShowEdit(false)
    },
    onError: () => showToast('Cập nhật thất bại', 'error'),
  })

  const openEdit = () => {
    setEditName(profile?.name ?? user?.name ?? '')
    setShowEdit(true)
  }

  const displayName = profile?.name ?? user?.name ?? ''
  const initials = displayName.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'

  const MENU = [
    { icon: 'person',           label: 'Thông tin cá nhân',   onClick: openEdit },
    { icon: 'confirmation_number', label: 'Voucher của tôi',  onClick: () => setShowVouchers(true) },
    { icon: 'notifications',    label: 'Thông báo',            onClick: () => navigate('/customer/notifications') },
    { icon: 'help',             label: 'Trợ giúp & Liên hệ',  onClick: () => setShowContact(true) },
  ]

  return (
    <div className="w-full flex flex-col px-4 py-4 gap-4">
      {/* Profile card */}
      <div className="rounded-card overflow-hidden shadow-card">
        <div
          className="px-5 py-6 flex items-center gap-4"
          style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #162C6B 100%)' }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-2xl text-white shrink-0"
            style={{ background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)' }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-[18px] truncate">{displayName || '—'}</p>
            <p className="text-white/80 text-[13px] mt-0.5">{profile?.phone ?? user?.phone ?? '—'}</p>
            <div
              className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-pill text-[11px] font-semibold text-white"
              style={{ background: 'rgba(255,255,255,0.18)' }}
            >
              <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
              Khách hàng{profile?.member_since ? ` từ ${profile.member_since}` : ''}
            </div>
          </div>
          <button
            onClick={openEdit}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.15)' }}
          >
            <span className="material-symbols-outlined text-white text-[16px]">edit</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { val: profile?.total     ?? '—', label: 'Chuyến' },
          { val: profile?.completed ?? '—', label: 'Hoàn thành' },
          { val: profile?.cancelled ?? '—', label: 'Đã hủy' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-card border border-border-soft text-center px-3 py-3">
            <p className="text-navy font-bold text-[18px]">{s.val}</p>
            <p className="text-neutral-gray text-[11px] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Total spent — only show when > 0 */}
      {profile && profile.total_spent > 0 && (
        <div className="bg-white rounded-card shadow-card border border-border-soft px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[18px]"
              style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
            <span className="text-sm text-neutral-gray">Tổng chi tiêu</span>
          </div>
          <span className="font-bold text-primary text-[15px] tabular-nums">
            {profile.total_spent.toLocaleString('vi')} đ
          </span>
        </div>
      )}

      {/* Menu */}
      <div className="bg-white rounded-card shadow-card border border-border-soft overflow-hidden">
        {MENU.map((row, i) => (
          <button
            key={row.icon}
            onClick={row.onClick}
            className={`w-full flex items-center gap-3 px-4 py-4 text-left active:bg-warm-white transition-colors
              ${i < MENU.length - 1 ? 'border-b border-border-soft' : ''}`}
          >
            <div className="w-8 h-8 rounded-logo bg-primary-tint flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-[16px]">{row.icon}</span>
            </div>
            <span className="text-navy text-sm font-medium flex-1">{row.label}</span>
            <span className="material-symbols-outlined text-neutral-dim text-[16px]">chevron_right</span>
          </button>
        ))}
      </div>

      {/* Logout */}
      <button
        onClick={() => logoutMutation.mutate()}
        disabled={logoutMutation.isPending}
        className="w-full h-11 rounded-pill border-[1.5px] border-danger-red text-danger-red text-sm font-semibold
          flex items-center justify-center gap-2 disabled:opacity-50 active:bg-danger-red/5 transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">logout</span>
        Đăng xuất
      </button>

      {/* Edit name bottom sheet */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setShowEdit(false)}>
          <div className="bg-white w-full rounded-t-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft">
              <p className="text-[15px] font-semibold text-navy">Thông tin cá nhân</p>
              <button onClick={() => setShowEdit(false)}>
                <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
              </button>
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Số điện thoại</label>
                <p className="text-sm text-neutral-gray bg-warm-white rounded-input px-3 py-2.5">
                  {profile?.phone ?? user?.phone ?? '—'}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-neutral-gray font-medium">Họ và tên</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  autoFocus
                  className="border border-border-gray rounded-input px-3 py-2.5 text-sm text-navy outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>
            <div className="px-4 pb-6 pt-3 flex gap-3 border-t border-border-soft">
              <Button fullWidth variant="outline" onClick={() => setShowEdit(false)}>Huỷ</Button>
              <Button
                fullWidth
                loading={updateMutation.isPending}
                disabled={!editName.trim()}
                onClick={() => updateMutation.mutate()}
              >
                Lưu
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Voucher sheet */}
      <VoucherSheet open={showVouchers} onClose={() => setShowVouchers(false)} />

      {/* Contact bottom sheet */}
      {showContact && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setShowContact(false)}>
          <div className="bg-white w-full rounded-t-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft">
              <p className="text-[15px] font-semibold text-navy">Trợ giúp & Liên hệ</p>
              <button onClick={() => setShowContact(false)}>
                <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
              </button>
            </div>
            <div className="px-4 py-5 flex flex-col gap-5">
              {[
                { icon: 'phone',        label: 'Hotline hỗ trợ',  value: '1800 6789',          sub: 'Miễn phí · 7:00–22:00 hằng ngày' },
                { icon: 'mail',         label: 'Email',            value: 'support@greencar.vn', sub: 'Phản hồi trong vòng 24 giờ' },
                { icon: 'chat_bubble',  label: 'Zalo',             value: 'Zalo OA: Green Car',  sub: 'Phản hồi nhanh trong giờ hành chính' },
              ].map(({ icon, label, value, sub }) => (
                <div key={icon} className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-logo bg-primary-tint flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary text-[18px]">{icon}</span>
                  </div>
                  <div>
                    <p className="text-[11px] text-neutral-gray">{label}</p>
                    <p className="text-sm font-semibold text-navy">{value}</p>
                    <p className="text-[11px] text-neutral-gray mt-0.5">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 pb-8">
              <button
                onClick={() => setShowContact(false)}
                className="w-full h-11 rounded-pill bg-primary text-white text-sm font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
