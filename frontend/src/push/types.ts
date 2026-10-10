/**
 * Trạng thái web push trên máy này, để UI hiện đúng và gợi đúng hành động.
 *
 * - `granted`       đã cấp quyền — subscription sẽ được đồng bộ lên server
 * - `default`       chưa hỏi bao giờ — cần một cú chạm của người dùng để xin
 * - `denied`        người dùng đã chặn — trình duyệt không hỏi lại, phải tự gỡ
 *                   chặn trong cài đặt
 * - `not-installed` iPhone mở trong Safari thường — Apple chỉ cho push khi app
 *                   đã thêm vào màn hình chính
 * - `unsupported`   trình duyệt không có Push API
 * - `no-key`        bundle build thiếu VITE_VAPID_PUBLIC_KEY (lỗi build, không
 *                   phải lỗi người dùng — vite.config.ts chặn ở mode production)
 */
export type PushStatus = 'granted' | 'default' | 'denied' | 'not-installed' | 'unsupported' | 'no-key'

export type PushResult = { ok: true } | { ok: false; status: PushStatus | 'error' }
