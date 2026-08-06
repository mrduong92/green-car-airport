import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getWallet, getTransactions } from '@/api/trips'
import dayjs from 'dayjs'
import clsx from 'clsx'
import { BRAND } from '@/brand'

export default function WalletPage() {
  const { data: wallet } = useQuery({ queryKey: ['wallet'], queryFn: () => getWallet().then((r) => r.data) })
  const { data: txs = [] } = useQuery({ queryKey: ['transactions'], queryFn: () => getTransactions().then((r) => r.data) })

  const historyRef = useRef<HTMLDivElement>(null)
  const scrollToHistory = () => historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="w-full flex flex-col gap-4 px-4 py-4">
      {/* Gold gradient balance card */}
      <div
        className="p-6 rounded-2xl relative overflow-hidden text-white"
        style={{
          background: 'linear-gradient(135deg, #C8A24A 0%, #B4882F 100%)',
          boxShadow: '0 8px 24px rgba(200,162,74,0.35)',
        }}
      >
        {/* Deco circles */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
        <div className="absolute -bottom-8 right-8 w-20 h-20 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />

        <div className="relative">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold tracking-widest uppercase opacity-90 mb-2">
            <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
            Số dư điểm
          </div>
          <p className="text-white font-bold mb-1" style={{ fontSize: 40, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
            {(wallet?.points ?? 0).toLocaleString('vi')}
          </p>
          <p className="text-white/80 text-[13px]">
            ≈ {(wallet?.equivalent_vnd ?? 0).toLocaleString('vi')} đ · 1.000đ = 1 điểm
          </p>
          <div className="flex gap-2 mt-5">
            <Link
              to="/driver/wallet/topup"
              className="flex items-center gap-1.5 px-4 py-2 rounded-pill text-sm font-semibold"
              style={{ background: '#fff', color: '#C8A24A' }}
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Nạp điểm
            </Link>
            <button
              type="button"
              onClick={scrollToHistory}
              className="flex items-center gap-1.5 px-4 py-2 rounded-pill text-sm font-semibold text-white"
              style={{ background: 'rgba(255,255,255,0.18)' }}
            >
              <span className="material-symbols-outlined text-[16px]">history</span>
              Lịch sử
            </button>
          </div>
        </div>
      </div>

      {/* Top-up instructions */}
      <div className="bg-primary-tint rounded-card p-4 border border-primary/10">
        <p className="text-primary font-semibold text-sm mb-3">Hướng dẫn nạp điểm</p>
        <div className="flex flex-col gap-3">
          {[
            { icon: 'account_balance', text: `Chuyển khoản đến ${BRAND.legalName}` },
            { icon: 'credit_card',     text: 'STK: 1234 5678 90 · Vietcombank' },
            { icon: 'bolt',            text: 'Điểm tự động cộng sau khi nhận tiền' },
          ].map((row) => (
            <div key={row.icon} className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-primary text-[16px]">{row.icon}</span>
              <span className="text-navy text-[13px]">{row.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction history */}
      <div ref={historyRef} className="scroll-mt-4">
        <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-widest mb-3">
          Lịch sử giao dịch
        </p>
        <div className="bg-white rounded-card shadow-card border border-border-soft overflow-hidden">
          {txs.length === 0 && (
            <p className="text-caption text-neutral-gray text-center py-8">Chưa có giao dịch nào</p>
          )}
          {txs.map((tx, i) => {
            const isTopUp   = tx.type === 'topup'
            const positive  = tx.type === 'credit' || isTopUp
            const tintClass = isTopUp ? 'bg-primary/10' : positive ? 'bg-success-green/10' : 'bg-danger-red/10'
            const textClass = isTopUp ? 'text-primary'   : positive ? 'text-success-green' : 'text-danger-red'
            const icon      = isTopUp ? 'account_balance' : positive ? 'add' : 'remove'
            return (
              <div
                key={tx.id}
                className={clsx('flex items-center gap-3 px-4 py-4', i < txs.length - 1 && 'border-b border-border-soft')}
              >
                <div className={clsx('w-[34px] h-[34px] rounded-full flex items-center justify-center shrink-0', tintClass)}>
                  <span className={clsx('material-symbols-outlined text-[16px]', textClass)}>{icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-navy font-medium truncate">{tx.description}</p>
                  <p className="text-[11px] text-neutral-gray mt-0.5">{dayjs(tx.created_at).format('DD/MM · HH:mm')}</p>
                </div>
                <span className={clsx('font-bold text-sm tabular-nums', textClass)}>
                  {positive ? '+' : '-'}{tx.points} đ
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
