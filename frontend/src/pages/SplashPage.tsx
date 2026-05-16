import { useNavigate } from 'react-router-dom'
import Button from '@/components/common/Button'

export default function SplashPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-svh bg-warm-white flex flex-col items-center justify-between px-6 py-12 max-w-[430px] mx-auto">
      {/* Logo + Illustration */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="w-24 h-24 rounded-card bg-light-green flex items-center justify-center mb-6 shadow-card">
          <span className="material-symbols-outlined text-5xl text-primary">directions_car</span>
        </div>
        <h1 className="text-3xl font-bold text-navy text-center mb-2">Green Car Airport</h1>
        <p className="text-neutral-gray text-center text-base leading-relaxed">
          Đặt xe sân bay<br />
          <span className="text-primary font-medium">Nhanh · Minh bạch · Tiện lợi</span>
        </p>

        {/* Illustration */}
        <div className="mt-10 w-full max-w-xs bg-light-green rounded-card p-6 flex items-center justify-center">
          <div className="flex items-end gap-3">
            <span className="material-symbols-outlined text-7xl text-primary">flight</span>
            <span className="material-symbols-outlined text-5xl text-primary-container mb-1">directions_car</span>
          </div>
        </div>
      </div>

      {/* CTA Buttons */}
      <div className="w-full flex flex-col gap-3 mt-10">
        <Button fullWidth size="lg" onClick={() => navigate('/login')}>
          Đăng nhập
        </Button>
        <Button fullWidth size="lg" variant="outline" onClick={() => navigate('/login')}>
          Đăng ký
        </Button>
        <p className="text-center text-caption text-neutral-gray mt-2">
          Dành cho khách hàng · Dành cho tài xế
        </p>
      </div>
    </div>
  )
}
