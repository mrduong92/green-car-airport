import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { getRewardWallet, getRewardTransactions } from '@/api/rewards'
import type { RewardTransaction } from '@/api/rewards'
import EmptyState from '@/components/common/EmptyState'

const KIND_ICON: Record<RewardTransaction['kind'], string> = {
  cashback: 'savings',
  commission: 'group_add',
  spend: 'shopping_cart',
  refund: 'undo',
}

export default function RewardWalletPage() {
  const navigate = useNavigate()

  const { data: wallet } = useQuery({
    queryKey: ['reward-wallet'],
    queryFn: () => getRewardWallet().then((r) => r.data),
  })

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['reward-transactions'],
    queryFn: ({ pageParam }) => getRewardTransactions(pageParam).then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next_page,
  })

  const transactions = data?.pages.flatMap((p) => p.data) ?? []

  return (
    <div className="w-full flex flex-col pb-8">
      {/* Header */}
      <div className="px-4 pt-4 pb-5 bg-white border-b border-border-gray flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center">
          <span className="material-symbols-outlined text-navy">arrow_back</span>
        </button>
        <p className="font-semibold text-navy text-[16px]">Ví điểm thưởng</p>
      </div>

      {/* Balance */}
      <div className="mx-4 mt-4 bg-white rounded-card shadow-card p-5 flex flex-col gap-1.5">
        <p className="text-[12px] text-neutral-gray">Số dư hiện tại</p>
        <p data-testid="reward-balance" className="text-[28px] font-bold text-gold tabular-nums">
          {(wallet?.reward_points ?? 0).toLocaleString('vi-VN')} điểm
        </p>
        <p className="text-[13px] text-neutral-gray">
          ≈ {((wallet?.reward_points ?? 0) * 1000).toLocaleString('vi-VN')}đ
        </p>
        {wallet && (
          <p className="text-[11px] text-neutral-gray mt-1">
            Hoàn {wallet.cashback_percent}% mỗi chuyến · nhận {wallet.commission_percent}% chuyến của bạn bè bạn giới thiệu{wallet.spend_enabled ? ` · dùng tối đa ${wallet.max_rate_percent}% giá mỗi chuyến` : ''}
          </p>
        )}
      </div>

      {/* Transactions */}
      <div className="mx-4 mt-4">
        <p className="text-[13px] font-semibold text-navy mb-3">Lịch sử điểm thưởng</p>
        {transactions.length === 0 ? (
          <EmptyState
            icon="stars"
            title="Chưa có điểm thưởng"
            description="Hoàn thành chuyến để nhận điểm"
          />
        ) : (
          <div className="flex flex-col gap-2">
            {transactions.map((tx) => (
              <div key={tx.id} className="bg-white rounded-card shadow-card px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-tint flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-[18px]">{KIND_ICON[tx.kind]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-navy truncate">{tx.description}</p>
                  <p className="text-[11px] text-neutral-gray mt-0.5">
                    {dayjs(tx.created_at).format('DD/MM/YYYY HH:mm')}
                  </p>
                </div>
                <p className={`text-[15px] font-bold tabular-nums shrink-0 ${tx.type === 'credit' ? 'text-success-green' : 'text-danger-red'}`}>
                  {tx.type === 'credit' ? '+' : '−'}{tx.points.toLocaleString('vi-VN')}
                </p>
              </div>
            ))}
          </div>
        )}

        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full mt-3 py-3 rounded-card border border-border-gray text-sm font-medium text-primary disabled:opacity-50"
          >
            {isFetchingNextPage ? 'Đang tải...' : 'Xem thêm'}
          </button>
        )}
      </div>
    </div>
  )
}
