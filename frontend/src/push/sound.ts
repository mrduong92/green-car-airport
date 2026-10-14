// frontend/src/push/sound.ts
// Âm báo cuốc mới khi app ĐANG MỞ. Lúc app ở nền / bị tắt, hệ thống tự phát âm
// của kênh `new_ride` (res/raw/new_ride.wav — cùng file, chép lúc build).
const NEW_RIDE_SOUND = '/sounds/new_ride.wav'

export function playNewRideSound(): void {
  new Audio(NEW_RIDE_SOUND).play().catch((e) => {
    // WebView có thể chặn tự phát — khi đó dùng thông báo cục bộ trên kênh new_ride.
    console.warn('[push] không phát được âm báo cuốc mới', e)
  })
}
