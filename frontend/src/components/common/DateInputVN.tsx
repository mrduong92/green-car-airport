import { useEffect, useState } from 'react'
import dayjs from 'dayjs'

interface Props {
  value: string | undefined // ISO 'YYYY-MM-DD'; '' hoặc undefined nếu chưa chọn
  onChange: (isoDate: string) => void
  className?: string
}

// Nhập ngày dd/mm/yyyy — KHÔNG dùng <input type="date"> vì định dạng hiển thị của nó
// phụ thuộc locale trình duyệt/OS (Chrome ở locale en-US hiện mm/dd/yyyy dù trang có
// lang="vi"), dễ khiến admin nhập nhầm ngày (ca thật: "02/12" tưởng 2 tháng 12 nhưng
// bị hiểu là 12 tháng 2). Tự parse + tự thêm dấu / khi gõ số, luôn cùng 1 định dạng
// bất kể trình duyệt/OS.
export default function DateInputVN({ value, onChange, className }: Props) {
  const [text, setText] = useState(value ? dayjs(value).format('DD/MM/YYYY') : '')

  useEffect(() => {
    setText(value ? dayjs(value).format('DD/MM/YYYY') : '')
  }, [value])

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    let formatted = digits
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
    else if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`
    setText(formatted)

    if (formatted === '') { onChange(''); return }

    const m = formatted.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (!m) return
    const iso = `${m[3]}-${m[2]}-${m[1]}`
    if (dayjs(iso).isValid() && dayjs(iso).format('YYYY-MM-DD') === iso) onChange(iso)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="dd/mm/yyyy"
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      className={className}
    />
  )
}
