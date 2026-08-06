// Single source of truth cho tên thương hiệu.
//
// File này được import bởi CẢ `src/*` (browser) và `vite.config.ts` (Node),
// nên KHÔNG được import gì và không chạm vào `window`/`process`.
// Đổi tên app = sửa ở đây (+ `APP_NAME` trong backend/.env).

export const BRAND = {
  name:         'GreenCA',
  tagline:      'AIRPORT TRANSFER · VIETNAM',
  legalName:    'GreenCA Co.',
  supportEmail: 'support@greenca.vn',
  zaloOa:       'GreenCA',
  domain:       'greenca.vn',
} as const
