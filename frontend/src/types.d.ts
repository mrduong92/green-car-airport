declare namespace App {
  type Role = 'customer' | 'driver' | 'admin'

  interface User {
    id: number
    name: string
    phone: string
    role: Role
  }

  type BookingStatus = 'pending' | 'finding_driver' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'
  type TripStatus = 'available' | 'accepted' | 'picking_up' | 'in_progress' | 'completed'

  interface Booking {
    id: number
    pickup: string
    destination: string
    date: string
    time: string
    distance_km: number
    price: number
    status: BookingStatus
    driver?: DriverProfile
    created_at: string
  }

  interface BookingPayload {
    pickup: string
    destination: string
    date: string
    time: string
    distance_km: number
    price: number
    voucher_code?: string
  }

  interface Trip {
    id: number
    booking_id: number
    pickup: string
    destination: string
    date: string
    time: string
    distance_km: number
    duration_min: number
    price: number
    app_fee: number
    net_earning: number
    status: TripStatus
    is_new: boolean
    customer_phone_masked: string
  }

  interface Wallet {
    points: number
    equivalent_vnd: number
  }

  interface Transaction {
    id: number
    type: 'credit' | 'debit'
    description: string
    points: number
    created_at: string
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
  }

  interface RecentTrip {
    id: number
    customer_name: string
    driver_name: string
    route: string
    status: BookingStatus
    created_at: string
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
    chart: { label: string; revenue: number; fee: number }[]
  }

  interface Paginated<T> {
    data: T[]
    current_page: number
    last_page: number
    total: number
  }
}
