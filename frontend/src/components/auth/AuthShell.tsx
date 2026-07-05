import type { ReactNode } from 'react'
import ToastContainer from '@/components/common/Toast'

export default function AuthShell({
  title,
  sub,
  onBack,
  brandSub = 'Airport Transfer',
  children,
}: {
  title: string
  sub: string
  onBack: () => void
  brandSub?: string
  children: ReactNode
}) {
  return (
    <div className="min-h-svh bg-white flex flex-col w-full">
      <ToastContainer />
      {/* Top bar */}
      <div className="px-4 pt-14 pb-2 safe-top flex items-center">
        <button onClick={onBack} className="w-10 h-10 flex items-center justify-center text-navy">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      </div>

      <div className="flex-1 px-6 pt-4 flex flex-col gap-6">
        {/* Brand + heading */}
        <div>
          <div className="flex items-center gap-3 mb-7">
            <div className="w-12 h-12 rounded-logo bg-primary-tint flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 26, fontVariationSettings: "'FILL' 1" }}>
                directions_car
              </span>
            </div>
            <div>
              <p className="text-primary font-bold text-[20px] leading-none tracking-tight">Save Go</p>
              <p className="text-neutral-gray text-[11px] tracking-widest uppercase mt-0.5">{brandSub}</p>
            </div>
          </div>
          <h1 className="text-navy font-bold text-[28px] leading-tight mb-2">{title}</h1>
          <p className="text-neutral-gray text-sm">{sub}</p>
        </div>

        {children}
      </div>
    </div>
  )
}
