import type { ComponentProps, ReactNode } from 'react'

/*
 * Form field primitives.
 *
 * Every control gets a real `<label for>`, and hints and errors are wired to it
 * through `aria-describedby`, so a screen reader announces the error with the
 * field rather than leaving it as unattached red text.
 */

export const controlClass =
  'w-full rounded-card border bg-surface px-4 py-2.5 text-ink transition-colors placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-60'

function borderClass(hasError: boolean): string {
  return hasError ? 'border-danger-700' : 'border-line'
}

type ShellProps = {
  id: string
  label: string
  hint?: string
  error?: string
  optional?: boolean
  children: ReactNode
}

function FieldShell({ id, label, hint, error, optional, children }: ShellProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {optional && (
          <span className="ml-1.5 font-normal text-ink-muted">(optional)</span>
        )}
      </label>

      <div className="mt-1.5">{children}</div>

      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-muted">
          {hint}
        </p>
      )}

      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  )
}

function describedBy(id: string, hint?: string, error?: string) {
  if (error) return `${id}-error`
  if (hint) return `${id}-hint`
  return undefined
}

type TextFieldProps = Omit<ComponentProps<'input'>, 'id'> & {
  id: string
  label: string
  hint?: string
  error?: string
  optional?: boolean
}

export function TextField({
  id,
  label,
  hint,
  error,
  optional,
  className = '',
  ...props
}: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`${controlClass} ${borderClass(Boolean(error))} ${className}`}
        {...props}
      />
    </FieldShell>
  )
}

type Option = { value: string; label: string }

type SelectFieldProps = Omit<ComponentProps<'select'>, 'id' | 'children'> & {
  id: string
  label: string
  options: readonly Option[]
  hint?: string
  error?: string
  optional?: boolean
}

export function SelectField({
  id,
  label,
  options,
  hint,
  error,
  optional,
  className = '',
  ...props
}: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`${controlClass} ${borderClass(Boolean(error))} ${className}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}
