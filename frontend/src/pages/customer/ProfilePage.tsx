import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getCustomerProfile, updateCustomerProfile } from '@/api/customer'
import { getCollaboratorWallet } from '@/api/collaborator'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { useLogout } from '@/hooks/useLogout'
import Button from '@/components/common/Button'
import VoucherSheet from '@/components/common/VoucherSheet'
import { BRAND } from '@/brand'

export default function CustomerProfilePage() {
  const { user, setAuth, token } = useAuthStore()
  const showToast = useUiStore((s) => s.showToast)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { canInstall } = usePwaInstall()

  const [showEdit, setShowEdit] = useState(false)
  const [editName, setEditName] = useState('')
  const [showContact, setShowContact] = useState(false)
  const [showVouchers, setShowVouchers] = useState(false)
  const [showReferral, setShowReferral] = useState(false)

  const { data: profile } = useQuery({
    queryKey: ['customer-profile'],
    queryFn: () => getCustomerProfile().then((r) => r.data),
  })

  const { data: collabWallet } = useQuery({
    queryKey: ['collaborator-wallet'],
    queryFn: () => getCollaboratorWallet().then((r) => r.data),
    enabled: !!user?.is_collaborator,
  })

  const logoutMutation = useLogout()

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
    { icon: 'person',              label: 'Thông tin cá nhân',   onClick: openEdit },
    { icon: 'group_add',           label: 'Giới thiệu bạn bè',   onClick: () => setShowReferral(true) },
    { icon: 'confirmation_number', label: 'Voucher của tôi',     onClick: () => setShowVouchers(true) },
    { icon: 'notifications',       label: 'Thông báo',           onClick: () => navigate('/customer/notifications') },
    { icon: 'help',                label: 'Trợ giúp & Liên hệ', onClick: () => setShowContact(true) },
    ...(canInstall ? [{ icon: 'install_mobile', label: 'Cài đặt ứng dụng', onClick: () => navigate('/install') }] : []),
  ]

  return (
    <div className="w-full flex flex-col px-4 py-4 gap-4">
      {/* Profile card */}
      <div className="rounded-card overflow-hidden shadow-card">
        <div
          className="px-5 py-6 flex items-center gap-4"
          style={{ background: 'linear-gradient(135deg, #006a36 0%, #004d27 100%)' }}
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

      {/* Collaborator wallet section */}
      {user?.is_collaborator && (
        <div className="mx-4 bg-white rounded-card shadow-card p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-gold text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              account_balance_wallet
            </span>
            <p className="font-semibold text-navy text-[15px]">Ví Cộng Tác Viên</p>
          </div>
          <div className="bg-warm-white rounded-[10px] px-4 py-3">
            <p className="text-[12px] text-neutral-gray mb-0.5">Số dư</p>
            <p className="text-[22px] font-bold text-gold tabular-nums">
              {(collabWallet?.points ?? 0).toLocaleString('vi')} điểm
            </p>
            <p className="text-[11px] text-neutral-gray mt-0.5">
              ~ {((collabWallet?.points ?? 0) * 1000).toLocaleString('vi')}đ
            </p>
          </div>
          <button
            onClick={() => navigate('/customer/collaborator/wallet')}
            className="flex items-center justify-between text-[13px] text-primary font-medium"
          >
            <span>Xem lịch sử thu hộ</span>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
          <p className="text-[11px] text-neutral-gray">
            * Rút tiền liên hệ kế toán. Thuế TNCN sẽ được khấu trừ khi rút.
          </p>
        </div>
      )}

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
      <VoucherSheet open={showVouchers} onClose={() => setShowVouchers(false)} showPersonal />

      {/* Referral bottom sheet */}
      {showReferral && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setShowReferral(false)}>
          <div className="bg-white w-full rounded-t-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft">
              <p className="text-[15px] font-semibold text-navy">Giới thiệu bạn bè</p>
              <button onClick={() => setShowReferral(false)}>
                <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
              </button>
            </div>
            <div className="px-4 py-5 flex flex-col gap-4">
              <p className="text-[13px] text-neutral-gray">
                Mời bạn bè đặt chuyến — họ nhận 4 voucher 50k, bạn nhận 2 voucher 50k sau chuyến đầu tiên của họ
              </p>
              {user?.referral_code && (
                <>
                  <div className="bg-light-green rounded-input px-3 py-2.5 flex items-center">
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
                          text: `Tham gia ${BRAND.name} và nhận voucher ngay!`,
                          url: `${window.location.origin}/login?ref=${user.referral_code}`,
                        })}
                        className="flex-1 h-10 rounded-pill bg-primary text-white text-[13px] font-semibold flex items-center justify-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[15px]">share</span>
                        Chia sẻ
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="px-4 pb-8">
              <button
                onClick={() => setShowReferral(false)}
                className="w-full h-11 rounded-pill bg-primary text-white text-sm font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

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
                { icon: 'mail',         label: 'Email',            value: BRAND.supportEmail,    sub: 'Phản hồi trong vòng 24 giờ' },
                { icon: 'chat_bubble',  label: 'Zalo',             value: `Zalo OA: ${BRAND.zaloOa}`, sub: 'Phản hồi nhanh trong giờ hành chính' },
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
