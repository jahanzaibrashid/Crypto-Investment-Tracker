import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { controlBorder, controlClass } from './control'

interface FieldProps {
  label: string
  error?: string
  hint?: ReactNode
  /** Rendered to the right of the label */
  aside?: ReactNode
  hideLabel?: boolean
  /** Highlights a control holding a non-default value (e.g. an applied filter). */
  active?: boolean
}

export function FieldShell({
  id,
  label,
  error,
  hint,
  aside,
  hideLabel,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className={cn('flex items-baseline justify-between gap-2', hideLabel && 'sr-only')}>
        <label htmlFor={id} className="text-xs font-medium text-foreground">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive-text">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldProps {
  ref?: Ref<HTMLInputElement>
  leading?: ReactNode
}

export function Input({ label, error, hint, aside, hideLabel, active, id, className, leading, ref, ...rest }: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <FieldShell id={inputId} label={label} error={error} hint={hint} aside={aside} hideLabel={hideLabel}>
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">{leading}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cn(
            controlClass,
            'h-9',
            leading ? 'pl-7' : undefined,
            // iOS Safari gives native date inputs a fixed intrinsic width and centered text,
            // which overflows narrow grid cells; let them fill the cell like other inputs.
            rest.type === 'date' && 'appearance-none text-left [&::-webkit-date-and-time-value]:text-left',
            controlBorder(error, active),
            className,
          )}
          {...rest}
        />
      </div>
    </FieldShell>
  )
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {
  ref?: Ref<HTMLTextAreaElement>
}

export function Textarea({ label, error, hint, aside, hideLabel, active, id, className, ref, ...rest }: TextareaProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <FieldShell id={inputId} label={label} error={error} hint={hint} aside={aside} hideLabel={hideLabel}>
      <textarea
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={cn(controlClass, 'min-h-20 py-2', controlBorder(error, active), className)}
        {...rest}
      />
    </FieldShell>
  )
}
