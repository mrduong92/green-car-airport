import { useRef, useEffect, useState } from 'react'
import { useGoongAutocomplete } from '@/hooks/useGoongAutocomplete'
import { goongPlaceDetail, goongReverseGeocode } from '@/api/goong'
import type { LatLng } from '@/api/goong'
import { useUiStore } from '@/stores/ui'

interface Props {
  value: string
  onChange: (val: string) => void
  onPlaceSelect: (addr: string, latlng: LatLng) => void
  onClear?: () => void
  placeholder: string
  icon?: string
  label?: string
  error?: string
  showMyLocation?: boolean
}

export default function AddressInput({ value, onChange, onPlaceSelect, onClear, placeholder, icon, label, error, showMyLocation }: Props) {
  const { query, setQuery, setQuerySilent, predictions, setPredictions, loading, sessionToken } = useGoongAutocomplete()
  const containerRef = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  const [locLoading, setLocLoading] = useState(false)
  const showToast = useUiStore((s) => s.showToast)

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

  const handleClear = () => {
    setQuery('')
    onChange('')
    setPredictions([])
    onClear?.()
  }

  const handleMyLocation = () => {
    if (!navigator.geolocation) {
      showToast('Trình duyệt không hỗ trợ định vị', 'error')
      return
    }
    setLocLoading(true)
    setPredictions([])
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const latlng = { lat: coords.latitude, lng: coords.longitude }
          const address = await goongReverseGeocode(latlng)
          onChange(address)
          setQuerySilent(address)
          onPlaceSelect(address, latlng)
        } finally {
          setLocLoading(false)
          setFocused(false)
        }
      },
      () => {
        setLocLoading(false)
        showToast('Không thể xác định vị trí. Vui lòng bật định vị và thử lại.', 'error')
      },
      { timeout: 8000 }
    )
  }

  const handleSelect = async (placeId: string, description: string) => {
    onChange(description)
    setQuerySilent(description)
    setPredictions([])
    try {
      // Phải dùng ĐÚNG session token của phiên autocomplete vừa rồi, không sinh
      // token mới: Goong gom các lượt gõ phím + lượt lấy chi tiết địa điểm có
      // cùng token thành MỘT phiên tính tiền. Truyền token lạ vào đây thì phiên
      // autocomplete và lượt Place Detail bị tính thành hai khoản riêng.
      //
      // Token được reset ở cuối hàm — sau khi đã chọn xong thì phiên kết thúc,
      // lần gõ tiếp theo bắt đầu phiên mới.
      const detail = await goongPlaceDetail(placeId, sessionToken.current)
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
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <div className="flex items-center gap-3">
        {icon && <span className="material-symbols-outlined text-primary shrink-0">{icon}</span>}
        <div className="flex-1 min-w-0">
          {label && <p className="text-[11px] text-neutral-gray mb-0.5">{label}</p>}
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              onChange(e.target.value)
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            className="w-full outline-none text-navy text-[14px] font-medium"
            style={{ fontWeight: query ? 600 : 400 }}
            autoComplete="off"
          />
        </div>
        {loading && (
          <span className="material-symbols-outlined text-neutral-gray text-base shrink-0 animate-spin">
            progress_activity
          </span>
        )}
        {!loading && query.length > 0 && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
            className="shrink-0 text-neutral-gray hover:text-navy active:text-navy"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        )}
      </div>

      {showMyLocation && focused && query.length === 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 bg-white rounded-card shadow-float border border-border-soft z-[100]">
          <li>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleMyLocation}
              className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-primary-tint active:bg-primary-tint"
            >
              <span className="material-symbols-outlined text-primary text-xl shrink-0">my_location</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-primary font-semibold">Vị trí của tôi</span>
                <p className="text-xs text-neutral-gray">Dùng GPS hiện tại</p>
              </div>
              {locLoading && (
                <span className="material-symbols-outlined animate-spin text-primary text-base shrink-0">
                  progress_activity
                </span>
              )}
            </button>
          </li>
        </ul>
      )}

      {predictions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 bg-white rounded-card shadow-float border border-border-soft z-[100] max-h-[340px] overflow-y-auto">
          {predictions.map((p) => (
            <li key={p.place_id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(p.place_id, p.description)}
                className="w-full text-left px-4 py-3 flex flex-col gap-0.5 hover:bg-primary-tint active:bg-primary-tint border-b border-border-soft last:border-0"
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
