const BASE = 'https://rsapi.goong.io'
const KEY  = import.meta.env.VITE_GOONG_API_KEY as string | undefined

export interface GoongPrediction {
  place_id: string
  description: string
  structured_formatting: { main_text: string; secondary_text: string }
}

export type LatLng = { lat: number; lng: number }

export async function goongAutocomplete(input: string, sessionToken: string): Promise<GoongPrediction[]> {
  if (!KEY || input.trim().length < 2) return []
  const res  = await fetch(`${BASE}/Place/AutoComplete?input=${encodeURIComponent(input)}&api_key=${KEY}&sessiontoken=${sessionToken}`)
  const data = await res.json()
  return data.predictions ?? []
}

export async function goongPlaceDetail(placeId: string, sessionToken: string): Promise<{ address: string; lat: number; lng: number }> {
  const res  = await fetch(`${BASE}/Place/Detail?place_id=${encodeURIComponent(placeId)}&api_key=${KEY}&sessiontoken=${sessionToken}`)
  const data = await res.json()
  const loc  = data.result.geometry.location
  return { address: data.result.formatted_address, lat: loc.lat, lng: loc.lng }
}

export async function goongDistanceMatrix(origin: LatLng, dest: LatLng): Promise<number> {
  const res  = await fetch(`${BASE}/DistanceMatrix?origins=${origin.lat},${origin.lng}&destinations=${dest.lat},${dest.lng}&vehicle=car&api_key=${KEY}`)
  const data = await res.json()
  const el   = data.rows?.[0]?.elements?.[0]
  if (el?.status !== 'OK') throw new Error('Distance matrix failed')
  return Math.round((el.distance.value / 1000) * 10) / 10
}
