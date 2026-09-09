import type { ComponentProps } from 'react'
import { Link } from 'react-router'

type Variant = 'primary' | 'secondary'

const variantStyles: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border border-line bg-surface text-ink hover:bg-canvas',
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: Variant
}

/** A router link styled as a button. One `primary` per view section. */
function ButtonLink({
  variant = 'primary',
  className = '',
  ...props
}: ButtonLinkProps) {
  const base =
    'inline-block rounded-card px-5 py-2.5 text-center font-medium transition-colors'

  return (
    <Link className={`${base} ${variantStyles[variant]} ${className}`} {...props} />
  )
}

export default ButtonLink
