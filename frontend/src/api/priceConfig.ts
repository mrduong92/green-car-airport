import api from './axios'

export const getPriceConfigs = () =>
  api.get<App.PriceConfig[]>('/price-configs').then((r) => r.data)

// Admin CRUD
export const adminGetPriceConfigs = () =>
  api.get<App.PriceConfig[]>('/admin/price-configs').then((r) => r.data)

export const adminCreatePriceConfig = (data: Omit<App.PriceConfig, 'id' | 'is_active'>) =>
  api.post<App.PriceConfig>('/admin/price-configs', data)

export const adminUpdatePriceConfig = (id: number, data: Partial<App.PriceConfig>) =>
  api.put<App.PriceConfig>(`/admin/price-configs/${id}`, data)

export const adminDeletePriceConfig = (id: number) =>
  api.delete(`/admin/price-configs/${id}`)
