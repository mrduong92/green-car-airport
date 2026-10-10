import { Capacitor } from '@capacitor/core'

/**
 * Đang chạy trong vỏ app native (Capacitor) hay trình duyệt.
 *
 * Mọi nhánh native/web PHẢI đi qua hàm này hoặc một facade dùng nó — không rải
 * `Capacitor.*` khắp code, để thay vỏ app sau này chỉ phải sửa các facade.
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}
