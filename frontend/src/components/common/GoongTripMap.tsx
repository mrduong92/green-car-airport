import { useEffect, useRef, useState } from 'react'
import mapboxgl from '@goongmaps/goong-js'
import '@goongmaps/goong-js/dist/goong-js.css'

const MAP_KEY = import.meta.env.VITE_GOONG_MAP_KEY as string
const API_KEY = import.meta.env.VITE_GOONG_API_KEY as string

;(mapboxgl as unknown as { accessToken: string }).accessToken = MAP_KEY

function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = []
  let i = 0, lat = 0, lng = 0
  while (i < encoded.length) {
    let shift = 0, b = 0, bits: number
    do { bits = encoded.charCodeAt(i++) - 63; b |= (bits & 0x1f) << shift; shift += 5 } while (bits >= 0x20)
    lat += b & 1 ? ~(b >> 1) : b >> 1; b = 0; shift = 0
    do { bits = encoded.charCodeAt(i++) - 63; b |= (bits & 0x1f) << shift; shift += 5 } while (bits >= 0x20)
    lng += b & 1 ? ~(b >> 1) : b >> 1
    coords.push([lng / 1e5, lat / 1e5])
  }
  return coords
}

interface Props {
  pickupLat: number
  pickupLng: number
  destLat: number
  destLng: number
}

export default function GoongTripMap({ pickupLat, pickupLng, destLat, destLng }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<InstanceType<typeof mapboxgl.Map> | null>(null)
  const [webglError, setWebglError] = useState(false)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    if (!(mapboxgl as unknown as { supported: () => boolean }).supported()) {
      setWebglError(true)
      return
    }

    let map: InstanceType<typeof mapboxgl.Map>
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: `https://tiles.goong.io/assets/goong_map_web.json?api_key=${MAP_KEY}`,
        center: [(pickupLng + destLng) / 2, (pickupLat + destLat) / 2],
        zoom: 11,
      })
    } catch {
      setWebglError(true)
      return
    }
    mapRef.current = map

    new mapboxgl.Marker({ color: '#006a36' })
      .setLngLat([pickupLng, pickupLat])
      .addTo(map)

    new mapboxgl.Marker({ color: '#C8A24A' })
      .setLngLat([destLng, destLat])
      .addTo(map)

    const bounds = new mapboxgl.LngLatBounds(
      [Math.min(pickupLng, destLng), Math.min(pickupLat, destLat)],
      [Math.max(pickupLng, destLng), Math.max(pickupLat, destLat)],
    )
    map.fitBounds(bounds, { padding: 60, maxZoom: 14 })

    map.on('load', async () => {
      try {
        const res = await fetch(
          `https://rsapi.goong.io/Direction?origin=${pickupLat},${pickupLng}&destination=${destLat},${destLng}&vehicle=car&api_key=${API_KEY}`
        )
        const data = await res.json()
        const encoded = data.routes?.[0]?.overview_polyline?.points
        if (!encoded) return

        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: decodePolyline(encoded) },
          },
        })
        map.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          paint: { 'line-color': '#006a36', 'line-width': 4, 'line-opacity': 0.85 },
        })
      } catch { /* silently ignore */ }
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [pickupLat, pickupLng, destLat, destLng])

  if (webglError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2">
        <span className="material-symbols-outlined text-4xl text-neutral-gray">map</span>
        <p className="text-caption text-neutral-gray text-center px-4">Trình duyệt không hỗ trợ bản đồ</p>
      </div>
    )
  }

  return <div ref={containerRef} className="w-full h-full" />
}
