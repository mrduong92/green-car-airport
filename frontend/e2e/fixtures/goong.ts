import type { Page } from '@playwright/test'
import { PLACES, STUB_DISTANCE_METRES } from './testData'

type Place = typeof PLACES.pickup

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
