import type { ComponentProps } from 'react'

type Variant = 'primary' | 'secondary'

const variantStyles: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border border-line bg-surface text-ink hover:bg-canvas',
}

type ButtonProps = ComponentProps<'button'> & {
  variant?: Variant
}

/**
 * A real `<button>`, matching {@link ../ui/ButtonLink ButtonLink}'s shape.
 * `ButtonLink` stays the right choice for navigation; use this for actions.
 */
function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  const base =
    'inline-block rounded-card px-5 py-2.5 text-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60'

  return (
    <button
      type={type}
      className={`${base} ${variantStyles[variant]} ${className}`}
      {...props}
    />
  )
}

export default Button
