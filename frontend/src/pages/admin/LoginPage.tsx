import { useAuthLogin, type LoginStep } from '@/hooks/useAuthLogin'
import Button from '@/components/common/Button'
import AuthShell from '@/components/auth/AuthShell'
import PhoneInput from '@/components/auth/PhoneInput'
import PasswordInput from '@/components/auth/PasswordInput'
import OtpInputs from '@/components/auth/OtpInputs'

export default function LoginPage() {
  const {
    step, setStep, phone, setPhone, password, setPassword,
    showPwd, setShowPwd, otp, countdown, otpRefs, pwdRef, pwdValid,
    checkMutation, loginMutation, resetMutation, sendMutation,
    doSendOtp, resendOtp, handleOtpChange, handleOtpKeyDown, handleBack,
  } = useAuthLogin('admin')

  const heading: Record<LoginStep, { title: string; sub: string }> = {
    'phone':        { title: 'Quản trị viên', sub: 'Nhập số điện thoại quản trị' },
    'password':     { title: 'Nhập mật khẩu', sub: `Mật khẩu 6 chữ số của tài khoản ${phone}` },
    'otp':          { title: 'Xác minh để đặt lại', sub: `Nhập mã OTP được gửi đến ${phone}` },
    'set-password': { title: 'Mật khẩu mới', sub: 'Mật khẩu gồm 6 chữ số' },
    'no-role':      { title: 'Không có quyền truy cập', sub: `Số ${phone} không phải tài khoản quản trị.` },
  }
  const { title, sub } = heading[step]

  return (
    <AuthShell title={title} sub={sub} onBack={handleBack} brandSub="Quản Trị">
      {step === 'phone' && (
        <>
          <PhoneInput
            value={phone}
            onChange={setPhone}
            onEnter={() => phone.length >= 9 && checkMutation.mutate()}
          />
          <Button
            fullWidth size="lg"
            loading={checkMutation.isPending}
            disabled={phone.length < 9}
            onClick={() => checkMutation.mutate()}
          >
            Đăng nhập
          </Button>
        </>
      )}

      {step === 'no-role' && (
        <button onClick={() => setStep('phone')} className="text-primary text-sm font-medium">
          Dùng số điện thoại khác
        </button>
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
            className="text-primary text-sm font-medium text-center disabled:opacity-50"
          >
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
