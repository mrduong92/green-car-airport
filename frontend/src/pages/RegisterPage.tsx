import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { sendOtp, registerApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { registerPushSubscription } from '@/push'
import Button from '@/components/common/Button'

type RegStep = 1 | 2 | 3 | 4

export default function RegisterPage() {
  const navigate  = useNavigate()
  const setAuth   = useAuthStore((s) => s.setAuth)
  const showToast = useUiStore((s) => s.showToast)

  const [step, setStep]             = useState<RegStep>(1)
  const [phone, setPhone]           = useState('')
  const [referralCode, setReferral] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref) localStorage.setItem('referral_code', ref)
    return ref ?? localStorage.getItem('referral_code') ?? ''
  })
  const [otp, setOtp]               = useState(['', '', '', '', '', ''])
  const [countdown, setCountdown]   = useState(0)
  const [name, setName]             = useState('')
  const [password, setPassword]     = useState('')
  const [showPwd, setShowPwd]       = useState(false)
  const [agreedPrivacy, setPrivacy] = useState(false)
  const [agreedTerms, setTerms]     = useState(false)

  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    if (step === 2) t = setTimeout(() => otpRefs.current[0]?.focus(), 100)
    if (step === 3) t = setTimeout(() => nameRef.current?.focus(), 100)
    return () => { if (t !== undefined) clearTimeout(t) }
  }, [step])

  const onAuthSuccess = ({ data }: { data: { user: App.User; token: string } }) => {
    setAuth(data.user, data.token)
    registerPushSubscription()
    localStorage.removeItem('referral_code')
    navigate('/customer/booking')
  }

  const sendMutation = useMutation({
    mutationFn: () => sendOtp(phone, 'register'),
    onSuccess: () => {
      setCountdown(45)
      setStep(2)
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(err.response?.data?.message ?? 'Gửi OTP thất bại. Vui lòng thử lại.', 'error')
    },
  })

  const registerMutation = useMutation({
    mutationFn: () =>
      registerApi(phone, otp.join(''), password, name, referralCode || undefined),
    onSuccess: onAuthSuccess,
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(err.response?.data?.message ?? 'Đăng ký thất bại. Vui lòng thử lại.', 'error')
    },
  })

  const handleOtpChange = (idx: number, val: string) => {
    if (!/^\d?$/.test(val)) return
    const next = [...otp]
    next[idx] = val
    setOtp(next)
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus()
  }

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus()
  }

  const handleBack = () => {
    if (step === 1) navigate('/')
    else {
      if (step === 2) setOtp(['', '', '', '', '', ''])
      setStep((s) => (s - 1) as RegStep)
    }
  }

  const pwdValid    = /^\d{6}$/.test(password)
  const step3Valid  = name.trim().length > 0 && pwdValid
  const step4Valid  = agreedPrivacy && agreedTerms

  return (
    <div className="min-h-svh bg-white flex flex-col max-w-[430px] mx-auto">
      {/* Top bar */}
      <div className="px-4 pt-14 pb-2 safe-top flex items-center">
        <button onClick={handleBack} className="w-10 h-10 flex items-center justify-center text-navy">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      </div>

      <div className="flex-1 px-6 pt-4 flex flex-col gap-6">
        {/* Brand */}
        <div>
          <div className="w-16 h-16 rounded-logo bg-primary-tint flex items-center justify-center mb-7">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontSize: 32, fontVariationSettings: "'FILL' 1" }}
            >
              directions_car
            </span>
          </div>
          <h1 className="text-navy font-bold text-[28px] leading-tight mb-2">Tạo tài khoản</h1>
          <p className="text-neutral-gray text-sm">Đăng ký để bắt đầu hành trình</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center">
          {([1, 2, 3, 4] as RegStep[]).map((n, i) => (
            <div key={n} className={`flex items-center ${i < 3 ? 'flex-1' : ''}`}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                  step > n
                    ? 'bg-primary text-white'
                    : step === n
                    ? 'bg-navy text-white'
                    : 'bg-border-gray text-neutral-gray'
                }`}
              >
                {step > n ? (
                  <span className="material-symbols-outlined text-[16px]">check</span>
                ) : (
                  n
                )}
              </div>
              {i < 3 && (
                <div className={`flex-1 h-px mx-1 ${step > n ? 'bg-primary' : 'bg-border-gray'}`} />
              )}
            </div>
          ))}
        </div>

        {/* ── Bước 1: SĐT + Mã giới thiệu ── */}
        {step === 1 && (
          <>
            <div className="flex gap-2 items-start p-3 rounded-card border border-amber-300 bg-amber-50">
              <span
                className="material-symbols-outlined text-alert-orange text-[18px] mt-0.5 shrink-0"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                warning
              </span>
              <p className="text-sm text-amber-800 leading-snug">
                Vui lòng sử dụng số điện thoại đã đăng ký Zalo để nhận mã OTP
              </p>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">
                Số điện thoại *
              </p>
              <div
                className="flex items-center bg-white overflow-hidden h-[52px]"
                style={{ border: '1.5px solid #006a36', borderRadius: 8, boxShadow: '0 0 0 4px rgba(0,106,54,0.18)' }}
              >
                <span className="px-4 text-navy font-semibold text-sm border-r border-border-gray h-full flex items-center">
                  🇻🇳 +84
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="9xx xxx xxx"
                  className="flex-1 px-4 outline-none text-navy text-[17px] font-semibold tracking-wider bg-transparent"
                />
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">
                Mã giới thiệu
              </p>
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferral(e.target.value.toUpperCase())}
                placeholder="Nhập mã nếu có"
                className="w-full h-[52px] border-[1.5px] border-border-gray rounded-input px-4 text-navy outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] transition-shadow uppercase tracking-wider"
              />
            </div>

            <Button
              fullWidth
              size="lg"
              loading={sendMutation.isPending}
              disabled={phone.length < 9}
              onClick={() => sendMutation.mutate()}
            >
              Tiếp theo
            </Button>

            <p className="text-center text-sm text-neutral-gray">
              Đã có tài khoản?{' '}
              <Link to="/login" className="text-primary font-semibold">
                Đăng nhập
              </Link>
            </p>
          </>
        )}

        {/* ── Bước 2: OTP ── */}
        {step === 2 && (
          <>
            <p className="text-neutral-gray text-sm -mt-2">
              Nhập mã OTP đã gửi đến{' '}
              <span className="font-semibold text-navy">{phone}</span>
            </p>

            <div className="flex gap-2 justify-center">
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el }}
                  type="tel"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className="w-12 h-14 text-center text-xl font-bold border-[1.5px] border-border-gray rounded-input outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] text-navy transition-shadow"
                />
              ))}
            </div>

            <Button
              fullWidth
              size="lg"
              disabled={otp.some((d) => d === '')}
              onClick={() => setStep(3)}
            >
              Xác nhận OTP
            </Button>

            <p className="text-center text-sm text-neutral-gray">
              {countdown > 0 ? (
                `Gửi lại mã sau ${countdown}s`
              ) : (
                <button
                  onClick={() => {
                    setOtp(['', '', '', '', '', ''])
                    sendMutation.mutate()
                  }}
                  className="text-primary font-medium"
                >
                  Gửi lại mã OTP
                </button>
              )}
            </p>
          </>
        )}

        {/* ── Bước 3: Tên + Mật khẩu ── */}
        {step === 3 && (
          <>
            <div>
              <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">
                Họ và tên *
              </p>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="Nguyễn Văn A"
                className="w-full h-[52px] border-[1.5px] border-border-gray rounded-input px-4 text-navy outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] transition-shadow"
              />
            </div>

            <div>
              <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">
                Mật khẩu *
              </p>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  className="w-full h-[52px] border-[1.5px] border-border-gray rounded-input px-4 pr-12 text-navy text-2xl tracking-[0.4em] outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] transition-shadow"
                  style={{ fontFamily: 'monospace' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-gray"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPwd ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              <p className="text-[11px] text-neutral-gray mt-1.5">Nhập đúng 6 chữ số</p>
            </div>

            <Button
              fullWidth
              size="lg"
              disabled={!step3Valid}
              onClick={() => setStep(4)}
            >
              Tiếp theo
            </Button>
          </>
        )}

        {/* ── Bước 4: Điều khoản ── */}
        {step === 4 && (
          <>
            <h2 className="text-navy font-semibold text-[17px] -mt-2">
              Xem lại tài liệu pháp lý
            </h2>

            <div className="flex flex-col gap-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedPrivacy}
                  onChange={(e) => setPrivacy(e.target.checked)}
                  className="w-5 h-5 mt-0.5 accent-primary shrink-0"
                />
                <span className="text-sm text-navy leading-snug">
                  Tôi đồng ý với{' '}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-semibold underline"
                  >
                    Chính sách bảo mật
                  </a>
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setTerms(e.target.checked)}
                  className="w-5 h-5 mt-0.5 accent-primary shrink-0"
                />
                <span className="text-sm text-navy leading-snug">
                  Tôi đồng ý với{' '}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-semibold underline"
                  >
                    Điều khoản sử dụng
                  </a>
                </span>
              </label>
            </div>

            <Button
              fullWidth
              size="lg"
              loading={registerMutation.isPending}
              disabled={!step4Valid}
              onClick={() => registerMutation.mutate()}
            >
              Tạo tài khoản
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
