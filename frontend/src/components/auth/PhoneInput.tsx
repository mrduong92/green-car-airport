export default function PhoneInput({
  value,
  onChange,
  onEnter,
}: {
  value: string
  onChange: (v: string) => void
  onEnter?: () => void
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-neutral-gray uppercase tracking-wider mb-2">Số điện thoại</p>
      <div
        className="flex items-center bg-white overflow-hidden h-[52px]"
        style={{ border: '1.5px solid #006a36', borderRadius: 8, boxShadow: '0 0 0 4px rgba(0,106,54,0.18)' }}
      >
        <span className="px-4 text-navy font-semibold text-sm border-r border-border-gray h-full flex items-center">🇻🇳 +84</span>
        <input
          type="tel"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
          placeholder="9xx xxx xxx"
          className="flex-1 px-4 outline-none text-navy text-[17px] font-semibold tracking-wider bg-transparent"
        />
      </div>
    </div>
  )
}
