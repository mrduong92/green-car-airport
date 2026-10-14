// frontend/src/components/common/AppVersionGate.tsx
import { useState, type ReactNode } from 'react'
import { useAppVersionGate } from '@/hooks/useAppVersionGate'
import { BRAND } from '@/brand'

// Điều hướng sang URL ngoài: Capacitor chuyển cho hệ thống mở (Play Store / trình duyệt).
const openStore = (url: string) => { window.location.href = url }

export default function AppVersionGate({ app, children }: { app: 'customer' | 'driver'; children: ReactNode }) {
  const gate = useAppVersionGate(app)
  const [dismissed, setDismissed] = useState(false)

  if (gate.state === 'blocked') {
    return (
      <div className="min-h-screen bg-warm-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="material-symbols-outlined text-primary text-[56px]">system_update</span>
        <h1 className="text-h2 text-navy font-semibold">Đã có phiên bản mới</h1>
        <p className="text-sm text-neutral-gray">
          Phiên bản {BRAND.name} trên máy bạn đã cũ. Vui lòng cập nhật để tiếp tục sử dụng.
        </p>
        <button onClick={() => openStore(gate.storeUrl)}
          className="min-h-touch w-full max-w-xs rounded-pill bg-primary text-white font-semibold">
          Cập nhật ngay
        </button>
      </div>
    )
  }

  return (
    <>
      {gate.state === 'soft' && !dismissed && (
        <div className="fixed top-0 inset-x-0 z-50 bg-light-green text-navy text-sm px-4 py-2 flex items-center gap-2 shadow-card">
          <span className="flex-1">Có phiên bản mới của {BRAND.name}.</span>
          <button onClick={() => openStore(gate.storeUrl)} className="font-semibold text-primary">Cập nhật</button>
          <button onClick={() => setDismissed(true)} aria-label="Đóng"
            className="material-symbols-outlined text-[18px] text-neutral-gray">close</button>
        </div>
      )}
      {children}
    </>
  )
}
