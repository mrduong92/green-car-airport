import { useEffect } from 'react'
import Button from './Button'

interface Props {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Không, quay lại',
  loading,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onCancel}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      {/* Sheet */}
      <div
        className="relative w-full max-w-sm mx-auto bg-white rounded-t-[24px] sm:rounded-[24px] px-5 pt-5 pb-8 shadow-card-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="w-10 h-1 rounded-full bg-border-gray mx-auto mb-4 sm:hidden" />

        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <span className="material-symbols-outlined text-danger-red text-2xl"
                style={{ fontVariationSettings: "'FILL' 1" }}>
            warning
          </span>
        </div>

        <h3 className="text-[17px] font-bold text-navy text-center leading-snug mb-2">
          {title}
        </h3>

        {description && (
          <p className="text-[13px] text-neutral-gray text-center leading-relaxed mb-5">
            {description}
          </p>
        )}

        <div className="flex flex-col gap-2.5 mt-5">
          <Button variant="danger" fullWidth loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="ghost" fullWidth onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
