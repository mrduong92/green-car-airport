import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'

export function useDriverStream(enabled: boolean) {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (!enabled || !token) return

    let source: EventSource
    let retryTimer: ReturnType<typeof setTimeout>

    const connect = () => {
      const url = `/api/driver/stream?token=${encodeURIComponent(token)}`
      source = new EventSource(url)

      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string)
          if (data.type === 'new_booking') {
            queryClient.invalidateQueries({ queryKey: ['trips'] })
          }
        } catch {
          // ignore malformed JSON
        }
      }

      source.onerror = () => {
        source.close()
        retryTimer = setTimeout(connect, 3_000)
      }
    }

    connect()

    return () => {
      clearTimeout(retryTimer)
      source?.close()
    }
  }, [enabled, token, queryClient])
}
