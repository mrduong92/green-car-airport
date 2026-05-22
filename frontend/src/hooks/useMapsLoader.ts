const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined

let loadPromise: Promise<void> | null = null

export function loadMaps(): Promise<void> {
  if (!MAPS_KEY) return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY not set'))
  if (window.google?.maps?.places) return Promise.resolve()
  if (loadPromise) return loadPromise

  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places&language=vi&region=VN`
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loadPromise = null
      reject(new Error('Không thể tải Google Maps'))
    }
    document.head.appendChild(script)
  })

  return loadPromise
}
