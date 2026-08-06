import { useNavigate } from 'react-router-dom'
import Button from '@/components/common/Button'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import BrandGlyph from '@/components/common/BrandGlyph'
import { BRAND } from '@/brand'

export default function SplashPage() {
  const navigate = useNavigate()
  const { canInstall, isIos, triggerInstall } = usePwaInstall()

  const handleInstallClick = async () => {
    if (isIos) {
      navigate('/install')
    } else {
      const ok = await triggerInstall()
      if (!ok) navigate('/install')
    }
  }
  return (
    <div
      className="min-h-svh w-full flex flex-col items-center justify-center gap-7 px-8 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #006a36 0%, #004d27 100%)', color: '#fff', fontFamily: 'Inter, sans-serif' }}
    >
      {/* Logo mark */}
      <div className="relative">
        <div
          className="w-[110px] h-[110px] flex items-center justify-center"
          style={{
            borderRadius: 28,
            background: 'rgba(255,255,255,0.12)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
          }}
        >
          <BrandGlyph size={62} className="text-white" />
        </div>
        {/* Gold plane badge */}
        <div
          className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: '#C8A24A', boxShadow: '0 4px 12px rgba(200,162,74,0.5)' }}
        >
          <span className="material-symbols-outlined text-white" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>
            flight
          </span>
        </div>
      </div>

      {/* Text */}
      <div className="text-center">
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {BRAND.name}
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, opacity: 0.75, marginTop: 6, letterSpacing: '0.05em' }}>
          {BRAND.tagline}
        </div>
      </div>

      {/* CTA Buttons */}
      <div className="w-full flex flex-col gap-3">
        <Button fullWidth size="lg" onClick={() => navigate('/login')}>
          Đăng nhập
        </Button>
        <button
          onClick={() => navigate('/register')}
          className="w-full h-[52px] rounded-pill border border-white/40 text-white text-[16px] font-semibold"
          style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}
        >
          Đăng ký
        </button>
      </div>

      {/* Driver registration link — driver app là subdomain riêng */}
      <p className="text-center text-[13px]">
        <a
          href={`${import.meta.env.VITE_DRIVER_APP_URL ?? 'http://localhost:5174'}/register/driver`}
          className="text-white/70 underline underline-offset-2"
        >
          Đăng ký làm tài xế
        </a>
      </p>

      {/* Tagline */}
      <p className="text-white/60 text-[13px] text-center">
        Nhanh · Minh bạch · Tiện lợi
      </p>

      {/* Install banner */}
      {canInstall && (
        <button
          onClick={handleInstallClick}
          className="flex items-center gap-1.5 px-4 py-2 rounded-pill border border-white/30 text-white/90 text-sm font-medium"
          style={{ background: 'rgba(255,255,255,0.10)', backdropFilter: 'blur(8px)' }}
        >
          <span className="material-symbols-outlined text-[16px]">install_mobile</span>
          Cài đặt ứng dụng
        </button>
      )}

    </div>
  )
}
