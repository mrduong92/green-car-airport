import { useState, useEffect, useRef } from 'react'
import { goongAutocomplete } from '@/api/goong'
import type { GoongPrediction } from '@/api/goong'

export function useGoongAutocomplete() {
  const [query,       setQuery]       = useState('')
  const [predictions, setPredictions] = useState<GoongPrediction[]>([])
  const [loading,     setLoading]     = useState(false)
  const sessionToken = useRef(crypto.randomUUID())
  const suppressRef  = useRef(false)

  useEffect(() => {
    if (suppressRef.current) {
      suppressRef.current = false
      setPredictions([])
      return
    }
    if (query.trim().length < 2) { setPredictions([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try { setPredictions(await goongAutocomplete(query, sessionToken.current)) }
      catch { setPredictions([]) }
      finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  // Update query without triggering autocomplete (used after place selection or external value sync)
  const setQuerySilent = (val: string) => {
    suppressRef.current = true
    setQuery(val)
  }

  const reset = () => {
    sessionToken.current = crypto.randomUUID()
    setPredictions([])
    setQuery('')
  }

  return { query, setQuery, setQuerySilent, predictions, setPredictions, loading, reset, sessionToken }
}
