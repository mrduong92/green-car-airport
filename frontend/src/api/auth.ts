import api from './axios'

export const sendOtp = (phone: string) => api.post('/auth/otp/send', { phone })

export const loginApi = (phone: string, password: string) =>
  api.post<{ token: string; user: App.User }>('/auth/login', { phone, password })

export const registerApi = (phone: string, otp: string, password: string, referralCode?: string) =>
  api.post<{ token: string; user: App.User }>('/auth/register', {
    phone,
    otp,
    password,
    ...(referralCode ? { referral_code: referralCode } : {}),
  })

export const resetPasswordApi = (phone: string, otp: string, password: string) =>
  api.post<{ token: string; user: App.User }>('/auth/reset-password', { phone, otp, password })

export const getMe = () => api.get<App.User>('/auth/me')

export const logout = () => api.post('/auth/logout')
