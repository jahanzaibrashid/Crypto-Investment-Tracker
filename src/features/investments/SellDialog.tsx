import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormAlert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
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
  const remaining = lot.remainingQuantity.toFixed()
  const schema = makeSaleFormSchema({ buyDate: inv.buyDate, remainingQuantity: remaining })

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SaleFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { soldDate: todayIso(), quantity: remaining, price: '', fee: '', note: '' },
    mode: 'onTouched',
  })

  const [qty, price, fee] = useWatch({ control, name: ['quantity', 'price', 'fee'] })
  const preview =
    isNum(qty) && isNum(price) && (fee.trim() === '' || isNum(fee)) && new D(qty).gt(0) && new D(qty).lte(lot.remainingQuantity)
      ? (() => {
          const q = new D(qty)
          const proceeds = netSaleProceeds(q, new D(price), new D(fee.trim() || '0'))
          const cost = allocateCostBasis(lot.totalCostBasis, q, lot.quantity)
          const pl = proceeds.minus(cost)
          return { proceeds, cost, pl, roi: roiPercent(pl, cost) }
        })()
      : null

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
      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background p-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Remaining quantity</dt>
          <dd className="tabular font-medium">{formatQuantity(lot.remainingQuantity)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Cost basis per coin</dt>
          <dd className="tabular font-medium">{formatPrice(lot.totalCostBasis.dividedBy(lot.quantity))}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Current market price</dt>
          <dd className="tabular font-medium">{lot.currentPrice ? formatPrice(lot.currentPrice) : 'Unavailable'}</dd>
        </div>
      </dl>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Sale date" type="date" min={inv.buyDate} max={todayIso()} error={errors.soldDate?.message} {...register('soldDate')} />
        <Input
          label="Quantity sold"
          inputMode="decimal"
          error={errors.quantity?.message}
          aside={
            <button
              type="button"
              className="text-xs text-primary-text hover:underline"
              onClick={() => setValue('quantity', remaining, { shouldValidate: true })}
            >
              Sell all
            </button>
          }
          {...register('quantity')}
        />
        <Input
          label="Sale price (USD per coin)"
          inputMode="decimal"
          leading="$"
          error={errors.price?.message}
          aside={
            lot.currentPrice ? (
              <button
                type="button"
                className="text-xs text-primary-text hover:underline"
                onClick={() => setValue('price', lot.currentPrice!.toFixed(), { shouldValidate: true })}
              >
                Use market price
              </button>
            ) : undefined
          }
          {...register('price')}
        />
        <Input label="Sale fee (USD, optional)" inputMode="decimal" leading="$" error={errors.fee?.message} {...register('fee')} />
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background p-3 text-sm sm:grid-cols-3" aria-live="polite">
        <div>
          <div className="text-xs text-muted-foreground">Net proceeds</div>
          <div className="tabular font-semibold">{preview ? formatUsd(preview.proceeds) : '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Allocated cost</div>
          <div className="tabular font-semibold">{preview ? formatUsd(preview.cost) : '—'}</div>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <div className="text-xs text-muted-foreground">Realized P/L</div>
          <div className="flex flex-wrap gap-x-1.5 font-semibold" data-testid="realized-preview">
            {preview ? (
              <>
                <PLValue value={preview.pl} />
                <PLValue value={preview.roi} format="percent" icon={false} />
              </>
            ) : (
              '—'
            )}
          </div>
        </div>
      </div>

      <Textarea label="Sale note (optional)" rows={2} maxLength={LIMITS.saleNoteMax} error={errors.note?.message} {...register('note')} />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          Record sale
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
        inv ? `Lot bought ${formatDate(inv.buyDate)}. Sell all to mark the position as Sold, or part of it for a partial sale.` : undefined
      }
    >
      {lot && <SaleForm key={lot.investment.id} lot={lot} onDone={onClose} onCancel={onClose} />}
    </Dialog>
  )
}
