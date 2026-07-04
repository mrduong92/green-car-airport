import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, type RouterProviderProps } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useUiStore } from '@/stores/ui'
import type { BeforeInstallPromptEvent } from '@/stores/ui'
import './index.css'

type AppRouter = RouterProviderProps['router']

export function bootstrap(router: AppRouter) {
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

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
}
