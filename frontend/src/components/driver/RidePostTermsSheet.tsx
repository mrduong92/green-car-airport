interface Props {
  loading: boolean
  onAgree: () => void
  onClose: () => void
}

const RULES = [
  'Bạn chịu trách nhiệm về nội dung cuốc mình đăng.',
  'Chỉ đăng cuốc có thật, bạn trực tiếp phụ trách hoặc được khách nhờ điều phối.',
  'Không đăng số điện thoại/thông tin cá nhân của người khác — số điện thoại trong tin sẽ tự bị che.',
  'Liên hệ hiển thị cho tài xế khác là số điện thoại tài khoản của bạn.',
  'Cuốc sai sự thật hoặc spam có thể bị gỡ và khoá quyền đăng.',
]

export default function RidePostTermsSheet({ loading, onAgree, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div data-testid="ride-post-terms" className="bg-white w-full rounded-t-2xl pb-6 pt-5 px-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[16px] font-semibold text-navy mb-2">Quy định đăng cuốc</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1.5 text-[13px] text-navy">
          {RULES.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <button type="button" onClick={onAgree} disabled={loading}
          className="mt-4 w-full min-h-touch rounded-pill bg-primary text-white text-[14px] font-semibold disabled:opacity-60">
          {loading ? 'Đang gửi…' : 'Đồng ý và đăng cuốc'}
        </button>
        <button type="button" onClick={onClose} className="mt-2 w-full min-h-touch text-[14px] text-neutral-gray">Để sau</button>
      </div>
    </div>
  )
}
