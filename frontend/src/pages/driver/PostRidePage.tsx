import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import FreeRideComposer from '@/components/driver/FreeRideComposer'
import { MY_FREE_RIDES_QUERY_KEY } from '@/api/freeRides'
import { useUiStore } from '@/stores/ui'

// Màn đăng cuốc (mở từ nút + giữa thanh menu): ô nhập tin to ở đầu, công tắc Zalo, nút Đăng cuốc.
// Đăng xong về tab Free — tab tự tải lại trang 1 khi mở nên cuốc mới nằm đầu danh sách.
export default function PostRidePage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const showToast = useUiStore((s) => s.showToast)

  const onPosted = () => {
    void qc.invalidateQueries({ queryKey: ['free-rides'] })
    void qc.invalidateQueries({ queryKey: MY_FREE_RIDES_QUERY_KEY })
    showToast('Đã đăng cuốc', 'success')
    navigate('/driver/free', { replace: true })
  }

  return (
    <div className="flex-1 px-4 pt-4 pb-6">
      <FreeRideComposer onPosted={onPosted} />
    </div>
  )
}
