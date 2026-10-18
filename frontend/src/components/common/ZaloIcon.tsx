// Dấu hiệu Zalo rút gọn: bong bóng chat bo tròn có chữ "Zalo" — dùng trên nút mở Zalo (nền xanh Zalo,
// bong bóng trắng, chữ xanh). Muốn dùng logo chính thức thì thay file này bằng asset của Zalo.
export default function ZaloIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <path d="M12 2.5c5.5 0 10 3.7 10 8.3s-4.5 8.3-10 8.3c-1 0-2-.1-2.9-.4L4.6 21l.9-3.9C3.4 15.6 2 13.3 2 10.8 2 6.2 6.5 2.5 12 2.5Z" fill="#fff" />
      <text x="12" y="13.4" textAnchor="middle" fontSize="6.4" fontWeight="800" fontFamily="Inter, Arial, sans-serif" fill="#0068FF">Zalo</text>
    </svg>
  )
}
