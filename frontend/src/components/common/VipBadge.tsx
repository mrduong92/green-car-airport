/** Nhãn cuốc VIP — xe cá nhân, biển trắng. Dùng ở cả app khách và app tài xế. */
export default function VipBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-gold border border-gold rounded-pill px-1.5 py-0.5">
      <span className="material-symbols-outlined text-[12px]"
            style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
      VIP
    </span>
  )
}
