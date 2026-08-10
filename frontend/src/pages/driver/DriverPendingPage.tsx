import { useLogout } from '@/hooks/useLogout'
import ToastContainer from '@/components/common/Toast'
import Button from '@/components/common/Button'

export default function DriverPendingPage() {
  const logoutMutation = useLogout()

  return (
    <div className="min-h-svh bg-warm-white flex flex-col items-center justify-center px-6 text-center gap-6">
      <ToastContainer />

      <div className="w-20 h-20 rounded-full bg-primary-tint flex items-center justify-center">
        <span className="material-symbols-outlined text-primary text-[40px]"
              style={{ fontVariationSettings: "'FILL' 1" }}>
          pending
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-[22px] font-bold text-navy leading-tight">
          Hồ sơ đang chờ xét duyệt
        </h1>
        <p className="text-sm text-neutral-gray leading-relaxed max-w-xs mx-auto">
          Chúng tôi sẽ xem xét hồ sơ và giấy tờ của bạn trong vòng
          <strong className="text-navy"> 24–48 giờ</strong> làm việc.
        </p>
      </div>

      <div className="w-full max-w-xs flex flex-col gap-3">
        <div className="bg-white rounded-card shadow-card p-4 flex flex-col gap-2 text-left">
          {[
            'Giấy tờ đã nộp sẽ được kiểm tra',
            'Admin sẽ kích hoạt tài khoản sau khi duyệt',
            'Bạn sẽ nhận được thông báo khi được duyệt',
          ].map((text) => (
            <div key={text} className="flex items-start gap-2">
              <span className="material-symbols-outlined text-primary text-[16px] mt-0.5 shrink-0"
                    style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <p className="text-[13px] text-navy">{text}</p>
            </div>
          ))}
        </div>

        <Button
          fullWidth
          variant="outline"
          loading={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate()}
        >
          Đăng xuất
        </Button>
      </div>
    </div>
  )
}
