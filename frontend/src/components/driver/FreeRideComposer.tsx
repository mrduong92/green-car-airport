import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { acceptRidePostTerms, postFreeRide } from '@/api/freeRides'
import RidePostTermsSheet from '@/components/driver/RidePostTermsSheet'
import { useUiStore } from '@/stores/ui'
import { apiMessage, type ApiError } from '@/utils/apiError'

const MAX_LENGTH = 1000

interface Props {
  onPosted: (ride: App.FreeRide) => void
}

// Đăng cuốc như gửi tin Zalo: gõ → Gửi. Không form, không bước duyệt — AI tách trường ở server.
export default function FreeRideComposer({ onPosted }: Props) {
  const showToast = useUiStore((s) => s.showToast)
  const [text, setText] = useState('')
  const [termsOpen, setTermsOpen] = useState(false)

  const post = useMutation({
    mutationFn: (body: string) => postFreeRide(body, true).then((r) => r.data),
    onSuccess: (ride) => {
      setText('')
      onPosted(ride)
      showToast('Đã đăng cuốc', 'success')
    },
    onError: (err) => {
      // Giữ nguyên nội dung ô để gửi lại.
      if ((err as ApiError)?.response?.data?.code === 'ride_post_terms_required') {
        setTermsOpen(true)
        return
      }
      showToast(apiMessage(err, 'Chưa gửi được, kiểm tra mạng rồi thử lại'), 'error')
    },
  })

  const agree = useMutation({
    mutationFn: acceptRidePostTerms,
    onSuccess: () => { setTermsOpen(false); post.mutate(text.trim()) },
    onError: (err) => showToast(apiMessage(err, 'Không lưu được, thử lại sau'), 'error'),
  })

  const trimmed = text.trim()
  const rows = Math.min(5, Math.max(1, text.split('\n').length))

  return (
    <>
      <div className="sticky bottom-0 z-10 bg-white border-t border-border-gray px-3 py-2 flex items-end gap-2">
        <textarea
          data-testid="free-ride-compose"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
          rows={rows}
          placeholder="Gõ cuốc như trên Zalo: Tiễn Mỹ Đình 15h mai xe 5 250k"
          className="flex-1 resize-none rounded-input border border-border-gray px-3 py-2 text-[14px] text-navy outline-none focus:border-primary"
        />
        <button type="button" data-testid="free-ride-send" aria-label="Gửi cuốc"
          onClick={() => post.mutate(trimmed)} disabled={trimmed === '' || post.isPending}
          className="shrink-0 min-w-touch min-h-touch rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-40">
          <span className="material-symbols-outlined text-[22px]">{post.isPending ? 'hourglass_top' : 'send'}</span>
        </button>
      </div>
      {termsOpen && <RidePostTermsSheet loading={agree.isPending || post.isPending} onAgree={() => agree.mutate()} onClose={() => setTermsOpen(false)} />}
    </>
  )
}
