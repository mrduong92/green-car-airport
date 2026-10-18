import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import clsx from 'clsx'
import { acceptRidePostTerms, postFreeRide } from '@/api/freeRides'
import { BRAND } from '@/brand'
import ZaloIcon from '@/components/common/ZaloIcon'
import RidePostTermsSheet from '@/components/driver/RidePostTermsSheet'
import { useUiStore } from '@/stores/ui'
import { apiMessage, type ApiError } from '@/utils/apiError'

const MAX_LENGTH = 1000
const ZALO_KEY = 'free-ride-post-zalo'

// Người đăng chọn có cho tài xế khác nhắn Zalo hay không (nút Gọi luôn có) — nhớ cho lần đăng sau.
function loadZalo(): boolean {
  try { return localStorage.getItem(ZALO_KEY) !== '0' } catch { return true }
}

interface Props {
  onPosted: (ride: App.FreeRide) => void
}

// Đăng cuốc: gõ tin tự do như trên nhóm Zalo → Đăng cuốc. Không chia ô, không bước duyệt — AI tách trường ở server.
export default function FreeRideComposer({ onPosted }: Props) {
  const showToast = useUiStore((s) => s.showToast)
  const [text, setText] = useState('')
  const [termsOpen, setTermsOpen] = useState(false)
  const [allowZalo, setAllowZalo] = useState(loadZalo)

  const toggleZalo = () => {
    const on = !allowZalo
    setAllowZalo(on)
    try { localStorage.setItem(ZALO_KEY, on ? '1' : '0') } catch { /* trình duyệt chặn lưu → chỉ mất ghi nhớ */ }
  }

  const post = useMutation({
    mutationFn: (body: string) => postFreeRide(body, allowZalo).then((r) => r.data),
    onSuccess: (ride) => {
      setText('')
      onPosted(ride)
    },
    onError: (err) => {
      // Giữ nguyên nội dung ô để gửi lại.
      if ((err as ApiError)?.response?.data?.code === 'ride_post_terms_required') {
        setTermsOpen(true)
        return
      }
      showToast(apiMessage(err, 'Chưa đăng được, kiểm tra mạng rồi thử lại'), 'error')
    },
  })

  const agree = useMutation({
    mutationFn: acceptRidePostTerms,
    onSuccess: () => { setTermsOpen(false); post.mutate(text.trim()) },
    onError: (err) => showToast(apiMessage(err, 'Không lưu được, thử lại sau'), 'error'),
  })

  const trimmed = text.trim()

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="relative rounded-card bg-white border-2 border-primary/25 focus-within:border-primary shadow-card transition-colors">
          <textarea
            data-testid="free-ride-compose"
            // Màn này chỉ để gõ cuốc: vào là gõ được ngay.
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
            rows={7}
            aria-label="Nội dung cuốc"
            placeholder={'Gõ cuốc như nhắn trong nhóm Zalo, ví dụ:\nTiễn Mỹ Đình 15h mai, xe 5 chỗ, 250k'}
            className="block w-full resize-none rounded-card bg-transparent px-4 pt-4 pb-8 text-[16px] leading-[24px] text-navy placeholder:text-neutral-dim outline-none"
          />
          <span className="absolute right-3 bottom-2 text-[11px] text-neutral-dim">{text.length}/{MAX_LENGTH}</span>
        </div>
        <p className="text-[12px] leading-[17px] text-neutral-gray px-1">
          Ghi giờ đón, điểm đón – điểm đến, số chỗ, giá. Số điện thoại trong tin sẽ tự bị che.
        </p>

        <button type="button" role="switch" aria-checked={allowZalo} data-testid="free-ride-zalo-toggle" onClick={toggleZalo}
          className="flex items-center gap-3 rounded-card bg-white px-4 py-3 text-left shadow-card">
          <span className={clsx('shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors', allowZalo ? 'bg-zalo' : 'bg-neutral-dim')}>
            <ZaloIcon size={22} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] font-semibold text-navy">Cho tài xế khác nhắn Zalo</span>
            <span className="block text-[12px] text-neutral-gray">
              {allowZalo ? 'Hiện nút Gọi và nút Zalo tới số của bạn' : 'Chỉ hiện nút Gọi tới số của bạn'}
            </span>
          </span>
          <span aria-hidden className={clsx('relative shrink-0 w-11 h-6 rounded-full transition-colors', allowZalo ? 'bg-primary' : 'bg-border-gray')}>
            <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', allowZalo && 'translate-x-5')} />
          </span>
        </button>

        <button type="button" data-testid="free-ride-send"
          onClick={() => post.mutate(trimmed)} disabled={trimmed === '' || post.isPending}
          className="mt-1 w-full min-h-[52px] rounded-pill bg-primary text-white text-cta flex items-center justify-center gap-2 shadow-card active:scale-[0.98] transition-transform disabled:bg-border-gray disabled:text-neutral-gray disabled:shadow-none">
          <span className="material-symbols-outlined text-[20px]">{post.isPending ? 'hourglass_top' : 'send'}</span>
          {post.isPending ? 'Đang đăng…' : 'Đăng cuốc'}
        </button>
        <p className="text-center text-[12px] text-neutral-gray">Cuốc hiện ngay cho mọi tài xế {BRAND.name}.</p>
      </div>
      {termsOpen && <RidePostTermsSheet loading={agree.isPending || post.isPending} onAgree={() => agree.mutate()} onClose={() => setTermsOpen(false)} />}
    </>
  )
}
