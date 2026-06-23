import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { useUiStore } from '@/stores/ui'

type Platform = 'android' | 'ios' | 'desktop'

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'desktop'
}

const STEPS: Record<Platform, { icon: string; title: string; desc: string }[]> = {
  android: [
    { icon: 'open_in_browser', title: 'Mở bằng Chrome', desc: 'Đảm bảo bạn đang dùng trình duyệt Chrome trên Android.' },
    { icon: 'more_vert',       title: 'Bấm menu ⋮', desc: 'Bấm vào biểu tượng ba chấm ở góc trên bên phải màn hình.' },
    { icon: 'add_to_home_screen', title: 'Chọn "Thêm vào màn hình chính"', desc: 'Tìm và chọn tuỳ chọn "Thêm vào màn hình chính" trong menu.' },
  ],
  ios: [
    { icon: 'open_in_browser', title: 'Mở bằng Safari', desc: 'Đảm bảo bạn đang dùng trình duyệt Safari trên iPhone / iPad.' },
    { icon: 'ios_share',       title: 'Bấm nút Chia sẻ', desc: 'Bấm biểu tượng chia sẻ 📤 ở thanh công cụ phía dưới màn hình.' },
    { icon: 'add_box',         title: 'Chọn "Thêm vào Home Screen"', desc: 'Cuộn xuống và chọn "Thêm vào Home Screen", sau đó bấm Thêm.' },
  ],
  desktop: [
    { icon: 'open_in_browser', title: 'Mở bằng Chrome', desc: 'Đảm bảo bạn đang dùng Google Chrome trên máy tính.' },
    { icon: 'install_desktop', title: 'Bấm biểu tượng cài đặt', desc: 'Bấm biểu tượng ⊕ hoặc 💻 ở cuối thanh địa chỉ Chrome.' },
    { icon: 'check_circle',    title: 'Xác nhận cài đặt', desc: 'Bấm "Cài đặt" trong hộp thoại xác nhận. App sẽ mở ngay.' },
  ],
}

const PLATFORM_LABELS: Record<Platform, string> = {
  android: 'Android Chrome',
  ios:     'iOS Safari',
  desktop: 'Desktop Chrome',
}

const PLATFORM_ICONS: Record<Platform, string> = {
  android: 'android',
  ios:     'phone_iphone',
  desktop: 'laptop',
}

export default function InstallPage() {
  const navigate = useNavigate()
  const { canInstall, isStandalone, triggerInstall } = usePwaInstall()
  const showToast = useUiStore((s) => s.showToast)
  const [tab, setTab] = useState<Platform>(detectPlatform())
  const [installing, setInstalling] = useState(false)

  const handleInstall = async () => {
    setInstalling(true)
    const ok = await triggerInstall()
    setInstalling(false)
    if (ok) {
      showToast('Cài đặt thành công!', 'success')
      navigate(-1)
    }
  }

  useEffect(() => {
    if (isStandalone) navigate('/', { replace: true })
  }, [isStandalone, navigate])

  if (isStandalone) return null

  const steps = STEPS[tab]

  return (
    <div className="min-h-svh flex flex-col bg-warm-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-border-gray px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-warm-white border border-border-gray"
        >
          <span className="material-symbols-outlined text-navy text-[20px]">arrow_back</span>
        </button>
        <div>
          <p className="text-navy font-bold text-[15px]">Cài đặt SaveGo</p>
          <p className="text-neutral-gray text-[11px]">Thêm vào màn hình chính</p>
        </div>
      </div>

      <div className="flex-1 px-4 py-5 flex flex-col gap-5">
        {/* App preview */}
        <div
          className="rounded-2xl p-5 flex items-center gap-4 text-white"
          style={{ background: 'linear-gradient(135deg, #006a36 0%, #004d27 100%)' }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.15)' }}
          >
            <span className="material-symbols-outlined text-white" style={{ fontSize: 34, fontVariationSettings: "'FILL' 1" }}>
              directions_car
            </span>
          </div>
          <div>
            <p className="font-bold text-lg leading-tight">Save Go</p>
            <p className="text-white/80 text-[13px] mt-0.5">Đặt xe sân bay</p>
            <p className="text-white/60 text-[11px] mt-1.5">Miễn phí · Không cần cài từ Store</p>
          </div>
        </div>

        {/* Benefits */}
        <div className="bg-white rounded-card shadow-card border border-border-gray p-4 flex flex-col gap-3">
          {[
            { icon: 'offline_bolt',    text: 'Hoạt động khi mất mạng (offline mode)' },
            { icon: 'notifications',   text: 'Nhận thông báo cuốc xe ngay lập tức' },
            { icon: 'speed',           text: 'Mở nhanh từ màn hình chính' },
            { icon: 'storage',         text: 'Không chiếm nhiều dung lượng bộ nhớ' },
          ].map(({ icon, text }) => (
            <div key={icon} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-logo bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-[16px]">{icon}</span>
              </div>
              <span className="text-navy text-sm">{text}</span>
            </div>
          ))}
        </div>

        {/* Platform tabs */}
        <div>
          <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-widest mb-3">
            Hướng dẫn theo thiết bị
          </p>
          <div className="flex gap-2 mb-4">
            {(Object.keys(STEPS) as Platform[]).map((p) => (
              <button
                key={p}
                onClick={() => setTab(p)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-card border transition-colors text-[11px] font-semibold ${
                  tab === p
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-neutral-gray border-border-gray'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{PLATFORM_ICONS[p]}</span>
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>

          {/* Steps */}
          <div className="flex flex-col gap-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 bg-white rounded-card shadow-card border border-border-gray p-4">
                <div className="w-8 h-8 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-primary text-[16px]">{step.icon}</span>
                    <p className="text-navy font-semibold text-sm">{step.title}</p>
                  </div>
                  <p className="text-neutral-gray text-[13px] leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* iOS note */}
        {tab === 'ios' && (
          <div className="bg-alert-orange/10 rounded-card p-4 border border-alert-orange/20">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-alert-orange text-[16px] mt-0.5">info</span>
              <p className="text-[13px] text-navy leading-relaxed">
                <b>iOS 16.4+</b> mới hỗ trợ nhận push notification. Nếu thiết bị chạy iOS cũ hơn, app vẫn cài được nhưng không nhận được thông báo.
              </p>
            </div>
          </div>
        )}

        {/* Install button — only show when native prompt available */}
        {canInstall && tab !== 'ios' && (
          <button
            onClick={handleInstall}
            disabled={installing}
            className="w-full h-12 rounded-pill bg-primary text-white font-semibold text-[15px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {installing ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <span className="material-symbols-outlined text-[18px]">install_mobile</span>
            )}
            {installing ? 'Đang cài đặt...' : 'Cài đặt ngay'}
          </button>
        )}
      </div>
    </div>
  )
}
