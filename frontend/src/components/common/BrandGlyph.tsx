// Logo mark GreenCA — monogram chữ G dạng stroke.
//
// Hình học (grid 48×48): đường tròn tâm (24,24) r=15, stroke-width 6, cap tròn.
// Cung 325° ngược chiều kim đồng hồ từ θ=35° đến θ=0°, chừa gap 35° ở góc
// trên-phải, rồi `H26` kéo gạch ngang thụt vào tâm.
//
// Màu lấy theo `currentColor` — component chỉ vẽ chữ G, phần nền/bo góc do
// container ở chỗ gọi lo (xem AuthShell, AppHeader, AdminLayout, SplashPage).
// Bản có nền gradient nằm ở asset tĩnh: public/favicon.svg + public/icons/*.png
export const G_PATH = 'M36.29 15.4A15 15 0 1 0 39 24H26'

export default function BrandGlyph({
  size = 24,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d={G_PATH}
        stroke="currentColor"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
