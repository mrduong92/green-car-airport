import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { sendOtp, loginApi, resetPasswordApi, checkPhoneApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { registerPushSubscription } from '@/push'
import Button from '@/components/common/Button'
import ToastContainer from '@/components/common/Toast'

type Step = 'phone' | 'role-picker' | 'password' | 'otp' | 'set-password'

const DEV_MOCK = import.meta.env.VITE_MOCK === 'true' || false
const DEV_PASS = '000000'

const DEV_ACCOUNTS = [
  { label: 'Khách Hàng', phone: '0901234567', role: 'customer' as App.Role },
  { label: 'Tài Xế',     phone: '0912345678', role: 'driver'   as App.Role },
  { label: 'Admin',      phone: '0923456789', role: 'admin'    as App.Role },
]

export default function LoginPage() {
  const navigate  = useNavigate()
  const setAuth   = useAuthStore((s) => s.setAuth)
  const showToast = useUiStore((s) => s.showToast)

  const [step, setStep]         = useState<Step>('phone')
  const [phone, setPhone]       = useState('')
  const [role, setRole]         = useState<App.Role | undefined>(undefined)
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
    mutationFn: () => loginApi(phone, password, role),
    onSuccess: onAuthSuccess,
    onError: (err: { response?: { data?: { code?: string; message?: string } } }) => {
      const code = err.response?.data?.code
      const msg  = err.response?.data?.message
      if (code === 'no_password') {
        showToast('Tài khoản chưa có mật khẩu. Vui lòng đặt lại mật khẩu.', 'info')
        doSendOtp()
      } else if (code === 'blocked') {
        showToast(msg ?? 'Tài khoản đã bị khoá.', 'error')
      } else {
        showToast(msg ?? 'Mật khẩu không đúng.', 'error')
      }
    },
  })

  // ── Reset password (after OTP) ────────────────────────────────────────────
  const resetMutation = useMutation({
    mutationFn: () => resetPasswordApi(phone, otp.join(''), password, role),
    onSuccess: onAuthSuccess,
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(err.response?.data?.message ?? 'Có lỗi xảy ra.', 'error')
    },
  })

  // ── Send OTP ───────────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: (p: 'reset') => sendOtp(phone, p),
    onSuccess: () => setCountdown(45),
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(err.response?.data?.message ?? 'Gửi OTP thất bại. Vui lòng thử lại.', 'error')
    },
  })

  const checkMutation = useMutation({
    mutationFn: () => checkPhoneApi(phone),
    onSuccess: ({ data }) => {
      if (data.roles.length > 1) {
        setStep('role-picker')
      } else {
        setRole(data.roles[0])
        setStep('password')
      }
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(err.response?.data?.message ?? 'Có lỗi xảy ra.', 'error')
    },
  })

  const doSendOtp = () => {
    setOtp(['', '', '', '', '', ''])
    setPassword('')
    sendMutation.mutate('reset', {
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
    if (step === 'phone')             navigate(-1)
    else if (step === 'role-picker')  setStep('phone')
    else if (step === 'otp')          setStep('phone')
    else if (step === 'set-password') setStep('otp')
    else                              setStep('phone') // password
  }

  // ── Step headings ─────────────────────────────────────────────────────────
  const heading: Record<Step, { title: string; sub: string }> = {
    'phone':        { title: 'Đăng nhập', sub: 'Nhập số điện thoại đã đăng ký' },
    'role-picker':  { title: 'Chọn tài khoản', sub: `Số ${phone} có nhiều tài khoản. Bạn muốn đăng nhập với tư cách nào?` },
    'password':     { title: 'Nhập mật khẩu', sub: `Mật khẩu 6 chữ số của tài khoản ${phone}` },
    'otp':          { title: 'Xác minh để đặt lại', sub: `Nhập mã OTP được gửi đến ${phone}` },
    'set-password': { title: 'Mật khẩu mới', sub: 'Mật khẩu gồm 6 chữ số' },
  }

  const { title, sub } = heading[step]
  const pwdValid = /^\d{6}$/.test(password)

  return (
    <div className="min-h-svh bg-white flex flex-col w-full">
      <ToastContainer />
      {/* Top bar */}
      <div className="px-4 pt-14 pb-2 safe-top flex items-center">
        <button onClick={handleBack} className="w-10 h-10 flex items-center justify-center text-navy">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      </div>

      <div className="flex-1 px-6 pt-4 flex flex-col gap-6">
        {/* Brand + heading */}
        <div>
          <div className="flex items-center gap-3 mb-7">
            <div className="w-12 h-12 rounded-logo bg-primary-tint flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 26, fontVariationSettings: "'FILL' 1" }}>
                directions_car
              </span>
            </div>
            <div>
              <p className="text-primary font-bold text-[20px] leading-none tracking-tight">Save Go</p>
              <p className="text-neutral-gray text-[11px] tracking-widest uppercase mt-0.5">Airport Transfer</p>
            </div>
          </div>
          <h1 className="text-navy font-bold text-[28px] leading-tight mb-2">{title}</h1>
          <p className="text-neutral-gray text-sm">{sub}</p>
        </div>

        {/* ── step: phone ── */}
        {step === 'phone' && (
          <>
            {DEV_MOCK && (
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
                style={{ border: '1.5px solid #006a36', borderRadius: 8, boxShadow: '0 0 0 4px rgba(0,106,54,0.18)' }}
              >
                <span className="px-4 text-navy font-semibold text-sm border-r border-border-gray h-full flex items-center">🇻🇳 +84</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && phone.length >= 9 && checkMutation.mutate()}
                  placeholder="9xx xxx xxx"
                  className="flex-1 px-4 outline-none text-navy text-[17px] font-semibold tracking-wider bg-transparent"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                fullWidth size="lg"
                loading={checkMutation.isPending}
                disabled={phone.length < 9}
                onClick={() => checkMutation.mutate()}
              >
                Đăng nhập
              </Button>
              <p className="text-center text-sm text-neutral-gray">
                Chưa có tài khoản?{' '}
                <Link to="/register" className="text-primary font-semibold">Đăng ký</Link>
              </p>
            </div>
          </>
        )}

        {/* ── step: role-picker ── */}
        {step === 'role-picker' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => { setRole('customer'); setStep('password') }}
              className="w-full py-4 rounded-card border-[1.5px] border-border-gray bg-white text-navy text-sm font-medium flex items-center gap-3 px-4 hover:border-primary transition-colors"
            >
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
              <div className="text-left">
                <p className="font-semibold">Khách hàng</p>
                <p className="text-xs text-neutral-gray">Đặt xe, quản lý chuyến đi</p>
              </div>
            </button>
            <button
              onClick={() => { setRole('driver'); setStep('password') }}
              className="w-full py-4 rounded-card border-[1.5px] border-border-gray bg-white text-navy text-sm font-medium flex items-center gap-3 px-4 hover:border-primary transition-colors"
            >
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>directions_car</span>
              <div className="text-left">
                <p className="font-semibold">Tài xế</p>
                <p className="text-xs text-neutral-gray">Nhận cuốc, quản lý ví</p>
              </div>
            </button>
          </div>
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
                  className="w-full h-[52px] border-[1.5px] border-primary rounded-input px-4 pr-12 text-navy text-2xl tracking-[0.4em] outline-none focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] transition-shadow"
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
              onClick={() => doSendOtp()}
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
                  className="w-12 h-14 text-center text-xl font-bold border-[1.5px] border-border-gray rounded-input outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] text-navy transition-shadow"
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
                      sendMutation.mutate('reset', { onSuccess: () => setCountdown(45) })
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
                  onKeyDown={(e) => e.key === 'Enter' && pwdValid && resetMutation.mutate()}
                  placeholder="••••••"
                  className="w-full h-[52px] border-[1.5px] border-primary rounded-input px-4 pr-12 text-navy text-2xl tracking-[0.4em] outline-none focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] transition-shadow"
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
              loading={resetMutation.isPending}
              disabled={!pwdValid}
              onClick={() => resetMutation.mutate()}
            >
              Đặt lại mật khẩu
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
