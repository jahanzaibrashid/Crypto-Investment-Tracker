import { useId, type Ref, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { FieldShell } from './Input'
import { controlBorder, controlClass } from './control'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  options: SelectOption[]
  error?: string
  hideLabel?: boolean
  active?: boolean
  ref?: Ref<HTMLSelectElement>
}

export function Select({ label, options, error, hideLabel, active, id, className, ref, ...rest }: SelectProps) {
  const autoId = useId()
  const selectId = id ?? autoId
  return (
    <FieldShell id={selectId} label={label} error={error} hideLabel={hideLabel}>
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        className={cn(controlClass, 'h-9 pr-8', controlBorder(error, active), className)}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}
