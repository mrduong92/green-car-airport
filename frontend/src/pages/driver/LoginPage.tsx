import { Link, useNavigate } from 'react-router-dom'
import { loginApi } from '@/api/auth'
import { useAuthLogin, type LoginStep } from '@/hooks/useAuthLogin'
import Button from '@/components/common/Button'
import AuthShell from '@/components/auth/AuthShell'
import PhoneInput from '@/components/auth/PhoneInput'
import PasswordInput from '@/components/auth/PasswordInput'
import OtpInputs from '@/components/auth/OtpInputs'
import { BRAND } from '@/brand'

// `import.meta.env.DEV` luôn = false trong bản build production (`vite build`),
// bất kể VITE_MOCK được set thế nào. Bắt buộc phải có vế này: chỉ dựa vào
// VITE_MOCK thì chỉ cần MỘT lần build nhầm với VITE_MOCK=true là nút đăng nhập
// nhanh lộ ra production — đã từng xảy ra thật (2026-08-07).
const DEV_MOCK = import.meta.env.DEV && import.meta.env.VITE_MOCK === 'true'
const DEV_PASS = '000000'
const DEV_ACCOUNT = { label: 'Tài Xế', phone: '0912345678' }

export default function LoginPage() {
  const navigate = useNavigate()
  const {
    step, setStep, phone, setPhone, password, setPassword,
    showPwd, setShowPwd, otp, countdown, otpRefs, pwdRef, pwdValid,
    checkMutation, loginMutation, resetMutation, sendMutation,
    doSendOtp, resendOtp, handleOtpChange, handleOtpKeyDown, handleBack, onAuthSuccess,
  } = useAuthLogin('driver')

  const heading: Record<LoginStep, { title: string; sub: string }> = {
    'phone':        { title: 'Đăng nhập Tài Xế', sub: 'Nhập số điện thoại tài xế đã đăng ký' },
    'password':     { title: 'Nhập mật khẩu', sub: `Mật khẩu 6 chữ số của tài khoản ${phone}` },
    'otp':          { title: 'Xác minh để đặt lại', sub: `Nhập mã OTP được gửi đến ${phone}` },
    'set-password': { title: 'Mật khẩu mới', sub: 'Mật khẩu gồm 6 chữ số' },
    'no-role':      { title: 'Chưa đăng ký tài xế', sub: `Số ${phone} chưa đăng ký làm tài xế ${BRAND.name}.` },
  }
  const { title, sub } = heading[step]

  return (
    <AuthShell title={title} sub={sub} onBack={handleBack} brandSub="Dành cho Tài Xế">
      {step === 'phone' && (
        <>
          {DEV_MOCK && (
            <div className="flex flex-col gap-2">
              <button
                disabled={loginMutation.isPending}
                onClick={() => {
                  setPhone(DEV_ACCOUNT.phone)
                  setPassword(DEV_PASS)
                  loginApi(DEV_ACCOUNT.phone, DEV_PASS, 'driver').then(onAuthSuccess)
                }}
                className="w-full py-3 rounded-card border border-border-soft bg-primary-tint text-navy text-sm font-medium flex items-center justify-between px-4 disabled:opacity-50"
              >
                <span>{DEV_ACCOUNT.label}</span>
                <span className="text-xs text-neutral-gray">{DEV_ACCOUNT.phone}</span>
              </button>
              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 h-px bg-border-gray" />
                <span className="text-xs text-neutral-gray">hoặc nhập thủ công</span>
                <div className="flex-1 h-px bg-border-gray" />
              </div>
            </div>
          )}

          <PhoneInput
            value={phone}
            onChange={setPhone}
            onEnter={() => phone.length >= 9 && checkMutation.mutate()}
          />

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
              Chưa có tài khoản tài xế?{' '}
              <Link to="/register/driver" state={{ phone }} className="text-primary font-semibold">Đăng ký tài xế</Link>
            </p>
          </div>
        </>
      )}

      {step === 'no-role' && (
        <div className="flex flex-col gap-3">
          <Button fullWidth size="lg" onClick={() => navigate('/register/driver', { state: { phone } })}>
            Đăng ký làm tài xế
          </Button>
          <button onClick={() => setStep('phone')} className="text-primary text-sm font-medium">
            Dùng số điện thoại khác
          </button>
        </div>
      )}

      {step === 'password' && (
        <>
          <PasswordInput
            label="Mật khẩu"
            value={password}
            onChange={setPassword}
            show={showPwd}
            onToggle={() => setShowPwd((v) => !v)}
            onEnter={() => pwdValid && loginMutation.mutate()}
            inputRef={pwdRef}
          />

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

      {step === 'otp' && (
        <OtpInputs
          otp={otp}
          otpRefs={otpRefs}
          onChange={handleOtpChange}
          onKeyDown={handleOtpKeyDown}
          countdown={countdown}
          onResend={resendOtp}
        />
      )}

      {step === 'set-password' && (
        <>
          <PasswordInput
            label="Mật khẩu mới"
            value={password}
            onChange={setPassword}
            show={showPwd}
            onToggle={() => setShowPwd((v) => !v)}
            onEnter={() => pwdValid && resetMutation.mutate()}
            inputRef={pwdRef}
            hint="Nhập đúng 6 chữ số"
          />

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
    </AuthShell>
  )
}
