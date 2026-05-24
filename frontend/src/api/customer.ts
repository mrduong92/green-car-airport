import api from './axios'

export const getCustomerProfile = () => api.get<App.CustomerProfile>('/customer/profile')

export const updateCustomerProfile = (data: { name: string }) =>
  api.patch('/customer/profile', data)
