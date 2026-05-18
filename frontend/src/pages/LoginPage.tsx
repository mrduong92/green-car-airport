import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { sendOtp, verifyOtp } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import Button from '@/components/common/Button'

const DEV_PHONE = '0901234567'
const DEV_OTP   = '000000'
const IS_DEV    = import.meta.env.DEV

const DEV_USERS: App.User[] = [
  { id: 1, name: 'Khách Hàng Demo', phone: DEV_PHONE, role: 'customer' },
  { id: 2, name: 'Tài Xế Demo',     phone: DEV_PHONE, role: 'driver'   },
  { id: 3, name: 'Admin Demo',      phone: DEV_PHONE, role: 'admin'    },
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
    mutationFn: (code: string) => verifyOtp(phone, code),
    onSuccess: ({ data }) => {
      setAuth(data.user, data.token)
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
    <div className="min-h-svh bg-warm-white flex flex-col max-w-[430px] mx-auto">
      {/* Green header */}
      <div className="bg-primary px-6 pt-14 pb-10 safe-top">
        <button onClick={() => step === 'otp' ? setStep('phone') : navigate(-1)}
          className="text-white mb-6 flex items-center gap-1">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="text-white text-2xl font-bold">Xác minh số điện thoại</h1>
        <p className="text-white/70 text-sm mt-1">
          {step === 'phone'
            ? 'Nhập số điện thoại để nhận mã OTP'
            : `Nhập mã 6 chữ số được gửi đến ${phone}`}
        </p>
      </div>

      <div className="flex-1 px-6 pt-8 flex flex-col gap-6">
        {step === 'phone' ? (
          <>
            {IS_DEV && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-center text-neutral-gray">🛠 Dev — đăng nhập nhanh</p>
                {DEV_USERS.map((u) => (
                  <button
                    key={u.role}
                    onClick={() => {
                      setAuth(u, 'dev-token')
                      if (u.role === 'customer') navigate('/customer/booking')
                      else if (u.role === 'driver') navigate('/driver/trips')
                      else navigate('/admin/dashboard')
                    }}
                    className="w-full py-3 rounded-card border-2 border-primary/30 bg-light-green text-navy text-sm font-medium flex items-center justify-between px-4"
                  >
                    <span>{u.name}</span>
                    <span className="text-xs text-neutral-gray capitalize">{u.role}</span>
                  </button>
                ))}
                <div className="flex items-center gap-2 my-1">
                  <div className="flex-1 h-px bg-border-gray" />
                  <span className="text-xs text-neutral-gray">hoặc đăng nhập OTP</span>
                  <div className="flex-1 h-px bg-border-gray" />
                </div>
              </div>
            )}
            <div className="flex items-center border border-border-gray rounded-input bg-white overflow-hidden">
              <span className="px-4 py-4 text-navy font-medium border-r border-border-gray bg-light-green text-sm">🇻🇳 +84</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9xx xxx xxx"
                className="flex-1 px-4 py-4 outline-none text-navy text-base"
              />
            </div>
            <Button
              fullWidth size="lg"
              loading={sendMutation.isPending || verifyMutation.isPending}
              disabled={phone.length < 9}
              onClick={() => sendMutation.mutate()}
            >
              {IS_DEV ? 'Đăng nhập (Dev)' : 'Gửi mã OTP'}
            </Button>
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
                  className="w-12 h-14 text-center text-xl font-bold border-2 border-border-gray rounded-input outline-none focus:border-primary text-navy"
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
                : <button onClick={() => { sendMutation.mutate(); setCountdown(45) }} className="text-primary">Gửi lại mã</button>
              }
            </p>
          </>
        )}
      </div>
    </div>
  )
}
