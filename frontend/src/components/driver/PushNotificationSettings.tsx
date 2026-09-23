import { useNavigate } from 'react-router-dom'
import { usePushStatus } from '@/hooks/usePushStatus'
import { isIosDevice } from '@/hooks/usePwaInstall'
import { useUiStore } from '@/stores/ui'
import { BRAND } from '@/brand'
import type { PushResult, PushStatus } from '@/push'

const APP_LABEL = `${BRAND.name} Tài Xế`

// Đường đi gỡ chặn khác nhau theo nền tảng; nói chung chung "vào cài đặt" thì
// tài xế không tìm được.
function unblockHint(): string {
  if (isIosDevice()) return `Cài đặt iPhone › Thông báo › ${APP_LABEL} › Cho phép thông báo, rồi mở lại app.`
  if (/android/i.test(navigator.userAgent)) return `Chrome › menu ⋮ › Cài đặt › Thông báo › cho phép ${APP_LABEL}, rồi mở lại app.`
  return 'Bấm biểu tượng ổ khoá cạnh địa chỉ web › Thông báo › Cho phép, rồi tải lại trang.'
}

function resultToast(result: PushResult): { message: string; variant: 'success' | 'error' | 'info' } {
  if (result.ok) return { message: 'Đã bật thông báo cuốc mới', variant: 'success' }
  if (result.status === 'denied') return { message: 'Bạn đã từ chối. Gỡ chặn trong cài đặt rồi thử lại.', variant: 'error' }
  if (result.status === 'default') return { message: 'Bạn chưa cho phép. Bấm "Cho phép" khi trình duyệt hỏi.', variant: 'info' }
  return { message: 'Không bật được thông báo. Vui lòng thử lại sau.', variant: 'error' }
}

const STATUS_TEXT: Record<PushStatus, { title: string; desc: string; icon: string }> = {
  granted:         { icon: 'notifications_active', title: 'Thông báo cuốc mới: Đang bật', desc: 'Máy này sẽ báo ngay khi có cuốc phù hợp, kể cả khi đang tắt màn hình.' },
  default:         { icon: 'notifications_off',    title: 'Thông báo cuốc mới: Chưa bật', desc: 'Bạn sẽ không biết khi có cuốc mới nếu không mở app.' },
  denied:          { icon: 'notifications_off',    title: 'Thông báo cuốc mới: Đã bị chặn', desc: `Trình duyệt đang chặn thông báo của ${APP_LABEL}. ${unblockHint()}` },
  'not-installed': { icon: 'add_to_home_screen',   title: 'Thông báo cuốc mới: Cần cài app', desc: 'iPhone chỉ nhận thông báo khi đã thêm app vào màn hình chính.' },
  unsupported:     { icon: 'notifications_off',    title: 'Thông báo cuốc mới: Không hỗ trợ', desc: 'Trình duyệt này không nhận được thông báo đẩy. Hãy dùng Chrome (Android) hoặc Safari (iPhone).' },
  'no-key':        { icon: 'error',                title: 'Thông báo cuốc mới: Lỗi cấu hình', desc: 'Bản cài đặt này không thể đăng ký thông báo. Vui lòng báo quản trị viên.' },
}

/** Hàng cài đặt trong Hồ sơ tài xế: trạng thái đầy đủ + nút hành động. */
export function PushSettingsRow() {
  const navigate = useNavigate()
  const showToast = useUiStore((s) => s.showToast)
  const { status, busy, enable } = usePushStatus()
  const text = STATUS_TEXT[status]

  const handleEnable = async () => {
    const { message, variant } = resultToast(await enable())
    showToast(message, variant)
  }

  return (
    <div className="px-4 py-4 flex items-start gap-3">
      <span
        className={`material-symbols-outlined mt-0.5 ${status === 'granted' ? 'text-primary' : 'text-alert-orange'}`}
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        {text.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-navy">{text.title}</p>
        <p className="text-[12px] text-neutral-gray mt-0.5 leading-relaxed">{text.desc}</p>
        {status === 'default' && (
          <button
            onClick={handleEnable}
            disabled={busy}
            className="mt-2.5 h-9 px-4 rounded-pill bg-primary text-white text-[13px] font-semibold disabled:opacity-60"
          >
            {busy ? 'Đang bật...' : 'Bật thông báo'}
          </button>
        )}
        {status === 'not-installed' && (
          <button
            onClick={() => navigate('/install')}
            className="mt-2.5 h-9 px-4 rounded-pill border border-primary text-primary text-[13px] font-semibold"
          >
            Hướng dẫn cài app
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Banner nhắc trên trang Cuốc xe. Chỉ hiện khi tài xế còn có thể tự sửa được
 * (chưa bật / bị chặn / chưa cài app); trình duyệt không hỗ trợ thì nhắc cũng
 * vô ích nên ẩn.
 */
export function PushNudgeBanner() {
  const navigate = useNavigate()
  const showToast = useUiStore((s) => s.showToast)
  const { status, busy, enable } = usePushStatus()

  if (status !== 'default' && status !== 'denied' && status !== 'not-installed') return null

  const handleClick = async () => {
    if (status === 'default') {
      const { message, variant } = resultToast(await enable())
      showToast(message, variant)
    } else if (status === 'not-installed') {
      navigate('/install')
    } else {
      navigate('/driver/profile')
    }
  }

  const cta = status === 'default' ? (busy ? 'Đang bật...' : 'Bật ngay')
    : status === 'not-installed' ? 'Cài app'
    : 'Xem cách bật'

  return (
    <div className="mx-4 mt-3 rounded-card border border-alert-orange/30 bg-alert-orange/10 px-4 py-3 flex items-center gap-3">
      <span className="material-symbols-outlined text-alert-orange text-[22px] shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
        notifications_off
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-navy">Chưa nhận được thông báo cuốc mới</p>
        <p className="text-[12px] text-neutral-gray mt-0.5">
          {status === 'not-installed'
            ? 'Thêm app vào màn hình chính để được báo khi có cuốc.'
            : 'Bật thông báo để không bỏ lỡ cuốc khi đang tắt màn hình.'}
        </p>
      </div>
      <button
        onClick={handleClick}
        disabled={busy}
        className="shrink-0 h-9 px-3.5 rounded-pill bg-primary text-white text-[12px] font-semibold whitespace-nowrap disabled:opacity-60"
      >
        {cta}
      </button>
    </div>
  )
}
