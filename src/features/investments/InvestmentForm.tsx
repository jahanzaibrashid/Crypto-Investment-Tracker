import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { DateInput } from '@/components/ui/DateInput'
import { Input, Textarea } from '@/components/ui/Input'
import { D, type Dec } from '@/lib/decimal'
import { EARLIEST_BUY_DATE, LIMITS } from '@/lib/constants'
import { formatQuantity, formatUsd, todayIso } from '@/lib/formatters'
import { CoinPicker } from './CoinPicker'
import {
  defaultInvestmentValues,
  makeInvestmentFormSchema,
  toInvestmentInput,
  type InvestmentFormInput,
  type InvestmentFormValues,
} from './investments.schemas'
import type { Investment, InvestmentInput } from './investments.types'

function safeDecimal(v: string | undefined): Dec | null {
  const s = (v ?? '').trim()
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  return new D(s)
}

interface InvestmentFormProps {
  initial?: Investment
  /** Quantity already sold from this lot (edit mode) */
  soldQuantity?: string
  /** Earliest sale of this lot (edit mode): the buy date may not be later than this. */
  firstSaleDate?: string | null
  submitLabel: string
  onSubmit: (input: InvestmentInput) => Promise<void>
  onCancel: () => void
}

export function InvestmentForm({ initial, soldQuantity, firstSaleDate, submitLabel, onSubmit, onCancel }: InvestmentFormProps) {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InvestmentFormInput, unknown, InvestmentFormValues>({
    resolver: zodResolver(makeInvestmentFormSchema({ firstSaleDate, soldQuantity })),
    defaultValues: defaultInvestmentValues(initial),
    mode: 'onTouched',
  })

  const [price, quantity, fee] = useWatch({ control, name: ['buyPrice', 'quantity', 'buyFee'] })
  const p = safeDecimal(price)
  const q = safeDecimal(quantity)
  const f = (fee ?? '').trim() === '' ? new D(0) : safeDecimal(fee)
  const gross = p && q ? q.times(p) : null
  const total = gross && f ? gross.plus(f) : null

  const submit = handleSubmit(async (values) => {
    await onSubmit(toInvestmentInput(values))
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label="Investment form">
      <Controller
        control={control}
        name="coin"
        render={({ field, fieldState }) => (
          <CoinPicker value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
        )}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Quantity purchased"
          inputMode="decimal"
          placeholder="0.0"
          error={errors.quantity?.message}
          hint={soldQuantity && new D(soldQuantity).gt(0) ? `Already sold: ${formatQuantity(soldQuantity)} — cannot go below this.` : undefined}
          {...register('quantity')}
        />
        <Input
          label="Buy price (USD per coin)"
          inputMode="decimal"
          leading="$"
          placeholder="0.00"
          error={errors.buyPrice?.message}
          {...register('buyPrice')}
        />
        <Controller
          control={control}
          name="buyDate"
          render={({ field, fieldState }) => (
            <DateInput
              label="Buy date"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              min={EARLIEST_BUY_DATE}
              max={firstSaleDate && firstSaleDate < todayIso() ? firstSaleDate : todayIso()}
              error={fieldState.error?.message}
            />
          )}
        />
        <Input
          label="Transaction fee (USD, optional)"
          inputMode="decimal"
          leading="$"
          placeholder="0.00"
          hint="Enter fees in USD. Convert fees paid in other currencies first."
          error={errors.buyFee?.message}
          {...register('buyFee')}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background p-3 text-sm" aria-live="polite">
        <div>
          <div className="text-xs text-muted-foreground">Invested amount (Q × price)</div>
          <div className="tabular font-semibold text-foreground" data-testid="invested-preview">
            {gross ? formatUsd(gross) : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Total cost basis (incl. fee)</div>
          <div className="tabular font-semibold text-foreground" data-testid="cost-basis-preview">
            {total ? formatUsd(total) : '—'}
          </div>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-long-term" {...register('longTerm')} />
        <span className="text-sm">
          <span className="font-medium text-foreground">Long-term holding</span>
          <span className="block text-xs text-muted-foreground">
            Mark this purchase as a long-term hold. It is shown with its own camel-colored status while you hold it.
          </span>
        </span>
      </label>

      <Textarea label="Note (optional)" maxLength={LIMITS.noteMax} rows={2} error={errors.note?.message} {...register('note')} />

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
