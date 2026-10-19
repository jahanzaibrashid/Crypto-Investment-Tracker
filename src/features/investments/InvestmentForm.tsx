import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { DateInput } from '@/components/ui/DateInput'
import { Input, Textarea } from '@/components/ui/Input'
import { D, type Dec } from '@/lib/decimal'
import { EARLIEST_BUY_DATE, LIMITS } from '@/lib/constants'
import { formatQuantity, formatUsd, todayIso } from '@/lib/formatters'
import { CoinPicker } from './CoinPicker'
import { ExchangePicker } from './ExchangePicker'
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
  /** Suggestions for "Bought on": presets + exchanges already used (exchangeOptions). */
  exchangeOptions: string[]
  submitLabel: string
  onSubmit: (input: InvestmentInput) => Promise<void>
  onCancel: () => void
}

export function InvestmentForm({ initial, soldQuantity, firstSaleDate, exchangeOptions, submitLabel, onSubmit, onCancel }: InvestmentFormProps) {
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

  // Fees are hidden for now: buyFee stays in the form values (0 for new lots, the saved value
  // when editing), so turning the field back on later needs no data or schema change.
  const [price, quantity] = useWatch({ control, name: ['buyPrice', 'quantity'] })
  const p = safeDecimal(price)
  const q = safeDecimal(quantity)
  const gross = p && q ? q.times(p) : null

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

      <Controller
        control={control}
        name="exchange"
        render={({ field, fieldState }) => (
          <ExchangePicker
            value={field.value ?? ''}
            onChange={field.onChange}
            onBlur={field.onBlur}
            options={exchangeOptions}
            error={fieldState.error?.message}
          />
        )}
      />

      {/* One row on wider screens: how much, at what price, and when (same layout as the sell form). */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Input
          label="Quantity purchased"
          inputMode="decimal"
          placeholder="0.0"
          error={errors.quantity?.message}
          hint={
            soldQuantity && new D(soldQuantity).gt(0)
              ? `Minimum ${formatQuantity(soldQuantity)} (already sold).`
              : 'Number of coins bought.'
          }
          {...register('quantity')}
        />
        <Input
          label="Buy price per coin"
          inputMode="decimal"
          leading="$"
          placeholder="0.00"
          hint="USD price per coin at the time of purchase."
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
      </div>

      <div className="rounded-lg border border-border bg-background p-3 text-sm" aria-live="polite">
        <div className="text-xs text-muted-foreground">Total invested</div>
        <div className="tabular font-semibold text-foreground" data-testid="invested-preview">
          {gross ? formatUsd(gross, { dropZeroCents: true }) : '—'}
        </div>
        {!gross && <div className="text-xs text-muted-foreground">Enter the quantity and buy price to see the total.</div>}
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-long-term" {...register('longTerm')} />
        <span className="text-sm">
          <span className="font-medium text-foreground">Long-term holding</span>
          <span className="block text-xs text-muted-foreground">
            Marks this purchase as a long-term hold. It gets its own status color while it is held.
          </span>
        </span>
      </label>

      <Textarea
        label="Note (optional)"
        rows={2}
        placeholder="e.g. Bought on Binance"
        maxLength={LIMITS.noteMax}
        error={errors.note?.message}
        {...register('note')}
      />

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
