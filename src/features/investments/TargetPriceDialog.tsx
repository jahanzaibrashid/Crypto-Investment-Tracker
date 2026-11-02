import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormAlert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { PLValue } from '@/components/ui/PLValue'
import { useToast } from '@/components/ui/toast.context'
import { BINANCE_SPOT_FEE } from '@/lib/constants'
import { cn } from '@/lib/cn'
import { D } from '@/lib/decimal'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatPrice, formatQuantity, formatUsd } from '@/lib/formatters'
import { useInvestmentMutations } from './investments.hooks'
import { targetPriceFormSchema } from './investments.schemas'
import { breakEvenPrice, profitAfterFees, targetMetrics, type LotMetrics } from './investments.utils'

const DECIMAL_RE = /^\d+(\.\d+)?$/

/** Quick picks: a target this much above the buy price. */
const GAINS = [2, 5, 10, 20] as const
const FEE_PCT = `${(BINANCE_SPOT_FEE * 100).toFixed(3).replace(/0+$/, '')}%`

function TargetPriceForm({ lot, onDone }: { lot: LotMetrics; onDone: () => void }) {
  const inv = lot.investment
  const { updateTarget } = useInvestmentMutations()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<{ targetPrice: string; targetEnabled: boolean }>({
    resolver: zodResolver(targetPriceFormSchema),
    // The database keeps 12 decimals ("2400.000000000000"); show the plain number, as the edit form does.
    defaultValues: { targetPrice: inv.targetPrice ? new D(inv.targetPrice).toFixed() : '', targetEnabled: inv.targetEnabled },
  })

  // Live preview of the value and profit at the typed price.
  const typed = (useWatch({ control, name: 'targetPrice' }) ?? '').trim()
  const preview = DECIMAL_RE.test(typed) && Number(typed) > 0 ? targetMetrics({ ...lot, investment: { ...inv, targetPrice: typed } }) : null
  // Binance charges its fee on the buy and on the sale: a target just above the buy price can still lose money.
  const breakEven = breakEvenPrice(lot.buyPrice, BINANCE_SPOT_FEE)
  const afterFees = preview ? profitAfterFees(lot.remainingQuantity, lot.buyPrice, preview.price, BINANCE_SPOT_FEE) : null
  const pickPrice = (gain: number) => lot.buyPrice.times(1 + gain / 100).toDecimalPlaces(2)

  const save = async (targetPrice: string | null, targetEnabled: boolean) => {
    setError(null)
    try {
      await updateTarget.mutateAsync({ id: inv.id, targetPrice, targetEnabled })
      toast.success(targetPrice ? 'Target price saved.' : 'Target price removed.')
      onDone()
    } catch (e) {
      setError(errorMessage(e))
    }
  }
  const submit = handleSubmit(({ targetPrice, targetEnabled }) => save(targetPrice.trim() || null, targetEnabled))

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <Input
        label="Sell at (USD)"
        inputMode="decimal"
        data-autofocus
        leading="$"
        hint={`${formatQuantity(lot.remainingQuantity)} ${inv.symbol} held, bought at ${formatPrice(lot.buyPrice)}${lot.currentPrice ? `; now ${formatPrice(lot.currentPrice)}` : ''}. Leave empty to remove.`}
        error={errors.targetPrice?.message}
        {...register('targetPrice')}
      />
      <div className="-mt-2 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick targets above the buy price">
          {GAINS.map((g) => {
            const price = pickPrice(g)
            const active = DECIMAL_RE.test(typed) && new D(typed).eq(price)
            return (
              <button
                key={g}
                type="button"
                aria-pressed={active}
                title={`Sell at ${formatPrice(price)}`}
                onClick={() => setValue('targetPrice', price.toFixed(), { shouldValidate: true, shouldDirty: true })}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 pointer-coarse:py-2',
                  active ? 'border-primary bg-primary/10 text-primary-text' : 'border-border bg-background text-foreground hover:bg-muted',
                )}
              >
                +{g}%
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Break-even after Binance fees ({FEE_PCT} buy + {FEE_PCT} sell): <span className="tabular font-medium text-foreground">{formatPrice(breakEven.toDecimalPlaces(2, D.ROUND_UP))}</span>
        </p>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary-solid" {...register('targetEnabled')} />
        <span className="text-sm">
          <span className="font-medium text-foreground">Use the target in the table</span>
          <span className="block text-xs text-muted-foreground">
            On: this row shows its value and profit at the target instead of the live price. Off: the target is kept but the live price is shown. You can also switch it in the table.
          </span>
        </span>
      </label>
      {preview && (
        <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Value at this price</dt>
            <dd className="tabular font-medium">{formatUsd(preview.value)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Profit / loss (before fees)</dt>
            <dd className="flex flex-col">
              <PLValue value={preview.pl} />
              <PLValue value={preview.roi} format="percent" icon={false} className="text-xs" />
            </dd>
          </div>
          {afterFees && (
            <div className="col-span-2 border-t border-border pt-2">
              <dt className="text-xs text-muted-foreground">After Binance fees (estimate)</dt>
              <dd>
                <PLValue value={afterFees} />
              </dd>
            </div>
          )}
          {preview.price.lt(breakEven) && (
            <p className="col-span-2 rounded-md bg-warning/10 px-2 py-1 text-xs text-foreground">This target is below break-even: selling there loses money after fees.</p>
          )}
        </dl>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {inv.targetPrice && (
          <Button variant="ghost" className="mr-auto" onClick={() => void save(null, true)} disabled={isSubmitting || updateTarget.isPending}>
            Remove target
          </Button>
        )}
        <Button variant="ghost" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          Save target
        </Button>
      </div>
    </form>
  )
}

/** Set the price the user plans to sell an open lot at; the table then shows value and profit there. */
export function TargetPriceDialog({ lot, onClose }: { lot: LotMetrics | null; onClose: () => void }) {
  const inv = lot?.investment
  return (
    <Dialog
      open={lot !== null}
      onClose={onClose}
      title="Target sell price"
      description={inv ? `${inv.coinName} (${inv.symbol}) bought ${formatDate(inv.buyDate)}` : undefined}
    >
      {lot && <TargetPriceForm key={lot.investment.id} lot={lot} onDone={onClose} />}
    </Dialog>
  )
}
