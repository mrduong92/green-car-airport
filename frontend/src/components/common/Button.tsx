import clsx from 'clsx'
import { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
}

const VARIANTS = {
  primary: 'bg-primary text-white active:bg-primary-dark disabled:bg-border-gray',
  outline:  'border-2 border-primary text-primary bg-transparent active:bg-light-green',
  ghost:    'text-primary bg-transparent active:bg-light-green',
  danger:   'bg-danger-red text-white active:opacity-80',
}
const SIZES = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-5 py-3 text-cta',
  lg: 'px-6 py-4 text-cta',
}

export default function Button({
  variant = 'primary', size = 'md', loading, fullWidth, className, children, disabled, ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'rounded-pill font-semibold transition-all min-h-touch flex items-center justify-center gap-2',
        VARIANTS[variant], SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading && <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>}
      {children}
    </button>
  )
}
