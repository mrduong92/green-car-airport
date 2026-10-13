import { useState } from 'react'
import clsx from 'clsx'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FREE_ALERT_QUERY_KEY, getFreeRideAlert, saveFreeRideAlert, summarizeAlertFilters } from '@/api/freeRides'
import Button from '@/components/common/Button'
import { usePushStatus } from '@/hooks/usePushStatus'
import { useUiStore } from '@/stores/ui'
import { apiMessage } from '@/utils/apiError'

interface Props {
  filters: App.FreeRideFilters
  onClose: () => void
}

/**
 * Sheet "Báo khi có cuốc phù hợp": lưu lại ĐÚNG bộ lọc đang chọn ở tab Free (chiều, số chỗ, từ
 * khoá) làm tiêu chí nhận thông báo đẩy — không có form lọc riêng để tránh lệch với danh sách
 * đang xem. Bật công tắc mà trình duyệt chưa cho phép thông báo thì xin quyền/đăng ký push bằng
 * đúng luồng sẵn có của app tài xế (usePushStatus → push.ts), không viết lại.
 *
 * Quyết định: KHÔNG chặn việc lưu bộ lọc nếu xin quyền thông báo thất bại/bị từ chối — tài xế vẫn
 * có bộ lọc đã bật ghi nhận ở server (và có thể bật thông báo sau ở trang Hồ sơ), chỉ báo bằng
 * toast rằng thông báo trình duyệt chưa bật. Việc này cũng để sheet lưu được trong e2e dù
 * Playwright không cấp quyền notifications.
 */
export default function FreeRideAlertSheet({ filters, onClose }: Props) {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const { status: pushStatus, enable: enablePush } = usePushStatus()

  const { data: alert, isLoading } = useQuery({
    queryKey: FREE_ALERT_QUERY_KEY,
    queryFn: () => getFreeRideAlert().then((r) => r.data),
  })

  // `override` chỉ khác null sau khi người dùng tự gạt công tắc — trước đó hiển thị thẳng trạng
  // thái đã lưu từ server, không cần effect đồng bộ (tránh setState trong effect, xem
  // react-hooks/set-state-in-effect — mẫu này dùng lại cách AddAccountDialog tránh effect reset).
  const [override, setOverride] = useState<boolean | null>(null)
  const enabled = override ?? alert?.enabled ?? false

  const save = useMutation({
    mutationFn: async () => {
      if (enabled && pushStatus !== 'granted') {
        const result = await enablePush()
        if (!result.ok) {
          showToast('Đã lưu bộ lọc, nhưng chưa bật được thông báo trình duyệt — vào Hồ sơ để bật sau.', 'info')
        }
      }
      const res = await saveFreeRideAlert({
        enabled,
        direction: filters.direction ?? null,
        seats: filters.seats ?? null,
        keywords: filters.q ?? null,
      })
      return res.data
    },
    onSuccess: (data) => {
      qc.setQueryData(FREE_ALERT_QUERY_KEY, data)
      showToast(enabled ? 'Đã bật báo khi có cuốc phù hợp' : 'Đã tắt báo cuốc phù hợp', 'success')
      onClose()
    },
    onError: (err) => showToast(apiMessage(err, 'Không lưu được, thử lại sau'), 'error'),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div data-testid="free-alert-sheet" className="bg-white w-full rounded-t-2xl px-5 pt-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-border-gray mx-auto mb-4" />
        <h3 className="text-[17px] font-bold text-navy mb-1">Báo khi có cuốc phù hợp</h3>
        <p className="text-[12px] text-neutral-gray leading-relaxed mb-1">
          Dùng đúng bộ lọc đang chọn ở tab Free: <span className="font-medium text-navy">{summarizeAlertFilters({ direction: filters.direction, seats: filters.seats, q: filters.q })}</span>.
          {' '}Từ khoá được tìm đúng cụm từ bạn gõ, không tách rời từng chữ.
        </p>
        {/* Server chỉ lưu direction/seats/keywords (DriverFreeRideAlert) — khung giờ không có cột lưu,
            nên nếu không nói rõ, tài xế dễ hiểu nhầm là chọn "2 giờ tới" thì chỉ báo cuốc trong 2 giờ đó. */}
        <p className="text-[12px] text-neutral-gray leading-relaxed mb-4">
          Lưu ý: khung giờ đang lọc ở tab Free (nếu có) không áp dụng cho thông báo — cuốc mới khớp chiều/số chỗ/từ khoá sẽ báo bất kể giờ đón.
        </p>

        {isLoading ? (
          <p className="text-sm text-neutral-gray text-center py-4">Đang tải…</p>
        ) : (
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-navy">Nhận thông báo đẩy</p>
              <p className="text-[12px] text-neutral-gray">Có cuốc Free mới khớp bộ lọc trên sẽ báo ngay, kể cả khi tắt màn hình.</p>
            </div>
            <button
              type="button"
              data-testid="free-alert-toggle"
              role="switch"
              aria-checked={enabled}
              onClick={() => setOverride(!enabled)}
              className={clsx(
                'relative w-[52px] h-[30px] rounded-full transition-colors duration-200 shrink-0 focus:outline-none',
                enabled ? 'bg-success-green' : 'bg-neutral-gray/40',
              )}
            >
              <span
                className={clsx(
                  'absolute top-[3px] w-6 h-6 bg-white rounded-full shadow-md transition-all duration-200',
                  enabled ? 'left-[23px]' : 'left-[3px]',
                )}
              />
            </button>
          </div>
        )}

        <Button
          data-testid="free-alert-save"
          fullWidth
          className="mt-4"
          loading={save.isPending}
          disabled={isLoading || save.isPending}
          onClick={() => save.mutate()}
        >
          Lưu
        </Button>
      </div>
    </div>
  )
}
