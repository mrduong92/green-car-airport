import api from './axios'

export const getAvailableTrips = (params?: { sort?: string }) =>
  api.get<App.Trip[]>('/driver/trips', { params })

export const acceptTrip = (id: number) => api.post(`/driver/trips/${id}/accept`)

export const updateTripStatus = (id: number, status: App.TripStatus) =>
  api.patch(`/driver/trips/${id}/status`, { status })

export const getWallet = () => api.get<App.Wallet>('/driver/wallet')

export const getTransactions = () => api.get<App.Transaction[]>('/driver/wallet/transactions')

export const getDriverProfile = () => api.get<App.DriverProfile>('/driver/profile')

export const updateDriverProfile = (data: Partial<App.DriverProfile>) =>
  api.put('/driver/profile', data)

export const toggleOnline = (online: boolean) =>
  api.patch('/driver/status', { online })
