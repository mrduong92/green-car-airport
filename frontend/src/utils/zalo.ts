// frontend/src/utils/zalo.ts
export const zaloLink = (phone: string) => `https://zalo.me/${phone.replace(/^0/, '84')}`

// Link mở trang cá nhân Zalo của người bắn cuốc. Backend trả zalo://qr/p/<mã> — iOS mở được, nhưng Zalo
// Android chỉ nhận scheme zalo:// với host zaloapp.com, bấm link host "qr" không mở gì. Trên Android
// dùng đúng intent mà chính trang zaloapp.com/qr/p/<mã> tự dùng, kèm trang web đó làm dự phòng khi
// máy chưa cài Zalo.
export function zaloProfileHref(contactUrl: string, userAgent: string = navigator.userAgent): string {
  const m = /^zalo:\/\/qr\/p\/([A-Za-z0-9]+)$/.exec(contactUrl)
  if (!m || !/Android/i.test(userAgent)) return contactUrl
  const fallback = encodeURIComponent(`https://zaloapp.com/qr/p/${m[1]}`)
  return `intent://zaloapp.com/qr/p/${m[1]}#Intent;scheme=zalo;action=android.intent.action.VIEW;`
    + `category=android.intent.category.BROWSABLE;package=com.zing.zalo;S.browser_fallback_url=${fallback};end`
}
