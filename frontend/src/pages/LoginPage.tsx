import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { sendOtp, loginApi, registerApi, resetPasswordApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { registerPushSubscription } from '@/push'
import Button from '@/components/common/Button'

type Step = 'phone' | 'password' | 'otp' | 'set-password'
type Purpose = 'register' | 'reset'

const IS_DEV = import.meta.env.DEV
const DEV_PASS = '000000'
const DEV_MOCK_KEY = 'dev_mock_login'

const DEV_ACCOUNTS = [
  { label: 'Khách Hàng', phone: '0901234567', role: 'customer' as App.Role },
  { label: 'Tài Xế',     phone: '0912345678', role: 'driver'   as App.Role },
  { label: 'Admin',      phone: '0923456789', role: 'admin'    as App.Role },
]

export default function LoginPage() {
  const navigate  = useNavigate()
  const setAuth   = useAuthStore((s) => s.setAuth)
  const showToast = useUiStore((s) => s.showToast)

  const [devMock, setDevMock]   = useState(() =>
    IS_DEV ? (localStorage.getItem(DEV_MOCK_KEY) ?? 'true') === 'true' : false,
  )
  const toggleDevMock = () => setDevMock((v) => {
    const next = !v
    localStorage.setItem(DEV_MOCK_KEY, String(next))
    return next
  })

  const [step, setStep]         = useState<Step>('phone')
  const [purpose, setPurpose]   = useState<Purpose>('register')
  const [phone, setPhone]       = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [otp, setOtp]           = useState(['', '', '', '', '', ''])
  const [countdown, setCountdown] = useState(0)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const pwdRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  // Focus password input when step changes
  useEffect(() => {
    if (step === 'password' || step === 'set-password') {
      setTimeout(() => pwdRef.current?.focus(), 100)
    }
    if (step === 'otp') {
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    }
  }, [step])

  const onAuthSuccess = ({ data }: { data: { user: App.User; token: string } }) => {
    setAuth(data.user, data.token)
    registerPushSubscription()
    const { role, needs_onboarding } = data.user
    if (role === 'customer') navigate('/customer/booking')
    else if (role === 'driver') navigate(needs_onboarding ? '/driver/profile' : '/driver/trips')
    else navigate('/admin/dashboard')
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  const loginMutation = useMutation({
    mutationFn: () => loginApi(phone, password),
    onSuccess: onAuthSuccess,
    onError: (err: { response?: { data?: { code?: string; message?: string } } }) => {
      const code = err.response?.data?.code
      const msg  = err.response?.data?.message
      if (code === 'no_password') {
        showToast('Tài khoản chưa có mật khẩu. Vui lòng đặt lại mật khẩu.', 'info')
        doSendOtp('reset')
      } else if (code === 'blocked') {
        showToast(msg ?? 'Tài khoản đã bị khoá.', 'error')
      } else {
        showToast(msg ?? 'Mật khẩu không đúng.', 'error')
      }
    },
  })

  // ── Register / Reset (after OTP) ──────────────────────────────────────────
  const finishMutation = useMutation({
    mutationFn: () =>
      purpose === 'register'
        ? registerApi(phone, otp.join(''), password)
        : resetPasswordApi(phone, otp.join(''), password),
    onSuccess: onAuthSuccess,
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(err.response?.data?.message ?? 'Có lỗi xảy ra.', 'error')
    },
  })

  // ── Send OTP ───────────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: () => sendOtp(phone),
    onSuccess: () => setCountdown(45),
    onError: () => showToast('Gửi OTP thất bại. Kiểm tra lại số điện thoại.', 'error'),
  })

  const doSendOtp = (p: Purpose) => {
    setPurpose(p)
    setOtp(['', '', '', '', '', ''])
    setPassword('')
    sendMutation.mutate(undefined, {
      onSuccess: () => setStep('otp'),
    })
  }

  // ── OTP input handlers ────────────────────────────────────────────────────
  const handleOtpChange = (idx: number, val: string) => {
    if (!/^\d?$/.test(val)) return
    const next = [...otp]
    next[idx] = val
    setOtp(next)
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus()
    if (next.every((d) => d !== '')) setStep('set-password')
  }

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus()
  }

  // ── Back navigation ───────────────────────────────────────────────────────
  const handleBack = () => {
    if (step === 'phone')        navigate(-1)
    else if (step === 'otp')     setStep('phone')
    else if (step === 'set-password') setStep('otp')
    else                         setStep('phone') // password
  }

  // ── Step headings ─────────────────────────────────────────────────────────
  const heading: Record<Step, { title: string; sub: string }> = {
    'phone':        { title: 'Chào mừng', sub: 'Nhập số điện thoại để tiếp tục' },
    'password':     { title: 'Nhập mật khẩu', sub: `Mật khẩu 6 chữ số của tài khoản ${phone}` },
    'otp':          { title: purpose === 'register' ? 'Xác minh số điện thoại' : 'Xác minh để đặt lại', sub: `Nhập mã OTP được gửi đến ${phone}` },
    'set-password': { title: purpose === 'register' ? 'Đặt mật khẩu' : 'Mật khẩu mới', sub: 'Mật khẩu gồm 6 chữ số' },
  }

  const { title, sub } = heading[step]
  const pwdValid = /^\d{6}$/.test(password)

  return (
    <div className="min-h-svh bg-white flex flex-col max-w-[430px] mx-auto">
      {/* Top bar */}
      <div className="px-4 pt-14 pb-2 safe-top flex items-center justify-between">
        <button onClick={handleBack} className="w-10 h-10 flex items-center justify-center text-navy">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        {IS_DEV && (
          <button
            onClick={toggleDevMock}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-[11px] font-semibold border transition-colors ${
              devMock
                ? 'bg-amber-100 text-amber-700 border-amber-300'
                : 'bg-warm-white text-neutral-gray border-border-gray'
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">
              {devMock ? 'flash_on' : 'flash_off'}
            </span>
            {devMock ? 'Mock ON' : 'Mock OFF'}
          </button>
        )}
      </div>

      <div className="flex-1 px-6 pt-4 flex flex-col gap-6">
        {/* Brand + heading */}
        <div>
          <div className="w-16 h-16 rounded-logo bg-primary-tint flex items-center justify-center mb-7">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 32, fontVariationSettings: "'FILL' 1" }}>
              directions_car
            </span>
          </div>
          <h1 className="text-navy font-bold text-[28px] leading-tight mb-2">{title}</h1>
          <p className="text-neutral-gray text-sm">{sub}</p>
        </div>

        {/* ── step: phone ── */}
        {step === 'phone' && (
          <>
            {IS_DEV && devMock && (
              <div className="flex flex-col gap-2">
                {DEV_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.role}
                    disabled={loginMutation.isPending}
                    onClick={() => {
                      setPhone(acc.phone)
                      setPassword(DEV_PASS)
                      loginApi(acc.phone, DEV_PASS).then(onAuthSuccess)
                    }}
                    className="w-full py-3 rounded-card border border-border-soft bg-primary-tint text-navy text-sm font-medium flex items-center justify-between px-4 disabled:opacity-50"
                  >
                    <span>{acc.label}</span>
                    <span className="text-xs text-neutral-gray">{acc.phone}</span>
                  </button>
                ))}
                <div className="flex items-center gap-2 my-1">
                  <div className="flex-1 h-px bg-border-gray" />
                  <span className="text-xs text-neutral-gray">hoặc nhập thủ công</span>
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
                  onKeyDown={(e) => e.key === 'Enter' && phone.length >= 9 && setStep('password')}
                  placeholder="9xx xxx xxx"
                  className="flex-1 px-4 outline-none text-navy text-[17px] font-semibold tracking-wider bg-transparent"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                fullWidth size="lg"
                disabled={phone.length < 9}
                onClick={() => setStep('password')}
              >
                Đăng nhập
              </Button>
              <button
                disabled={phone.length < 9 || sendMutation.isPending}
                onClick={() => doSendOtp('register')}
                className="w-full h-[52px] rounded-pill border border-border-gray text-navy text-[15px] font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {sendMutation.isPending ? (
                  <span className="w-4 h-4 border-2 border-navy/30 border-t-navy rounded-full animate-spin" />
                ) : null}
                Đăng ký tài khoản mới
              </button>
            </div>

            {IS_DEV && !devMock && (
              <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col gap-1.5">
                <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide">Tài khoản demo (mật khẩu: 000000)</p>
                {DEV_ACCOUNTS.map((acc) => (
                  <div key={acc.role} className="flex justify-between text-[12px]">
                    <span className="text-amber-800 font-medium">{acc.label}</span>
                    <span className="text-amber-700 font-mono">{acc.phone}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── step: password ── */}
        {step === 'password' && (
          <>
            <div>
              <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">Mật khẩu</p>
              <div className="relative">
                <input
                  ref={pwdRef}
                  type={showPwd ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && pwdValid && loginMutation.mutate()}
                  placeholder="••••••"
                  className="w-full h-[52px] border-[1.5px] border-primary rounded-input px-4 pr-12 text-navy text-2xl tracking-[0.4em] outline-none focus:shadow-[0_0_0_4px_rgba(30,58,138,0.18)] transition-shadow"
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
            </div>

            <Button
              fullWidth size="lg"
              loading={loginMutation.isPending}
              disabled={!pwdValid}
              onClick={() => loginMutation.mutate()}
            >
              Đăng nhập
            </Button>

            <button
              disabled={sendMutation.isPending}
              onClick={() => doSendOtp('reset')}
              className="text-primary text-sm font-medium text-center disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {sendMutation.isPending
                ? <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                : null}
              Quên mật khẩu?
            </button>
          </>
        )}

        {/* ── step: otp ── */}
        {step === 'otp' && (
          <>
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
                  className="w-12 h-14 text-center text-xl font-bold border-[1.5px] border-border-gray rounded-input outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(30,58,138,0.18)] text-navy transition-shadow"
                />
              ))}
            </div>

            <p className="text-center text-sm text-neutral-gray">
              {countdown > 0
                ? `Gửi lại mã sau ${countdown}s`
                : (
                  <button
                    onClick={() => {
                      setOtp(['', '', '', '', '', ''])
                      sendMutation.mutate(undefined, { onSuccess: () => setCountdown(45) })
                    }}
                    className="text-primary font-medium"
                  >
                    Gửi lại mã OTP
                  </button>
                )
              }
            </p>
          </>
        )}

        {/* ── step: set-password ── */}
        {step === 'set-password' && (
          <>
            <div>
              <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">Mật khẩu mới</p>
              <div className="relative">
                <input
                  ref={pwdRef}
                  type={showPwd ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && pwdValid && finishMutation.mutate()}
                  placeholder="••••••"
                  className="w-full h-[52px] border-[1.5px] border-primary rounded-input px-4 pr-12 text-navy text-2xl tracking-[0.4em] outline-none focus:shadow-[0_0_0_4px_rgba(30,58,138,0.18)] transition-shadow"
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
              fullWidth size="lg"
              loading={finishMutation.isPending}
              disabled={!pwdValid}
              onClick={() => finishMutation.mutate()}
            >
              {purpose === 'register' ? 'Hoàn tất đăng ký' : 'Đặt lại mật khẩu'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
