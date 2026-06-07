import api from './axios'

export const verifyFirebaseToken = (firebaseToken: string, password?: string) =>
  api.post<{ token: string; user: App.User }>('/auth/firebase/verify', { firebase_token: firebaseToken, password })

export const devMockLogin = (phone: string) =>
  api.post<{ token: string; user: App.User }>('/auth/dev/mock-login', { phone })

export const loginApi = (phone: string, password: string) =>
  api.post<{ token: string; user: App.User }>('/auth/login', { phone, password })

export const getMe = () => api.get<App.User>('/auth/me')

export const logout = () => api.post('/auth/logout')
