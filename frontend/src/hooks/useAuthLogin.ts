import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { sendOtp, loginApi, resetPasswordApi, checkPhoneApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { registerPushSubscription } from '@/push'

export type LoginStep = 'phone' | 'password' | 'otp' | 'set-password' | 'no-role'

type ApiError = { response?: { status?: number; data?: { code?: string; message?: string } } }

export function useAuthLogin(role: App.Role) {
  const navigate  = useNavigate()
  const setAuth   = useAuthStore((s) => s.setAuth)
  const showToast = useUiStore((s) => s.showToast)

  const [step, setStep]           = useState<LoginStep>('phone')
  const [phone, setPhone]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPwd, setShowPwd]     = useState(false)
  const [otp, setOtp]             = useState(['', '', '', '', '', ''])
  const [countdown, setCountdown] = useState(0)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const pwdRef  = useRef<HTMLInputElement>(null)
  const otpRef  = useRef(otp)

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  useEffect(() => {
    if (step === 'password' || step === 'set-password') {
      setTimeout(() => pwdRef.current?.focus(), 100)
    }
    if (step === 'otp') {
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    }
  }, [step])

  useEffect(() => {
    otpRef.current = otp
  }, [otp])

  const onAuthSuccess = ({ data }: { data: { user: App.User; token: string } }) => {
    setAuth(data.user, data.token)
    registerPushSubscription()
    const { role: userRole, needs_onboarding } = data.user
    if (userRole === 'customer') navigate('/customer/booking')
    else if (userRole === 'driver') navigate(needs_onboarding ? '/driver/profile' : '/driver/trips')
    else navigate('/dashboard')
  }

  const sendMutation = useMutation({
    mutationFn: () => sendOtp(phone, 'reset'),
    onSuccess: () => setCountdown(45),
    onError: (err: ApiError) => {
      showToast(err.response?.data?.message ?? 'Gửi OTP thất bại. Vui lòng thử lại.', 'error')
    },
  })

  const doSendOtp = () => {
    setOtp(['', '', '', '', '', ''])
    setPassword('')
    sendMutation.mutate(undefined, { onSuccess: () => setStep('otp') })
  }

  const resendOtp = () => {
    setOtp(['', '', '', '', '', ''])
    sendMutation.mutate()
  }

  const loginMutation = useMutation({
    mutationFn: () => loginApi(phone, password, role),
    onSuccess: onAuthSuccess,
    onError: (err: ApiError) => {
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

  const resetMutation = useMutation({
    mutationFn: () => resetPasswordApi(phone, otp.join(''), password, role),
    onSuccess: onAuthSuccess,
    onError: (err: ApiError) => {
      showToast(err.response?.data?.message ?? 'Có lỗi xảy ra.', 'error')
    },
  })

  const checkMutation = useMutation({
    mutationFn: () => checkPhoneApi(phone),
    onSuccess: ({ data }) => {
      if (data.roles.includes(role)) setStep('password')
      else setStep('no-role') // số tồn tại nhưng không có role của app này
    },
    onError: (err: ApiError) => {
      if (err.response?.status === 422) setStep('no-role') // số chưa đăng ký bất kỳ role nào
      else showToast(err.response?.data?.message ?? 'Có lỗi xảy ra.', 'error')
    },
  })

  const handleOtpChange = (idx: number, val: string) => {
    if (!/^\d?$/.test(val)) return
    const next = [...otpRef.current]
    next[idx] = val
    otpRef.current = next
    setOtp(next)
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus()
    if (next.every((d) => d !== '')) setStep('set-password')
  }

  const handleOtpKeyDown = (idx: number, e: KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus()
  }

  const handleBack = () => {
    if (step === 'phone')             navigate(-1)
    else if (step === 'set-password') setStep('otp')
    else                              setStep('phone') // password | otp | no-role
  }

  const pwdValid = /^\d{6}$/.test(password)

  return {
    step, setStep, phone, setPhone, password, setPassword,
    showPwd, setShowPwd, otp, countdown, otpRefs, pwdRef, pwdValid,
    checkMutation, loginMutation, resetMutation, sendMutation,
    doSendOtp, resendOtp, handleOtpChange, handleOtpKeyDown, handleBack, onAuthSuccess,
  }
}
