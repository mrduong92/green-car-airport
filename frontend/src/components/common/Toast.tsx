import { useUiStore } from '@/stores/ui'
import clsx from 'clsx'

const ICONS = { success: 'check_circle', error: 'cancel', info: 'info' }
const COLORS = { success: 'text-success-green', error: 'text-danger-red', info: 'text-blue-400' }

export default function ToastContainer() {
  const { toasts, removeToast } = useUiStore()
  return (
    <div className="fixed bottom-24 left-0 right-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => removeToast(t.id)}
          className="flex items-center gap-2 bg-navy text-white rounded-pill px-4 py-3 shadow-card pointer-events-auto cursor-pointer"
        >
          <span className={clsx('material-symbols-outlined text-xl', COLORS[t.variant])}>
            {ICONS[t.variant]}
          </span>
          <span className="text-sm">{t.message}</span>
        </div>
      ))}
    </div>
  )
}
