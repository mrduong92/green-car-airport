import clsx from 'clsx'

const MAP: Record<string, { label: string; cls: string }> = {
  pending:        { label: 'Chờ xử lý',       cls: 'bg-yellow-100 text-yellow-800' },
  finding_driver: { label: 'Đang tìm tài xế', cls: 'bg-orange-100 text-orange-700' },
  accepted:       { label: 'Đã nhận',          cls: 'bg-blue-100 text-blue-700' },
  in_progress:    { label: 'Đang chạy',        cls: 'bg-primary text-white' },
  completed:      { label: 'Hoàn thành',       cls: 'bg-gray-100 text-gray-600' },
  cancelled:      { label: 'Đã huỷ',           cls: 'bg-danger-red text-white' },
  active:         { label: 'Đang hoạt động',   cls: 'bg-success-green text-white' },
  blocked:        { label: 'Đã block',          cls: 'bg-red-900 text-white' },
  waiting_approval: { label: 'Chờ duyệt',      cls: 'bg-yellow-100 text-yellow-800' },
}

export default function StatusBadge({ status }: { status: string }) {
  const { label, cls } = MAP[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={clsx('inline-flex items-center rounded-pill px-3 py-1 text-xs font-medium', cls)}>
      {label}
    </span>
  )
}
