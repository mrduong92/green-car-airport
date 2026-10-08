import api from './axios'

export const getFreeRides = (params: App.FreeRideFilters & { since?: number; cursor?: string }) =>
  api.get<App.FreeRidePage>('/driver/free-rides', { params })

export type FreeRideReportReason = 'spam' | 'wrong_info' | 'inappropriate' | 'other'

export const reportFreeRide = (rideUid: string, reason: FreeRideReportReason, note?: string) =>
  api.post<{ ok: true }>(`/driver/free-rides/${encodeURIComponent(rideUid)}/report`, { reason, note })

export const hideFreeRideSender = (senderUid: string) =>
  api.post<{ ok: true }>('/driver/free-rides/hidden-senders', { sender_uid: senderUid })

export const reportBrokenLink = (rideUid: string) =>
  api.post<{ ok: true }>(`/driver/free-rides/${encodeURIComponent(rideUid)}/broken-link`)
