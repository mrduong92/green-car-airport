interface Props {
  instructions: string | null
  onClose: () => void
}

export default function FreeRideUnlockSheet({ instructions, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div data-testid="free-unlock-sheet" className="bg-white w-full rounded-t-2xl pb-6 pt-5 px-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-primary text-[22px]">lock</span>
          <h2 className="text-[16px] font-semibold text-navy">Mở khóa Nhận cuốc</h2>
        </div>
        <p className="text-[14px] text-navy">
          Bạn vẫn xem được toàn bộ cuốc Free. Để liên hệ người bắn cuốc qua Zalo, cần mở khóa theo năm.
        </p>
        {instructions && (
          <p data-testid="free-unlock-instructions" className="mt-3 rounded-card bg-light-green p-3 text-[13px] text-navy whitespace-pre-line">{instructions}</p>
        )}
        <p className="mt-3 text-[12px] text-neutral-gray">Sau khi admin xác nhận, mở lại tab Free là nút Nhận cuốc dùng được.</p>
        <button type="button" onClick={onClose} className="mt-4 w-full min-h-touch rounded-pill bg-primary text-white text-[14px] font-semibold">
          Đã hiểu
        </button>
      </div>
    </div>
  )
}
