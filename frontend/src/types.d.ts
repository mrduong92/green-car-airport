declare namespace App {
  type Role = 'customer' | 'driver' | 'admin'

  interface User {
    id: number
    name: string
    phone: string
    role: Role
    needs_onboarding?: boolean
    pending_penalty?: number
    referral_code?: string
  }

  type BookingStatus = 'pending' | 'finding_driver' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'
  type TripStatus = 'available' | 'accepted' | 'picking_up' | 'in_progress' | 'completed'

  interface Booking {
    id: number
    pickup: string
    pickup_lat?: number | null
    pickup_lng?: number | null
    destination: string
    destination_lat?: number | null
    destination_lng?: number | null
    date: string
    time: string
    distance_km: number
    price: number
    discount?: number
    surcharge?: number
    final_price?: number
    voucher_code?: string | null
    note?: string | null
    vehicle_type?: VehicleType
    status: BookingStatus
    driver?: {
      id: number
      name: string
      phone?: string
      vehicle_make?: string
      vehicle_model?: string
      vehicle_plate?: string
      vehicle_color?: string
      rating?: number
    }
    created_at: string
    accepted_at?: string | null
  }

  type VehicleType = 'sedan_4' | 'suv_5' | 'mpv_7'

  interface BookingPayload {
    pickup: string
    pickup_lat?: number
    pickup_lng?: number
    destination: string
    destination_lat?: number
    destination_lng?: number
    date: string
    time: string
    distance_km: number
    price: number
    vehicle_type: VehicleType
    voucher_code?: string
    note?: string
  }

  interface Trip {
    id: number
    booking_id: number
    pickup: string
    pickup_lat?: number | null
    pickup_lng?: number | null
    destination: string
    destination_lat?: number | null
    destination_lng?: number | null
    date: string
    time: string
    distance_km: number
    duration_min: number
    price: number
    discount: number
    final_price: number
    app_fee: number
    net_earning: number
    status: TripStatus
    customer_note?: string | null
    is_new: boolean
    customer_phone_masked: string
    distance_to_driver?: number | null
  }

  interface Wallet {
    points: number
    equivalent_vnd: number
  }

  interface Transaction {
    id: number
    type: 'credit' | 'debit' | 'topup' | 'referral'
    description: string
    points: number
    created_at: string
  }

  interface TopUpInfo {
    bank: {
      name: string
      account_number: string
      account_holder: string
    }
    payment_code: string
    min_amount_vnd: number
    suggested_amounts: number[]
    qr_template_url: string | null
  }

  interface TopUpEvent {
    id: number
    amount_vnd: number
    points_credited: number
    status: 'processed' | 'unmatched' | 'ignored'
    gateway: string | null
    reference_code: string | null
    transaction_date: string | null
  }

  interface DriverProfile {
    id: number
    name: string
    phone: string
    avatar_url?: string
    is_verified: boolean
    status: 'active' | 'pending' | 'blocked'
    vehicle_make: string
    vehicle_model: string
    vehicle_plate: string
    vehicle_year: number
    vehicle_color: string
    trips_count: number
    rating: number
    months_active: number
    points: number
    is_online: boolean
  }

  interface AdminDashboard {
    trips_today: number
    trips_today_change: number
    revenue_today: number
    drivers_online: number
    drivers_total: number
    app_fee_today: number
    recent_trips: RecentTrip[]
    driver_referral_points_total: number
    customer_referral_vouchers_total: number
  }

  interface RecentTrip {
    id: number
    customer_name: string
    driver_name: string
    route: string
    status: BookingStatus
    created_at: string
  }

  interface VoucherListItem {
    id: number
    code: string
    type: 'fixed' | 'percent'
    value: number
    expires_at: string
  }

  interface PersonalVoucher {
    id: number
    code: string
    type: 'fixed' | 'percent'
    value: number
    expires_at: string
  }

  interface Voucher {
    id: number
    code: string
    type: 'fixed' | 'percent'
    value: number
    target: 'all' | 'specific'
    expires_at: string
    usage_limit: number
    usage_count: number
    is_active: boolean
  }

  interface VoucherPayload {
    code: string
    type: 'fixed' | 'percent'
    value: number
    target: 'all' | 'specific'
    expires_at: string
    usage_limit: number
  }

  interface RevenueReport {
    period: string
    total_revenue: number
    app_fee: number
    trips_completed: number
    avg_per_trip: number
    revenue_change: number
    trips_change: number
    chart: { label: string; revenue: number; fee: number }[]
    vehicle_breakdown: { type: string; label: string; revenue: number; trips: number }[]
    top_drivers: { name: string; revenue: number; trips: number }[]
    recent_trips: {
      id: number
      pickup: string
      destination: string
      price: number
      vehicle_type: string
      driver_name: string
      customer_name: string
      date: string
      time: string
    }[]
  }

  interface PriceConfig {
    id: number
    service_type: 'airport' | 'provincial'
    trip_type: 'one_way' | 'round_trip'
    vehicle_type: VehicleType
    price_type: 'range' | 'per_km'
    min_price: number
    max_price: number
    is_active: boolean
    sort_order: number
  }

  interface CustomerProfile {
    id: number
    name: string
    phone: string
    total: number
    completed: number
    cancelled: number
    total_spent: number
    member_since: string
  }

  interface AdminCustomer {
    id: number
    name: string
    phone: string
    is_blocked: boolean
    total_bookings: number
    completed_bookings: number
    total_spent: number
    created_at: string
  }

  interface AdminCustomerBooking {
    id: number
    pickup: string
    destination: string
    date: string
    time: string
    price: number
    status: BookingStatus
    created_at: string
  }

  interface Paginated<T> {
    data: T[]
    current_page: number
    last_page: number
    total: number
  }
}

declare module '@goongmaps/goong-js' {
  const mapboxgl: { Map: any; Marker: any; LngLatBounds: any; accessToken: string; [key: string]: any }
  export default mapboxgl
}
