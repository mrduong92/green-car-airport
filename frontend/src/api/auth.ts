import api from './axios'

export const sendOtp = (phone: string, purpose?: 'register' | 'driver_register' | 'reset') =>
  api.post('/auth/otp/send', { phone, ...(purpose ? { purpose } : {}) })

export const checkPhoneApi = (phone: string) =>
  api.post<{ exists: boolean; roles: App.Role[] }>('/auth/check-phone', { phone })

export const loginApi = (phone: string, password: string, role?: App.Role) =>
  api.post<{ token: string; user: App.User }>('/auth/login', { phone, password, ...(role ? { role } : {}) })

export const registerApi = (
  phone: string,
  otp: string,
  password: string,
  name: string,
  referralCode?: string,
) =>
  api.post<{ token: string; user: App.User }>('/auth/register', {
    phone,
    otp,
    password,
    ...(name ? { name } : {}),
    ...(referralCode ? { referral_code: referralCode } : {}),
  })

export const driverRegisterApi = (data: {
  phone: string
  otp: string
  password: string
  name: string
  vehicle_make: string
  vehicle_model: string
  vehicle_plate: string
  vehicle_year: number
  vehicle_color: string
  vehicle_type: 'sedan_4' | 'suv_5' | 'mpv_7'
  cccd_number: string
  gplx_number: string
  vehicle_reg_number: string
  vehicle_inspection_number: string
  vehicle_inspection_expiry: string
  insurance_number: string
  insurance_expiry: string
  referral_code?: string
}) =>
  api.post<{ token: string; user: App.User }>('/auth/register/driver', data)

export const resetPasswordApi = (phone: string, otp: string, password: string, role?: App.Role) =>
  api.post<{ token: string; user: App.User }>('/auth/reset-password', { phone, otp, password, ...(role ? { role } : {}) })

export const getMe = () => api.get<App.User>('/auth/me')

export const logout = () => api.post('/auth/logout')
