import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { acceptTermsApi, getMe } from '@/api/auth'
import { getPublicPage } from '@/api/staticPages'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useLogout } from '@/hooks/useLogout'
import { CONTENT_CLASS } from '@/components/admin/TiptapEditor'
import Button from '@/components/common/Button'

/**
 * Chặn khách/tài xế chưa đồng ý phiên bản Điều khoản sử dụng hiện hành.
 *
 * Mỗi lần mở app hỏi lại `/auth/me` — user lưu trong localStorage từ bản app cũ
 * không có cờ `needs_terms_acceptance`, nên phải lấy từ server thì người dùng
 * cũ mới gặp màn đồng ý. Trong lúc chờ (cờ còn undefined) vẫn cho vào app,
 * không bắt người dùng nhìn spinner vì một lần gọi mạng.
 */
export default function TermsGate({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const setAuth = useAuthStore((s) => s.setAuth)

  useEffect(() => {
    if (!token || user?.role === 'admin') return
    getMe().then((r) => setAuth(r.data, token)).catch(() => {})
    // Chỉ một lần khi vào khu vực đã đăng nhập.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (user?.needs_terms_acceptance) return <TermsScreen />
  return <>{children}</>
}

function TermsScreen() {
  const token = useAuthStore((s) => s.token)
  const setAuth = useAuthStore((s) => s.setAuth)
  const showToast = useUiStore((s) => s.showToast)
  const logoutMutation = useLogout()
  const [agreed, setAgreed] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['static-page', 'terms'],
    queryFn: () => getPublicPage('terms'),
  })

  const acceptMutation = useMutation({
    mutationFn: acceptTermsApi,
    onSuccess: (r) => setAuth(r.data, token!),
    onError: () => showToast('Không gửi được xác nhận, vui lòng thử lại.', 'error'),
  })

  return (
    // h-svh (không phải min-h): chỉ phần nội dung cuộn, ô tích + nút luôn nằm ở đáy.
    <div className="h-svh w-full bg-white flex flex-col">
      <div className="px-6 pt-14 pb-3 safe-top border-b border-border-gray">
        <h1 className="text-navy font-bold text-[22px]">{data?.title ?? 'Điều khoản sử dụng'}</h1>
        <p className="text-neutral-gray text-sm mt-1">
          Vui lòng đọc và đồng ý với Điều khoản sử dụng để tiếp tục dùng ứng dụng.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-neutral-gray text-sm">Không tải được nội dung điều khoản.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Thử lại</Button>
          </div>
        )}

        {data && (
          <div
            className={clsx('text-sm text-navy leading-relaxed', CONTENT_CLASS)}
            dangerouslySetInnerHTML={{ __html: data.content }}
          />
        )}
      </div>

      <div className="px-6 pt-3 pb-6 safe-bottom border-t border-border-gray flex flex-col gap-3 bg-white">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={!data}
            className="w-5 h-5 mt-0.5 accent-primary shrink-0"
          />
          <span className="text-sm text-navy leading-snug">
            Tôi đã đọc, hiểu và đồng ý với toàn bộ Điều khoản sử dụng của ứng dụng.
          </span>
        </label>

        <Button
          fullWidth
          size="lg"
          disabled={!agreed || !data}
          loading={acceptMutation.isPending}
          onClick={() => acceptMutation.mutate()}
        >
          Đồng ý
        </Button>

        <button
          onClick={() => logoutMutation.mutate()}
          className="text-neutral-gray text-sm py-2"
        >
          Không đồng ý, đăng xuất
        </button>
      </div>
    </div>
  )
}
