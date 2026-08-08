import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { disconnectEcho } from '@/echo'

interface AuthState {
  user: App.User | null
  token: string | null
  setAuth: (user: App.User, token: string) => void
  clearAuth: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        localStorage.setItem('token', token)
        set({ user, token })
      },
      clearAuth: () => {
        localStorage.removeItem('token')
        // Bắt buộc: Echo giữ token cũ trong closure và vẫn bám kênh private của
        // người vừa đăng xuất. Không ngắt thì người đăng nhập sau trên cùng máy
        // sẽ nghe nhầm sự kiện của tài khoản trước.
        disconnectEcho()
        set({ user: null, token: null })
      },
      isAuthenticated: () => !!get().token,
    }),
    { name: 'auth' },
  ),
)
