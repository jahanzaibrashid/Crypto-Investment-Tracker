import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormAlert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { DateInput } from '@/components/ui/DateInput'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/toast.context'
import { D } from '@/lib/decimal'
import { LIMITS } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatPrice, formatQuantity, formatUsd, todayIso } from '@/lib/formatters'
import { PLValue } from '@/components/ui/PLValue'
import { useInvestmentMutations } from './investments.hooks'
import { makeSaleFormSchema, toSaleInput, type SaleFormValues } from './investments.schemas'
import { allocateCostBasis, netSaleProceeds, roiPercent, type LotMetrics } from './investments.utils'

const isNum = (s: string | undefined) => /^\d+(\.\d+)?$/.test((s ?? '').trim())

function SaleForm({ lot, onDone, onCancel }: { lot: LotMetrics; onDone: () => void; onCancel: () => void }) {
  const inv = lot.investment
  const { sell } = useInvestmentMutations()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  // Default: sell the whole position (quantity locked). "Sell part" switches to a partial sale.
  const [sellAll, setSellAll] = useState(true)
  const remaining = lot.remainingQuantity.toFixed()
  const schema = makeSaleFormSchema({ buyDate: inv.buyDate, remainingQuantity: remaining })

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<SaleFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { soldDate: todayIso(), quantity: remaining, price: '', fee: '', note: '' },
    mode: 'onTouched',
  })

  // Sale fees are hidden for now: `fee` stays '' in the form and is saved as 0.
  const [qty, price] = useWatch({ control, name: ['quantity', 'price'] })
  const preview =
    isNum(qty) && isNum(price) && new D(qty).gt(0) && new D(qty).lte(lot.remainingQuantity)
      ? (() => {
          const q = new D(qty)
          const proceeds = netSaleProceeds(q, new D(price), new D(0))
          const cost = allocateCostBasis(lot.totalCostBasis, q, lot.quantity)
          const pl = proceeds.minus(cost)
          return { proceeds, cost, pl, roi: roiPercent(pl, cost) }
        })()
      : null
  // A sale of everything left closes the position; anything less is a partial sale.
  const sellsEverything = sellAll || (isNum(qty) && new D(qty).eq(lot.remainingQuantity))

  const submit = handleSubmit(async (values) => {
    setError(null)
    try {
      await sell.mutateAsync(toSaleInput(inv.id, values))
      const full = new D(values.quantity).eq(lot.remainingQuantity)
      toast.success(full ? `${inv.symbol} position marked as sold.` : `Recorded partial sale of ${formatQuantity(values.quantity)} ${inv.symbol}.`)
      onDone()
    } catch (e) {
      setError(errorMessage(e))
    }
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label="Sale form">
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <dl className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-background p-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Quantity held</dt>
          <dd className="tabular font-medium break-all">
            {formatQuantity(lot.remainingQuantity)} {inv.symbol}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Buy price per coin</dt>
          <dd className="tabular font-medium">{formatPrice(lot.buyPrice)}</dd>
        </div>
        <div>
          {/* Same figure as the table's Invested column: quantity bought × buy price. */}
          <dt className="text-xs text-muted-foreground">Total invested</dt>
          <dd className="tabular font-medium">{formatUsd(lot.grossPurchaseCost, { dropZeroCents: true })}</dd>
        </div>
      </dl>

      {/* One row on wider screens: how much, at what price, and when. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Selling everything locks the quantity to the full remaining amount; "Sell part" unlocks it. */}
        <Input
          label="Quantity sold"
          inputMode="decimal"
          readOnly={sellAll}
          hint={sellAll ? `All ${formatQuantity(lot.remainingQuantity)} ${inv.symbol}. Choose “Sell part” to sell less.` : `Up to ${formatQuantity(lot.remainingQuantity)} ${inv.symbol}.`}
          className="read-only:cursor-not-allowed read-only:bg-muted read-only:text-muted-foreground"
          error={errors.quantity?.message}
          aside={
            <button
              type="button"
              className="rounded text-xs text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={() => {
                if (sellAll) {
                  setSellAll(false)
                  setFocus('quantity')
                } else {
                  setSellAll(true)
                  setValue('quantity', remaining, { shouldValidate: true })
                }
              }}
            >
              {sellAll ? 'Sell part' : 'Sell all'}
            </button>
          }
          {...register('quantity')}
        />
        <Input
          label="Sale price per coin"
          inputMode="decimal"
          leading="$"
          placeholder="0.00"
          hint={lot.currentPrice ? `Market price now: ${formatPrice(lot.currentPrice)}` : 'USD price per coin at the time of sale.'}
          error={errors.price?.message}
          aside={
            lot.currentPrice ? (
              <button
                type="button"
                className="rounded text-xs text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                onClick={() => setValue('price', lot.currentPrice!.toFixed(), { shouldValidate: true })}
              >
                Use market price
              </button>
            ) : undefined
          }
          {...register('price')}
        />
        <Controller
          control={control}
          name="soldDate"
          render={({ field, fieldState }) => (
            <DateInput
              label="Sale date"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              min={inv.buyDate}
              max={todayIso()}
              error={fieldState.error?.message}
            />
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background p-3 text-sm sm:grid-cols-3" aria-live="polite">
        <div>
          <div className="text-xs text-muted-foreground">Sale amount</div>
          <div className="tabular font-semibold">{preview ? formatUsd(preview.proceeds, { dropZeroCents: true }) : '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Invested amount</div>
          <div className="tabular font-semibold">{preview ? formatUsd(preview.cost, { dropZeroCents: true }) : '—'}</div>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <div className="text-xs text-muted-foreground">Profit / loss</div>
          <div className="flex flex-wrap gap-x-1.5 font-semibold" data-testid="realized-preview">
            {preview ? (
              <>
                <PLValue value={preview.pl} />
                <span className="font-normal text-muted-foreground" aria-hidden>
                  /
                </span>
                <PLValue value={preview.roi} format="percent" icon={false} />
              </>
            ) : (
              '—'
            )}
          </div>
        </div>
      </div>
      {!preview && <p className="-mt-2 text-xs text-muted-foreground">Enter the quantity and sale price to see the profit or loss.</p>}

      <Textarea
        label="Note (optional)"
        rows={2}
        placeholder="e.g. Sold on Binance to take profit"
        maxLength={LIMITS.saleNoteMax}
        error={errors.note?.message}
        {...register('note')}
      />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {sellsEverything ? 'Mark as sold' : 'Record partial sale'}
        </Button>
      </div>
    </form>
  )
}

export function SellDialog({ lot, onClose }: { lot: LotMetrics | null; onClose: () => void }) {
  const inv = lot?.investment
  return (
    <Dialog
      open={lot !== null}
      onClose={onClose}
      title={inv ? `Sell ${inv.coinName} (${inv.symbol})` : 'Sell'}
      description={
        inv
          ? `Bought ${formatQuantity(inv.quantity)} ${inv.symbol} on ${formatDate(inv.buyDate)}${inv.exchange ? ` (${inv.exchange})` : ''}. Sell all to mark it as Sold, or sell part and keep the rest.`
          : undefined
      }
      size="lg"
    >
      {lot && <SaleForm key={lot.investment.id} lot={lot} onDone={onClose} onCancel={onClose} />}
    </Dialog>
  )
}
