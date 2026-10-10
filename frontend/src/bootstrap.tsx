import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, type RouterProviderProps } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useUiStore } from '@/stores/ui'
import type { BeforeInstallPromptEvent } from '@/stores/ui'
import { isNativeApp } from '@/platform'
import { initNativePush } from '@/push'
import './index.css'

type AppRouter = RouterProviderProps['router']

export type AppKind = 'customer' | 'driver' | 'admin'

export function bootstrap(router: AppRouter, app: AppKind = 'customer') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000 },
    },
  })

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    useUiStore.getState().setDeferredInstallPrompt(e as BeforeInstallPromptEvent)
  })

  window.addEventListener('appinstalled', () => {
    useUiStore.getState().setDeferredInstallPrompt(null)
    useUiStore.getState().setInstalled(true)
  })

  if (isNativeApp()) {
    // Chỉ app tài xế có kênh "Cuốc mới" — app khách hiện kênh này trong Cài đặt
    // Android là vô nghĩa với người dùng.
    initNativePush((path) => { void router.navigate(path) }, { rideChannel: app === 'driver' })
      .catch((e) => console.warn('[push] khởi tạo FCM thất bại', e))
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
}
