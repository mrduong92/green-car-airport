import type { KeyboardEvent, RefObject } from 'react'

export default function OtpInputs({
  otp,
  otpRefs,
  onChange,
  onKeyDown,
  countdown,
  onResend,
}: {
  otp: string[]
  otpRefs: RefObject<(HTMLInputElement | null)[]>
  onChange: (idx: number, val: string) => void
  onKeyDown: (idx: number, e: KeyboardEvent) => void
  countdown: number
  onResend: () => void
}) {
  return (
    <>
      <div className="flex gap-2 justify-center">
        {otp.map((d, i) => (
          <input
            key={i}
            ref={(el) => { otpRefs.current[i] = el }}
            type="tel"
            maxLength={1}
            value={d}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            className="w-12 h-14 text-center text-xl font-bold border-[1.5px] border-border-gray rounded-input outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,106,54,0.18)] text-navy transition-shadow"
          />
        ))}
      </div>

      <p className="text-center text-sm text-neutral-gray">
        {countdown > 0
          ? `Gửi lại mã sau ${countdown}s`
          : (
            <button onClick={onResend} className="text-primary font-medium">
              Gửi lại mã OTP
            </button>
          )
        }
      </p>
    </>
  )
}
