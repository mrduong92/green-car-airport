import api from './axios'

export const sendOtp = (phone: string) => api.post('/auth/otp/send', { phone })

export const verifyOtp = (phone: string, otp: string) =>
  api.post<{ token: string; user: App.User }>('/auth/otp/verify', { phone, otp })

export const getMe = () => api.get<App.User>('/auth/me')

export const logout = () => api.post('/auth/logout')
