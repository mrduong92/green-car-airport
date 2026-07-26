import type { Page } from '@playwright/test'
import { PLACES, STUB_DISTANCE_METRES } from './testData'

// `typeof PLACES.pickup` alone would type this as pickup's exact literal
// shape (e.g. placeId: "e2e-pickup"), which rejects `PLACES.dest` below —
// index over the whole `as const` object instead to get the real union of
// both places.
type Place = (typeof PLACES)[keyof typeof PLACES]

const ALL: Place[] = [PLACES.pickup, PLACES.dest]

/**
 * Intercepts every Goong Maps call so address autocomplete, place detail, and
 * distance are deterministic. Must be called before the page navigates.
 */
export async function stubGoong(page: Page): Promise<void> {
  await page.route('https://rsapi.goong.io/Place/AutoComplete**', async (route) => {
    const input = (new URL(route.request().url()).searchParams.get('input') ?? '').toLowerCase()
    const matches = ALL.filter(
      (p) => p.mainText.toLowerCase().includes(input) || p.address.toLowerCase().includes(input),
    )
    await route.fulfill({
      json: {
        predictions: (matches.length > 0 ? matches : ALL).map((p) => ({
          place_id: p.placeId,
          description: p.address,
          structured_formatting: { main_text: p.mainText, secondary_text: p.secondaryText },
        })),
      },
    })
  })

  await page.route('https://rsapi.goong.io/Place/Detail**', async (route) => {
    const placeId = new URL(route.request().url()).searchParams.get('place_id')
    const place = ALL.find((p) => p.placeId === placeId) ?? PLACES.pickup
    await route.fulfill({
      json: {
        result: {
          formatted_address: place.address,
          geometry: { location: { lat: place.lat, lng: place.lng } },
        },
      },
    })
  })

  await page.route('https://rsapi.goong.io/DistanceMatrix**', async (route) => {
    await route.fulfill({
      json: {
        rows: [{ elements: [{ status: 'OK', distance: { value: STUB_DISTANCE_METRES } }] }],
      },
    })
  })
}
