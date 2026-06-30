import api from './axios'

export interface CollaboratorWallet {
  points: number
  total_earned: number
}

export interface CollaboratorTransaction {
  id: number
  booking_id: number | null
  points: number
  description: string
  created_at: string
}

export const getCollaboratorWallet = () =>
  api.get<CollaboratorWallet>('/customer/collaborator/wallet')

export const getCollaboratorTransactions = () =>
  api.get<CollaboratorTransaction[]>('/customer/collaborator/wallet/transactions')
