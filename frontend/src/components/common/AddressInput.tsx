import { useRef, useEffect } from 'react'
import { useGoongAutocomplete } from '@/hooks/useGoongAutocomplete'
import { goongPlaceDetail } from '@/api/goong'
import type { LatLng } from '@/api/goong'

interface Props {
  value: string
  onChange: (val: string) => void
  onPlaceSelect: (addr: string, latlng: LatLng) => void
  placeholder: string
  icon: string
  error?: string
}

export default function AddressInput({ value, onChange, onPlaceSelect, placeholder, icon, error }: Props) {
  const { query, setQuery, setQuerySilent, predictions, setPredictions, loading, sessionToken } = useGoongAutocomplete()
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync external value into query when it changes externally (e.g. form reset) — silent so autocomplete doesn't re-fire
  useEffect(() => {
    if (value !== query) setQuerySilent(value)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Close dropdown on outside click — only hide suggestions, do not clear text
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPredictions([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [setPredictions])

  const handleSelect = async (placeId: string, description: string) => {
    onChange(description)
    setQuerySilent(description)
    setPredictions([])
    try {
      const detail = await goongPlaceDetail(placeId, crypto.randomUUID())
      const finalAddr = detail.address || description
      onChange(finalAddr)
      setQuerySilent(finalAddr)
      onPlaceSelect(finalAddr, { lat: detail.lat, lng: detail.lng })
    } catch {
      onPlaceSelect(description, { lat: 0, lng: 0 })
    }
    sessionToken.current = crypto.randomUUID()
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-primary shrink-0">{icon}</span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)   // normal setQuery so typing triggers autocomplete
            onChange(e.target.value)
          }}
          placeholder={placeholder}
          className="flex-1 outline-none text-navy text-sm"
          autoComplete="off"
        />
        {loading && (
          <span className="material-symbols-outlined text-neutral-gray text-base shrink-0 animate-spin">
            progress_activity
          </span>
        )}
      </div>

      {predictions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 bg-white rounded-card shadow-card border border-border-gray z-50 max-h-60 overflow-y-auto">
          {predictions.map((p) => (
            <li key={p.place_id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(p.place_id, p.description)}
                className="w-full text-left px-4 py-3 flex flex-col gap-0.5 hover:bg-light-green active:bg-light-green border-b border-border-gray last:border-0"
              >
                <span className="text-sm text-navy font-medium line-clamp-1">
                  {p.structured_formatting.main_text}
                </span>
                <span className="text-xs text-neutral-gray line-clamp-1">
                  {p.structured_formatting.secondary_text}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-danger-red text-xs mt-1">{error}</p>}
    </div>
  )
}
