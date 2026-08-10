import { useMutation } from '@tanstack/react-query'
import { logout as logoutApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { unregisterPushSubscription } from '@/push'

// NGUỒN DUY NHẤT cho logout — trước đây mỗi trang tự viết useMutation({ mutationFn:
// logout, onSettled: clearAuth }) riêng, 3/4 nơi quên gọi unregisterPushSubscription()
// nên tài xế/khách logout rồi vẫn nhận push (subscription + device_token vẫn còn).
//
// unregisterPushSubscription() PHẢI chạy TRƯỚC logoutApi(), không phải sau: backend
// AuthController::logout() xoá currentAccessToken() ngay lập tức, nên nếu gọi
// DELETE /api/device-token sau đó thì luôn 401 (token đã bị revoke) — lỗi bị nuốt âm
// thầm (unregisterPushSubscription tự catch), nên trước giờ device_token không bao
// giờ thực sự bị xoá kể cả ở luồng logout gọi đúng hàm.
export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clearAuth)

  return useMutation({
    mutationFn: async () => {
      await unregisterPushSubscription()
      await logoutApi()
    },
    onSettled: () => { clearAuth() },
  })
}
