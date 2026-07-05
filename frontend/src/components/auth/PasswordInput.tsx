import type { RefObject } from 'react'

export default function PasswordInput({
  label,
  value,
  onChange,
  show,
  onToggle,
  onEnter,
  inputRef,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
  onEnter?: () => void
  inputRef?: RefObject<HTMLInputElement | null>
  hint?: string
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">{label}</p>
      <div className="relative">
        <input
          ref={inputRef}
          type={show ? 'text' : 'password'}
          inputMode="numeric"
          maxLength={6}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
          placeholder="••••••"
          className="w-full h-[52px] border-[1.5px] border-primary rounded-input px-4 pr-12 text-navy text-2xl tracking-[0.4em] outline-none focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] transition-shadow"
          style={{ fontFamily: 'monospace' }}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-gray"
        >
          <span className="material-symbols-outlined text-[20px]">
            {show ? 'visibility_off' : 'visibility'}
          </span>
        </button>
      </div>
      {hint && <p className="text-[11px] text-neutral-gray mt-1.5">{hint}</p>}
    </div>
  )
}
