export const APP = {
  customer: 'http://localhost:5173',
  driver:   'http://localhost:5174',
  admin:    'http://localhost:5175',
} as const

export const TEST_PASSWORD = '000000'
export const TEST_OTP = '000000'

export const SEEDED = {
  customer: '0901234567',
  driver:   '0912345678',
  admin:    '0923456789',
} as const

/** Test-only phone range: 0999 + 6 random digits. Never collides with real Vietnamese prefixes. */
export function randomPhone(): string {
  return '0999' + Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')
}

/** Fixed price used for every booking so wallet point maths is deterministic. */
export const BOOKING_PRICE = 500_000

export const PLACES = {
  pickup: {
    placeId: 'e2e-pickup',
    mainText: 'Khách sạn E2E',
    secondaryText: 'Quận 1, TP.HCM',
    address: 'Khách sạn E2E, Quận 1, TP.HCM',
    lat: 10.7769,
    lng: 106.7009,
  },
  dest: {
    placeId: 'e2e-dest',
    mainText: 'Sân bay Tân Sơn Nhất',
    secondaryText: 'Tân Bình, TP.HCM',
    address: 'Sân bay Tân Sơn Nhất, Tân Bình, TP.HCM',
    lat: 10.8188,
    lng: 106.6519,
  },
} as const

/** Stubbed driving distance in metres → 8.0 km after the client rounds it. */
export const STUB_DISTANCE_METRES = 8_000
