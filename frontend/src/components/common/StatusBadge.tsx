import clsx from 'clsx'

const MAP: Record<string, { label: string; cls: string }> = {
  pending:          { label: 'Chờ xử lý',       cls: 'bg-alert-orange/15 text-alert-orange' },
  finding_driver:   { label: 'Đang tìm tài xế', cls: 'bg-alert-orange/15 text-alert-orange' },
  accepted:         { label: 'Đã nhận',          cls: 'bg-primary-tint text-primary' },
  picking_up:       { label: 'Đang đến đón',     cls: 'bg-primary-tint text-primary' },
  in_progress:      { label: 'Đang chạy',        cls: 'bg-primary text-white' },
  completed:        { label: 'Hoàn thành',       cls: 'bg-success-green/15 text-success-green' },
  cancelled:        { label: 'Đã huỷ',           cls: 'bg-danger-red text-white' },
  active:           { label: 'Đang hoạt động',   cls: 'bg-success-green text-white' },
  blocked:          { label: 'Đã block',          cls: 'bg-danger-red text-white' },
  waiting_approval: { label: 'Chờ duyệt',        cls: 'bg-alert-orange/15 text-alert-orange' },
}

export default function StatusBadge({ status }: { status: string }) {
  const { label, cls } = MAP[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={clsx('inline-flex items-center rounded-pill px-3 py-1 text-xs font-medium', cls)}>
      {label}
    </span>
  )
}
