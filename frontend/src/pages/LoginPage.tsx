import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { sendOtp, verifyOtp } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { registerPushSubscription } from '@/push'
import Button from '@/components/common/Button'

const DEV_OTP  = '000000'
const DEV_PHONE = '0901234567'
const IS_DEV   = import.meta.env.DEV

const DEV_ACCOUNTS = [
  { label: 'Khách Hàng Demo', phone: '0901234567', role: 'customer' as App.Role },
  { label: 'Tài Xế Demo',     phone: '0912345678', role: 'driver'   as App.Role },
  { label: 'Admin Demo',      phone: '0923456789', role: 'admin'    as App.Role },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const showToast = useUiStore((s) => s.showToast)
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState(IS_DEV ? DEV_PHONE : '')
  const [otp, setOtp] = useState(IS_DEV ? DEV_OTP.split('') : ['', '', '', '', '', ''])
  const [countdown, setCountdown] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const verifyMutation = useMutation({
    mutationFn: (payload: string | { phone: string; otp: string }) =>
      typeof payload === 'string'
        ? verifyOtp(phone, payload)
        : verifyOtp(payload.phone, payload.otp),
    onSuccess: ({ data }) => {
      setAuth(data.user, data.token)
      registerPushSubscription()
      const role = data.user.role
      if (role === 'customer') navigate('/customer/booking')
      else if (role === 'driver') navigate('/driver/trips')
      else navigate('/admin/dashboard')
    },
    onError: () => showToast('Mã OTP không đúng', 'error'),
  })

  const sendMutation = useMutation({
    mutationFn: () => sendOtp(phone),
    onSuccess: () => {
      setCountdown(45)
      if (IS_DEV) {
        // Skip OTP screen in dev — auto-verify immediately
        verifyMutation.mutate(DEV_OTP)
      } else {
        setStep('otp')
      }
    },
    onError: () => showToast('Gửi OTP thất bại', 'error'),
  })

  const handleOtpChange = (idx: number, val: string) => {
    if (!/^\d?$/.test(val)) return
    const next = [...otp]
    next[idx] = val
    setOtp(next)
    if (val && idx < 5) inputRefs.current[idx + 1]?.focus()
    if (next.every((d) => d !== '')) verifyMutation.mutate(next.join(''))
  }

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) inputRefs.current[idx - 1]?.focus()
  }

  return (
    <div className="min-h-svh bg-white flex flex-col max-w-[430px] mx-auto">
      {/* Top bar with back */}
      <div className="px-4 pt-14 pb-2 safe-top flex items-center">
        <button
          onClick={() => step === 'otp' ? setStep('phone') : navigate(-1)}
          className="w-10 h-10 flex items-center justify-center text-navy"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      </div>

      <div className="flex-1 px-6 pt-4 flex flex-col gap-6">
        {/* Brand icon */}
        <div>
          <div className="w-16 h-16 rounded-logo bg-primary-tint flex items-center justify-center mb-7">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 32, fontVariationSettings: "'FILL' 1" }}>
              directions_car
            </span>
          </div>
          <h1 className="text-navy font-bold text-[28px] leading-tight mb-2">Chào mừng trở lại</h1>
          <p className="text-neutral-gray text-sm">
            {step === 'phone'
              ? 'Đăng nhập bằng số điện thoại để bắt đầu đặt xe sân bay'
              : `Nhập mã 6 chữ số được gửi đến ${phone}`}
          </p>
        </div>

        {step === 'phone' ? (
          <>
            {IS_DEV && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-center text-neutral-gray">🛠 Dev — đăng nhập nhanh</p>
                {DEV_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.role}
                    disabled={verifyMutation.isPending}
                    onClick={() => verifyMutation.mutate({ phone: acc.phone, otp: DEV_OTP })}
                    className="w-full py-3 rounded-card border border-border-soft bg-primary-tint text-navy text-sm font-medium flex items-center justify-between px-4 disabled:opacity-50"
                  >
                    <span>{acc.label}</span>
                    <span className="text-xs text-neutral-gray">{acc.phone}</span>
                  </button>
                ))}
                <div className="flex items-center gap-2 my-1">
                  <div className="flex-1 h-px bg-border-gray" />
                  <span className="text-xs text-neutral-gray">hoặc đăng nhập OTP</span>
                  <div className="flex-1 h-px bg-border-gray" />
                </div>
              </div>
            )}
            <div>
              <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">Số điện thoại</p>
              <div
                className="flex items-center bg-white overflow-hidden h-[52px]"
                style={{ border: '1.5px solid #1E3A8A', borderRadius: 8, boxShadow: '0 0 0 4px rgba(30,58,138,0.18)' }}
              >
                <span className="px-4 text-navy font-semibold text-sm border-r border-border-gray h-full flex items-center">🇻🇳 +84</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9xx xxx xxx"
                  className="flex-1 px-4 outline-none text-navy text-[17px] font-semibold tracking-wider bg-transparent"
                />
              </div>
            </div>
            <Button
              fullWidth size="lg"
              loading={sendMutation.isPending || verifyMutation.isPending}
              disabled={phone.length < 9}
              onClick={() => sendMutation.mutate()}
            >
              {IS_DEV ? 'Đăng nhập (Dev)' : 'Gửi mã OTP'}
            </Button>
            {/* Info hint */}
            <div className="flex items-start gap-3 p-4 bg-primary-tint rounded-card">
              <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">info</span>
              <p className="text-[12px] text-primary leading-relaxed">
                Lần đầu sử dụng? Tài khoản sẽ được tạo tự động sau khi xác thực OTP.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-2 justify-center">
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el }}
                  type="tel"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className="w-12 h-14 text-center text-xl font-bold border-[1.5px] border-border-gray rounded-input outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(30,58,138,0.18)] text-navy transition-shadow"
                />
              ))}
            </div>
            <Button fullWidth size="lg" loading={verifyMutation.isPending}
              onClick={() => verifyMutation.mutate(otp.join(''))}>
              Xác minh
            </Button>
            <p className="text-center text-caption text-neutral-gray">
              {countdown > 0
                ? `Gửi lại mã sau ${countdown}s`
                : <button onClick={() => { sendMutation.mutate(); setCountdown(45) }} className="text-primary font-medium">Gửi lại mã</button>
              }
            </p>
          </>
        )}
      </div>
    </div>
  )
}
