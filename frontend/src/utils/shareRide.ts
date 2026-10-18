import { BRAND } from '@/brand'

// Chia sẻ cuốc ra Zalo/ứng dụng khác bằng bảng chia sẻ của hệ điều hành — người dùng tự chọn nơi gửi
// và tự bấm gửi. Không hỗ trợ (máy tính, WebView Android) → sao chép. Không bao giờ coi là "đã gửi Zalo".
export async function shareRide(ride: App.FreeRide): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const text = `${ride.raw_text ?? ''}\n\nNhận cuốc trên ${BRAND.name}: ${window.location.origin}/driver/free`
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // Lỗi khác (NotAllowedError…) → thử sao chép.
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
