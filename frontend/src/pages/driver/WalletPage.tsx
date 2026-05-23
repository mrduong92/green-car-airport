import { useQuery } from '@tanstack/react-query'
import { getWallet, getTransactions } from '@/api/trips'
import dayjs from 'dayjs'
import clsx from 'clsx'

export default function WalletPage() {
  const { data: wallet } = useQuery({ queryKey: ['wallet'], queryFn: () => getWallet().then((r) => r.data) })
  const { data: txs = [] } = useQuery({ queryKey: ['transactions'], queryFn: () => getTransactions().then((r) => r.data) })

  return (
    <div className="flex flex-col">
      {/* Balance card */}
      <div className="bg-primary px-6 pt-10 pb-8">
        <p className="text-white/70 text-sm mb-1">Số dư điểm</p>
        <p className="text-white text-5xl font-bold mb-1">
          {(wallet?.points ?? 0).toLocaleString('vi')}
          <span className="text-2xl ml-1">điểm</span>
        </p>
        <p className="text-white/60 text-sm">Tương đương {(wallet?.equivalent_vnd ?? 0).toLocaleString('vi')} đ</p>
        <button className="mt-4 border border-white/40 text-white rounded-pill px-5 py-2 text-sm font-medium">
          Nạp điểm
        </button>
      </div>

      {/* Top-up instructions */}
      <div className="mx-4 mt-4 bg-light-green rounded-card p-4 flex flex-col gap-2">
        <p className="text-sm font-semibold text-navy">Hướng dẫn nạp điểm</p>
        <div className="flex items-start gap-2 text-sm text-navy">
          <span className="material-symbols-outlined text-primary text-lg shrink-0">credit_card</span>
          <span>Chuyển tiền đến: <strong>Green Car Airport Co.</strong></span>
        </div>
        <div className="flex items-start gap-2 text-sm text-navy">
          <span className="material-symbols-outlined text-primary text-lg shrink-0">account_balance</span>
          <span>STK: <strong>1234 5678 90</strong> — Vietcombank</span>
        </div>
        <div className="flex items-start gap-2 text-sm text-neutral-gray">
          <span className="material-symbols-outlined text-alert-orange text-lg shrink-0">bolt</span>
          <span>Điểm tự động cộng sau khi nhận tiền</span>
        </div>
      </div>

      {/* Transaction history */}
      <div className="px-4 mt-4">
        <p className="text-sm font-semibold text-navy mb-3">Lịch sử giao dịch</p>
        <div className="flex flex-col gap-2">
          {txs.length === 0 && (
            <p className="text-caption text-neutral-gray text-center py-6">Chưa có giao dịch nào</p>
          )}
          {txs.map((tx) => (
            <div key={tx.id} className="bg-white rounded-card shadow-card p-4 flex items-center gap-3">
              <div className={clsx('w-9 h-9 rounded-full flex items-center justify-center shrink-0',
                tx.type === 'credit' ? 'bg-success-green/10' : 'bg-danger-red/10')}>
                <span className={clsx('material-symbols-outlined text-xl',
                  tx.type === 'credit' ? 'text-success-green' : 'text-danger-red')}>
                  {tx.type === 'credit' ? 'add_circle' : 'remove_circle'}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm text-navy">{tx.description}</p>
                <p className="text-caption text-neutral-gray">{dayjs(tx.created_at).format('DD/MM')}</p>
              </div>
              <span className={clsx('font-bold text-sm',
                tx.type === 'credit' ? 'text-success-green' : 'text-danger-red')}>
                {tx.type === 'credit' ? '+' : '-'}{tx.points} điểm
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
