import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import clsx from 'clsx'
import { acceptRidePostTerms, postFreeRide } from '@/api/freeRides'
import RidePostTermsSheet from '@/components/driver/RidePostTermsSheet'
import { useUiStore } from '@/stores/ui'
import { apiMessage, type ApiError } from '@/utils/apiError'

const MAX_LENGTH = 1000
const ZALO_KEY = 'free-ride-post-zalo'

// Cụm tài xế hay gõ nhất — bấm là chèn vào tin, như trả lời nhanh trên Zalo.
const QUICK_CHIPS = ['Tiễn sân bay', 'Đón sân bay', 'Xe 5 chỗ', 'Xe 7 chỗ', 'Đi luôn', 'Free']

// Người đăng chọn có cho tài xế khác nhắn Zalo hay không (nút Gọi luôn có) — nhớ cho lần đăng sau.
function loadZalo(): boolean {
  try { return localStorage.getItem(ZALO_KEY) !== '0' } catch { return true }
}

interface Props {
  onPosted: (ride: App.FreeRide) => void
  // Tin đang gửi (để màn chat vẽ bong bóng "Đang gửi…" ngay); null khi gửi xong/lỗi.
  onSending?: (text: string | null) => void
}

// Đăng cuốc như gửi tin Zalo: gõ → Gửi. Không form, không bước duyệt — AI tách trường ở server.
export default function FreeRideComposer({ onPosted, onSending }: Props) {
  const showToast = useUiStore((s) => s.showToast)
  const [text, setText] = useState('')
  const [termsOpen, setTermsOpen] = useState(false)
  const [allowZalo, setAllowZalo] = useState(loadZalo)

  const toggleZalo = () => {
    const on = !allowZalo
    setAllowZalo(on)
    try { localStorage.setItem(ZALO_KEY, on ? '1' : '0') } catch { /* trình duyệt chặn lưu → chỉ mất ghi nhớ */ }
    showToast(on ? 'Tài xế khác gọi hoặc nhắn Zalo được cho bạn' : 'Tài xế khác chỉ gọi được cho bạn', 'success')
  }

  const post = useMutation({
    mutationFn: (body: string) => postFreeRide(body, allowZalo).then((r) => r.data),
    onMutate: (body) => onSending?.(body),
    onSuccess: (ride) => {
      setText('')
      onSending?.(null)
      onPosted(ride)
    },
    onError: (err) => {
      onSending?.(null)
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

  const insert = (chip: string) => setText((t) => (t.trim() === '' ? chip : `${t.trimEnd()} ${chip}`).slice(0, MAX_LENGTH))

  const trimmed = text.trim()
  const rows = Math.min(5, Math.max(1, text.split('\n').length))

  return (
    <>
      <div className="shrink-0 bg-white border-t border-border-soft safe-bottom">
        <div className="flex gap-1.5 overflow-x-auto px-3 pt-2 pb-1 [scrollbar-width:none]">
          {QUICK_CHIPS.map((chip) => (
            <button key={chip} type="button" data-testid="quick-chip" onClick={() => insert(chip)}
              className="shrink-0 rounded-pill border border-primary/20 bg-light-green px-3 py-1.5 text-[12px] font-medium text-primary active:bg-primary active:text-white">
              {chip}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-1.5 px-2 pt-1 pb-2">
          <button type="button" role="switch" aria-checked={allowZalo} data-testid="free-ride-zalo-toggle" onClick={toggleZalo}
            aria-label={allowZalo ? 'Đang cho nhắn Zalo, bấm để tắt' : 'Đang tắt nhắn Zalo, bấm để bật'}
            className={clsx('relative shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-[11px] font-bold tracking-tight transition-colors',
              allowZalo ? 'bg-light-green text-primary' : 'bg-warm-white text-neutral-gray')}>
            Zalo
            {!allowZalo && <span aria-hidden className="absolute w-8 h-[2px] bg-neutral-gray rotate-[-35deg] rounded-full" />}
          </button>
          <textarea
            data-testid="free-ride-compose"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
            rows={rows}
            placeholder="Gõ cuốc như nhắn Zalo…"
            className="flex-1 min-w-0 resize-none rounded-[22px] bg-warm-white border border-transparent px-4 py-[11px] text-[15px] leading-[21px] text-navy outline-none focus:border-primary/40 focus:bg-white"
          />
          <button type="button" data-testid="free-ride-send" aria-label="Gửi cuốc"
            onClick={() => post.mutate(trimmed)} disabled={trimmed === '' || post.isPending}
            className="shrink-0 w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center transition-transform active:scale-90 disabled:bg-border-gray disabled:text-neutral-gray">
            <span className="material-symbols-outlined text-[20px] -rotate-12 translate-x-[1px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              {post.isPending ? 'hourglass_top' : 'send'}
            </span>
          </button>
        </div>
      </div>
      {termsOpen && <RidePostTermsSheet loading={agree.isPending || post.isPending} onAgree={() => agree.mutate()} onClose={() => setTermsOpen(false)} />}
    </>
  )
}
