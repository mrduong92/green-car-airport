import { useUiStore } from '@/stores/ui'

interface Props {
  payment: App.FreeUnlockPayment | null
  onClose: () => void
}

export default function FreeRideUnlockSheet({ payment, onClose }: Props) {
  const showToast = useUiStore((s) => s.showToast)

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      showToast(`Đã sao chép ${label}`, 'success')
    } catch {
      showToast('Không sao chép được', 'error')
    }
  }

  const row = (label: string, value: string, testId?: string) => (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border-soft last:border-b-0">
      <div className="min-w-0">
        <p className="text-[11px] text-neutral-gray">{label}</p>
        <p data-testid={testId} className="text-[14px] font-semibold text-navy break-all">{value}</p>
      </div>
      <button type="button" aria-label={`Sao chép ${label}`} onClick={() => copy(value, label.toLowerCase())}
        className="shrink-0 min-w-touch min-h-touch flex items-center justify-center text-primary">
        <span className="material-symbols-outlined text-[20px]">content_copy</span>
      </button>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div data-testid="free-unlock-sheet" className="bg-white w-full max-h-[90vh] overflow-y-auto rounded-t-2xl pb-6 pt-5 px-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-primary text-[22px]">lock</span>
          <h2 className="text-[16px] font-semibold text-navy">Mở khóa Nhận cuốc</h2>
        </div>
        <p className="text-[13px] text-neutral-gray">
          Chuyển khoản phí mở khóa 1 năm bằng QR dưới đây. Admin xác nhận thủ công sau khi nhận tiền, rồi nút Nhận cuốc dùng được.
        </p>

        {payment ? (
          <>
            {payment.qr_url && (
              <img data-testid="free-unlock-qr" src={payment.qr_url} alt="Mã QR chuyển khoản mở khóa" className="mx-auto my-3 w-56 max-w-full rounded-card border border-border-gray" />
            )}
            <div className="rounded-card bg-light-green px-3">
              {payment.bank.name && row('Ngân hàng', payment.bank.name)}
              {payment.bank.account_number && row('Số tài khoản', payment.bank.account_number)}
              {payment.bank.account_holder && row('Chủ tài khoản', payment.bank.account_holder)}
              {payment.amount_vnd !== null && row('Số tiền', `${payment.amount_vnd.toLocaleString('vi-VN')}đ`, 'free-unlock-amount')}
              {row('Nội dung chuyển khoản', payment.transfer_content, 'free-unlock-content')}
            </div>
            <p className="mt-2 text-[12px] text-neutral-gray">Giữ nguyên nội dung chuyển khoản để admin nhận ra bạn.</p>
          </>
        ) : (
          <p className="mt-3 rounded-card bg-light-green p-3 text-[13px] text-navy">Chưa có thông tin chuyển khoản. Vui lòng liên hệ admin GreenCA để được mở khóa.</p>
        )}

        <button type="button" onClick={onClose} className="mt-4 w-full min-h-touch rounded-pill bg-primary text-white text-[14px] font-semibold">
          Đã hiểu
        </button>
      </div>
    </div>
  )
}
