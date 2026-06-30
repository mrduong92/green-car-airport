import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getCollaboratorWallet, getCollaboratorTransactions } from '@/api/collaborator'
import { useAuthStore } from '@/stores/auth'

export default function CollaboratorWalletPage() {
  const navigate = useNavigate()
  const user     = useAuthStore((s) => s.user)

  const { data: wallet } = useQuery({
    queryKey: ['collaborator-wallet'],
    queryFn: () => getCollaboratorWallet().then((r) => r.data),
    enabled: !!user?.is_collaborator,
  })

  const { data: transactions = [] } = useQuery({
    queryKey: ['collaborator-transactions'],
    queryFn: () => getCollaboratorTransactions().then((r) => r.data),
    enabled: !!user?.is_collaborator,
  })

  return (
    <div className="w-full flex flex-col pb-8">
      {/* Header */}
      <div className="px-4 pt-4 pb-5 bg-white border-b border-border-gray flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center">
          <span className="material-symbols-outlined text-navy">arrow_back</span>
        </button>
        <p className="font-semibold text-navy text-[16px]">Ví Cộng Tác Viên</p>
      </div>

      {/* Balance */}
      <div className="mx-4 mt-4 bg-white rounded-card shadow-card p-5 flex flex-col gap-1.5">
        <p className="text-[12px] text-neutral-gray">Số dư hiện tại</p>
        <p className="text-[28px] font-bold text-gold tabular-nums">
          {(wallet?.points ?? 0).toLocaleString('vi')} điểm
        </p>
        <p className="text-[13px] text-neutral-gray">
          ~ {((wallet?.points ?? 0) * 1000).toLocaleString('vi')}đ
        </p>
        <p className="text-[11px] text-neutral-gray mt-1">
          Tổng đã nhận: {(wallet?.total_earned ?? 0).toLocaleString('vi')} điểm
        </p>
      </div>

      {/* Transactions */}
      <div className="mx-4 mt-4">
        <p className="text-[13px] font-semibold text-navy mb-3">Lịch sử thu hộ</p>
        {transactions.length === 0 ? (
          <div className="bg-white rounded-card shadow-card p-6 text-center">
            <span className="material-symbols-outlined text-3xl text-neutral-gray">receipt_long</span>
            <p className="text-[13px] text-neutral-gray mt-2">Chưa có giao dịch thu hộ nào</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {transactions.map((tx) => (
              <div key={tx.id} className="bg-white rounded-card shadow-card px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-navy">{tx.description}</p>
                  <p className="text-[11px] text-neutral-gray mt-0.5">
                    {new Date(tx.created_at).toLocaleDateString('vi-VN')}
                  </p>
                </div>
                <p className="text-[15px] font-bold text-success-green tabular-nums">
                  +{tx.points.toLocaleString('vi')} đ.
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mx-4 mt-6 text-[11px] text-neutral-gray text-center">
        * Rút tiền liên hệ kế toán. Thuế TNCN sẽ được khấu trừ theo quy định nhà nước.
      </p>
    </div>
  )
}
