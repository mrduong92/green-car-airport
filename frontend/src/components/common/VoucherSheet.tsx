import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getVouchers } from '@/api/bookings'
import { getMyVouchers } from '@/api/customer'
import clsx from 'clsx'

interface Props {
  open: boolean
  onClose: () => void
  /** Nếu truyền vào thì hiện nút "Dùng ngay" và tính discount preview */
  onSelect?: (voucher: App.VoucherListItem, discount: number, isCapped: boolean) => void
  currentPrice?: number
  selectedCode?: string
  showPersonal?: boolean
}

const VOUCHER_MAX_RATE = 0.10

function calcDiscount(v: App.VoucherListItem, price: number) {
  const raw = v.type === 'fixed' ? v.value : Math.round(price * v.value / 100)
  return Math.min(raw, Math.floor(price * VOUCHER_MAX_RATE))
}

export default function VoucherSheet({ open, onClose, onSelect, currentPrice = 0, selectedCode, showPersonal }: Props) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const { data: vouchers = [], isLoading } = useQuery({
    queryKey: ['vouchers-list'],
    queryFn: () => getVouchers().then((r) => r.data),
    enabled: open,
    staleTime: 60_000,
  })

  const { data: personalVouchers = [] } = useQuery({
    queryKey: ['my-vouchers'],
    queryFn: () => getMyVouchers().then((r) => r.data),
    enabled: open && !!showPersonal,
    staleTime: 60_000,
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      <div
        className="relative w-full bg-white rounded-t-[24px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full bg-border-gray mx-auto mt-3 mb-1 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-soft shrink-0">
          <p className="text-[15px] font-semibold text-navy">Voucher của tôi</p>
          <button onClick={onClose}>
            <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-3">
          {isLoading && (
            <div className="flex justify-center py-8">
              <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
            </div>
          )}

          {!isLoading && vouchers.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="material-symbols-outlined text-4xl text-neutral-dim">confirmation_number</span>
              <p className="text-sm font-semibold text-navy">Không có voucher nào</p>
              <p className="text-[12px] text-neutral-gray">Hiện chưa có mã giảm giá khả dụng</p>
            </div>
          )}

          {showPersonal && personalVouchers.length > 0 && (
            <>
              <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider">Voucher giới thiệu của tôi</p>
              {personalVouchers.map((v) => {
                const discount = onSelect ? Math.min(v.value, Math.floor(currentPrice * VOUCHER_MAX_RATE)) : null
                return (
                  <div key={v.id} className="rounded-card border border-primary/30 overflow-hidden">
                    <div className="flex items-stretch">
                      <div className="w-1.5 bg-primary shrink-0" />
                      <div className="flex-1 px-3.5 py-3 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-[10px] bg-primary-tint flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-primary text-[18px]"
                                style={{ fontVariationSettings: "'FILL' 1" }}>redeem</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="inline-block bg-primary text-white text-[11px] font-bold px-2 py-0.5 rounded mb-1">
                            {v.code}
                          </span>
                          <p className="text-[14px] font-semibold text-navy">Giảm {v.value.toLocaleString('vi')}đ</p>
                          <p className="text-[11px] text-neutral-gray mt-0.5">Hết hạn {v.expires_at}</p>
                          {discount !== null && currentPrice > 0 && (
                            <p className="text-[11px] text-success-green font-medium mt-0.5">
                              Tiết kiệm {discount.toLocaleString('vi')}đ
                            </p>
                          )}
                        </div>
                        {onSelect && (
                          <button
                            onClick={() => {
                              const d = Math.min(v.value, Math.floor(currentPrice * VOUCHER_MAX_RATE))
                              onSelect({ ...v, type: 'fixed' }, d, v.value > Math.floor(currentPrice * VOUCHER_MAX_RATE))
                              onClose()
                            }}
                            className="bg-primary text-white text-[12px] font-semibold rounded-pill px-3 py-1.5 shrink-0"
                          >
                            Dùng ngay
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              {vouchers.length > 0 && (
                <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mt-1">Voucher công khai</p>
              )}
            </>
          )}

          {vouchers.map((v) => {
            const isSelected = v.code === selectedCode
            const discount = onSelect ? calcDiscount(v, currentPrice) : null
            const raw = v.type === 'fixed' ? v.value : Math.round(currentPrice * v.value / 100)
            const maxDiscount = Math.floor(currentPrice * VOUCHER_MAX_RATE)
            const isCapped = currentPrice > 0 && raw > maxDiscount

            return (
              <div
                key={v.id}
                className={clsx(
                  'rounded-card border overflow-hidden transition-colors',
                  isSelected ? 'border-primary bg-primary-tint' : 'border-border-soft bg-white',
                )}
              >
                {/* Color stripe + icon */}
                <div className="flex items-stretch">
                  <div className="w-1.5 bg-primary shrink-0" />

                  <div className="flex-1 px-3.5 py-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-[10px] bg-primary-tint flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-primary text-[18px]"
                            style={{ fontVariationSettings: "'FILL' 1" }}>
                        confirmation_number
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Code badge */}
                      <span className="inline-block bg-primary text-white text-[11px] font-bold px-2 py-0.5 rounded mb-1">
                        {v.code}
                      </span>
                      <p className="text-[14px] font-semibold text-navy">
                        {v.type === 'fixed'
                          ? `Giảm ${v.value.toLocaleString('vi')}đ`
                          : `Giảm ${v.value}%`}
                      </p>
                      <p className="text-[11px] text-neutral-gray mt-0.5">Hết hạn {v.expires_at}</p>
                      {discount !== null && currentPrice > 0 && (
                        <>
                          <p className="text-[11px] text-success-green font-medium mt-0.5">
                            Tiết kiệm {discount.toLocaleString('vi')}đ
                          </p>
                          {isCapped && (
                            <p className="text-[11px] text-neutral-gray mt-0.5">
                              Tối đa {maxDiscount.toLocaleString('vi')}đ (10% cuốc này)
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    {onSelect && (
                      isSelected ? (
                        <span className="material-symbols-outlined text-primary text-[20px] shrink-0"
                              style={{ fontVariationSettings: "'FILL' 1" }}>
                          check_circle
                        </span>
                      ) : (
                        <button
                          onClick={() => { onSelect(v, calcDiscount(v, currentPrice), isCapped); onClose() }}
                          className="bg-primary text-white text-[12px] font-semibold rounded-pill px-3 py-1.5 shrink-0 whitespace-nowrap"
                        >
                          Dùng ngay
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          <div className="h-2" />
        </div>
      </div>
    </div>
  )
}
