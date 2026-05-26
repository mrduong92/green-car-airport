import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import clsx from 'clsx'
import { getTopUpInfo, getTopUpHistory } from '@/api/trips'
import { useUiStore } from '@/stores/ui'

export default function TopUpPage() {
  const showToast = useUiStore((s) => s.showToast)

  const { data: info } = useQuery({
    queryKey: ['topup-info'],
    queryFn: () => getTopUpInfo().then((r) => r.data),
  })

  const { data: history = [] } = useQuery({
    queryKey: ['topup-history'],
    queryFn: () => getTopUpHistory().then((r) => r.data),
    refetchInterval: 15_000,
  })

  const [openGuide, setOpenGuide] = useState(false)

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      showToast(`Đã sao chép ${label}`, 'success')
    } catch {
      showToast('Không sao chép được', 'error')
    }
  }

  return (
    <div className="w-full flex flex-col gap-4 px-4 py-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link
          to="/driver/wallet"
          className="w-9 h-9 rounded-full flex items-center justify-center bg-white shadow-card border border-border-gray"
        >
          <span className="material-symbols-outlined text-[18px] text-navy">arrow_back</span>
        </Link>
        <h1 className="text-navy font-bold text-lg">Nạp điểm</h1>
      </div>

      {/* Bank info card */}
      <div className="bg-white rounded-card shadow-card border border-border-gray p-4">
        <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-widest mb-3">
          Tài khoản nhận tiền
        </p>
        <div className="flex flex-col gap-3">
          <Row label="Ngân hàng" value={info?.bank.name ?? '—'} />
          <Row
            label="Số tài khoản"
            value={info?.bank.account_number ?? '—'}
            onCopy={info?.bank.account_number ? () => copy(info.bank.account_number, 'số tài khoản') : undefined}
            mono
          />
          <Row label="Chủ tài khoản" value={info?.bank.account_holder ?? '—'} />
        </div>
      </div>

      {/* Payment code card */}
      <div className="rounded-card p-4 border border-primary/20 bg-light-green">
        <p className="text-primary font-semibold text-sm mb-2">Mã chuyển khoản của bạn</p>
        <div className="flex items-center justify-between gap-3 bg-white rounded-input border border-primary/30 px-4 py-3">
          <span className="font-bold text-2xl tracking-widest text-primary tabular-nums">
            {info?.payment_code ?? '—'}
          </span>
          {info?.payment_code && (
            <button
              type="button"
              onClick={() => copy(info.payment_code, 'mã chuyển khoản')}
              className="flex items-center gap-1 text-primary text-sm font-semibold"
            >
              <span className="material-symbols-outlined text-[18px]">content_copy</span>
              Copy
            </button>
          )}
        </div>
        <p className="text-[12px] text-navy/80 mt-2.5">
          Bắt buộc gõ chính xác mã này vào <b>Nội dung chuyển khoản</b>. Hệ thống tự cộng điểm
          khi tiền vào tài khoản công ty.
        </p>
      </div>

      {/* QR code */}
      {info?.qr_template_url && (
        <div className="bg-white rounded-card shadow-card border border-border-gray p-4 flex flex-col items-center">
          <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-widest mb-3">
            Quét QR để chuyển khoản nhanh
          </p>
          <img
            src={info.qr_template_url}
            alt="VietQR"
            className="w-56 h-56 object-contain"
            loading="lazy"
          />
          <p className="text-[12px] text-neutral-gray mt-2">QR đã đính kèm STK + mã CK</p>
        </div>
      )}

      {/* Suggested amounts */}
      {info && info.suggested_amounts.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-widest mb-2">
            Gợi ý số tiền
          </p>
          <div className="flex flex-wrap gap-2">
            {info.suggested_amounts.map((amt) => (
              <span
                key={amt}
                className="px-3 py-1.5 rounded-pill text-[13px] font-semibold bg-white border border-border-gray text-navy"
              >
                {amt.toLocaleString('vi')}đ
              </span>
            ))}
          </div>
          <p className="text-[11px] text-neutral-gray mt-2">
            Tối thiểu {info.min_amount_vnd.toLocaleString('vi')}đ · 1.000đ = 1 điểm
          </p>
        </div>
      )}

      {/* Guide */}
      <button
        type="button"
        onClick={() => setOpenGuide((v) => !v)}
        className="flex items-center justify-between bg-white rounded-card shadow-card border border-border-gray px-4 py-3"
      >
        <span className="flex items-center gap-2 text-navy font-semibold text-sm">
          <span className="material-symbols-outlined text-primary text-[18px]">help</span>
          Hướng dẫn 3 bước
        </span>
        <span className="material-symbols-outlined text-neutral-gray">
          {openGuide ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {openGuide && (
        <div className="bg-white rounded-card shadow-card border border-border-gray p-4 flex flex-col gap-3 -mt-2">
          {[
            ['1', 'Mở app ngân hàng của bạn, chọn chuyển khoản'],
            ['2', `Nhập STK ${info?.bank.account_number ?? ''} (${info?.bank.name ?? ''})`],
            ['3', `Nhập đúng nội dung: ${info?.payment_code ?? ''} rồi chuyển`],
          ].map(([n, text]) => (
            <div key={n} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">
                {n}
              </span>
              <p className="text-[13px] text-navy">{text}</p>
            </div>
          ))}
          <p className="text-[12px] text-neutral-gray mt-1">
            Điểm tự động cộng trong vòng 1–2 phút sau khi tiền vào TK công ty.
          </p>
        </div>
      )}

      {/* History */}
      <div>
        <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-widest mb-3">
          Lần nạp gần đây
        </p>
        <div className="bg-white rounded-card shadow-card border border-border-gray overflow-hidden">
          {history.length === 0 && (
            <p className="text-[13px] text-neutral-gray text-center py-8">
              Chưa có lần nạp nào
            </p>
          )}
          {history.map((ev, i) => {
            const ok = ev.status === 'processed'
            return (
              <div
                key={ev.id}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3',
                  i < history.length - 1 && 'border-b border-border-gray',
                )}
              >
                <div
                  className={clsx(
                    'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
                    ok ? 'bg-success-green/10' : 'bg-alert-orange/10',
                  )}
                >
                  <span
                    className={clsx(
                      'material-symbols-outlined text-[18px]',
                      ok ? 'text-success-green' : 'text-alert-orange',
                    )}
                  >
                    {ok ? 'check' : 'warning'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-navy font-medium">
                    {ev.amount_vnd.toLocaleString('vi')}đ
                    {ev.gateway ? ` · ${ev.gateway}` : ''}
                  </p>
                  <p className="text-[11px] text-neutral-gray mt-0.5">
                    {ev.transaction_date ? dayjs(ev.transaction_date).format('DD/MM · HH:mm') : '—'}
                    {ev.reference_code ? ` · ${ev.reference_code}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={clsx(
                      'font-bold text-sm tabular-nums',
                      ok ? 'text-success-green' : 'text-alert-orange',
                    )}
                  >
                    {ok ? `+${ev.points_credited} đ` : 'Chưa khớp'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  onCopy,
  mono,
}: {
  label: string
  value: string
  onCopy?: () => void
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] text-neutral-gray">{label}</span>
      <div className="flex items-center gap-2">
        <span className={clsx('text-[14px] text-navy font-semibold', mono && 'tabular-nums tracking-wider')}>
          {value}
        </span>
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="w-7 h-7 rounded-full flex items-center justify-center text-primary hover:bg-primary/10"
          >
            <span className="material-symbols-outlined text-[16px]">content_copy</span>
          </button>
        )}
      </div>
    </div>
  )
}
