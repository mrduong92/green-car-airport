declare namespace App {
  type Role = 'customer' | 'driver' | 'admin'

  interface User {
    id: number
    name: string
    phone: string
    role: Role
    needs_onboarding?: boolean
    pending_penalty?: number
    is_collaborator?: boolean
    referral_code?: string
    approval_status?: 'pending' | 'active' | 'blocked'
  }

  type BookingStatus = 'pending' | 'finding_driver' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'
  type TripStatus = 'available' | 'accepted' | 'picking_up' | 'in_progress' | 'completed' | 'cancelled'

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
    is_vip?: boolean
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
    collection_fee?: number
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
    is_vip?: boolean
    voucher_code?: string
    note?: string
    collection_fee?: number
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
    vehicle_type: VehicleType
    is_vip?: boolean
    duration_min: number
    price: number
    discount: number
    collection_fee?: number
    final_price: number
    app_fee: number
    app_fee_percent: number
    net_earning: number
    status: TripStatus
    cancelled_at?: string | null
    cancelled_by?: 'customer' | 'driver' | 'system' | null
    cancel_reason?: string | null
    customer_note?: string | null
    is_new: boolean
    customer_phone: string
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
    vehicle_type?: VehicleType | null
    is_vip?: boolean
    trips_count: number
    rating: number
    months_active: number
    points: number
    is_online: boolean
    cccd_number?: string | null
    gplx_number?: string | null
    vehicle_reg_number?: string | null
    vehicle_inspection_number?: string | null
    vehicle_inspection_expiry?: string | null
    insurance_number?: string | null
    insurance_expiry?: string | null
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
    user_id: number | null
    user: { phone: string; name: string } | null
    expires_at: string
    usage_limit: number
    usage_count: number
    is_active: boolean
  }

  // Tạo voucher công khai — luôn target=all, 1 mã. Cấp riêng cho khách (1 hoặc
  // nhiều) đi qua bulkGrantVouchers(), không qua payload này.
  interface VoucherPayload {
    code: string
    type: 'fixed' | 'percent'
    value: number
    expires_at: string
    usage_limit: number
  }

  interface CampaignReward {
    voucher_count: number
    voucher_value: number
    voucher_expires_days: number
  }

  interface Campaign {
    id: number
    name: string
    trigger: string
    reward: CampaignReward
    starts_at: string | null
    ends_at: string | null
    max_grants: number | null
    grants_count: number
    is_active: boolean
  }

  interface CampaignPayload {
    name: string
    trigger: string
    reward: CampaignReward
    starts_at?: string | null
    ends_at?: string | null
    max_grants?: number | null
  }

  interface RevenueReport {
    period: string
    total_revenue: number
    app_fee_percent: number
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
    is_vip: boolean
    price_type: 'range' | 'per_km'
    min_price: number
    max_price: number
    is_active: boolean
    sort_order: number
  }

  interface StaticPage {
    id: number
    slug: string
    title: string
    content: string
    is_active: boolean
  }

  interface ContactSettings {
    hotline: string
    email: string
    zalo_phone: string
    app_fee_percent: number
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
    is_collaborator: boolean
    points: number | null
    total_bookings: number
    completed_bookings: number
    total_spent: number
    created_at: string
  }

  interface AdminUser {
    id: number
    name: string
    phone: string
    is_blocked: boolean
    is_self: boolean
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

  interface WalletAdjustment {
    id: number
    direction: 'in' | 'out'
    points: number
    description: string | null
    admin_name: string | null
    created_at: string
  }

  interface Paginated<T> {
    data: T[]
    current_page: number
    last_page: number
    total: number
  }

  type FreeRideDirection = 'to_airport' | 'from_airport' | 'other'

  interface FreeRide {
    ride_uid: string
    sender_uid: string
    sender_name: string
    group_name: string
    direction: FreeRideDirection | null
    pickup: string | null
    destination: string | null
    pickup_at: number | null
    pickup_time_text: string | null
    seats: number | null
    vehicle_note: string | null
    price: number | null
    is_free: boolean
    is_raw: boolean
    raw_text: string
    group_count: number
    // Backend luôn trả chuỗi dạng zalo://qr/p/<mã> — cuốc có mã bẩn bị loại ở
    // server (FreeRideController::safe()), không lọt ra tới đây.
    contact_url: string
    posted_at: number
    expires_at: number
  }

  interface FreeRidePage {
    data: FreeRide[]
    next_cursor: string | null
    latest: number | null
    // true khi server chạm trần SINCE_LIMIT (200 dòng): nghĩa là còn cuốc cũ
    // hơn bị bỏ sót, client phải nạp lại trang 1 thay vì gộp theo since.
    reset?: boolean
  }

  interface FreeRideFilters {
    direction?: FreeRideDirection
    seats?: number
    window?: '2h' | 'today' | 'tomorrow'
    q?: string
  }

  // Bộ lọc đã lưu để nhận thông báo đẩy (giai đoạn 5) — khớp JSON của FreeRideController::alert()/saveAlert()
  // (xem task-4-report.md). `keywords` được so khớp NGUYÊN CỤM, không tách rời từng từ.
  interface FreeRideAlert {
    enabled: boolean
    direction: FreeRideDirection | null
    seats: number | null
    keywords: string | null
  }

  // Trang admin "Cuốc Free" — khớp JSON thực tế của FreeRideAdminController (xem task-3-report.md, task-4-report.md).
  interface AdminZaloGroup {
    zalo_group_id: string
    name: string
    enabled: boolean
    member_count: number | null
    messages_24h: number
    last_message_at: number | null
    accounts: string[]
    left: boolean
    rides_24h: number
    rides_7d: number
  }

  interface AdminFreeRideSender {
    sender_uid: string
    sender_name: string
    active_rides: number
    rides_7d: number
    reports: number
    blocked: boolean
  }

  interface AdminFreeRideServiceAccount {
    id: string
    connected: boolean
    logged_in: boolean | null
    last_error: string | null
  }

  interface AdminFreeRideService {
    service_id: string
    last_heartbeat_at: number
    stale: boolean
    accounts: AdminFreeRideServiceAccount[]
    ai_spent_today_usd: number
    ai_budget_usd: number
    outbox_backlog: number
    held_back_rides: number
    qr_ok_24h: number
    qr_empty_24h: number
  }

  interface AdminFreeRideStatus {
    services: AdminFreeRideService[]
    active_rides: number
    groups_enabled: number
    groups_total: number
  }

  // Tab admin "Nick Zalo" (giai đoạn 5) — khớp JSON của ZaloAccountController (xem task-3-report.md).
  type AdminZaloAccountRequestType = 'login' | 'remove'
  type AdminZaloAccountRequestStatus = 'pending' | 'qr_ready' | 'done' | 'expired' | 'failed'

  interface AdminZaloAccount {
    id: string
    zalo_uid: string | null
    zalo_name: string | null
    connected: boolean
    logged_in: boolean | null
    last_error: string | null
    logged_in_at: number | null
    groups: number | null
    service_id: string
    stale: boolean
  }

  // Dòng trong `requests` của GET /admin/free-rides/accounts — chỉ yêu cầu đang mở (pending/qr_ready).
  interface AdminZaloAccountRequestSummary {
    id: number
    type: AdminZaloAccountRequestType
    account_id: string
    status: AdminZaloAccountRequestStatus
  }

  interface AdminZaloAccountsResponse {
    accounts: AdminZaloAccount[]
    requests: AdminZaloAccountRequestSummary[]
  }

  // POST/DELETE /admin/free-rides/accounts(/...) — luôn status=pending lúc tạo.
  interface AdminZaloAccountRequestCreated {
    id: number
    type: AdminZaloAccountRequestType
    account_id: string
    status: AdminZaloAccountRequestStatus
  }

  // GET /admin/free-rides/account-requests/{id} — luôn đủ 8 khoá, poll mỗi 2 giây.
  interface AdminZaloAccountRequestDetail {
    id: number
    type: AdminZaloAccountRequestType
    account_id: string
    status: AdminZaloAccountRequestStatus
    qr_image: string | null
    qr_expires_at: number | null
    zalo_name: string | null
    error: string | null
  }

  // Dạng phân trang { data, meta } của FreeRideAdminController — khác App.Paginated<T> (phẳng).
  interface AdminPage<T> {
    data: T[]
    meta: { current_page: number; last_page: number; total: number }
  }
}

declare module '@goongmaps/goong-js' {
  const mapboxgl: { Map: any; Marker: any; LngLatBounds: any; accessToken: string; [key: string]: any }
  export default mapboxgl
}
