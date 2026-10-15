import { useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/toast.context'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatPrice, formatQuantity, formatUsd } from '@/lib/formatters'
import { PLValue } from '@/components/ui/PLValue'
import { useInvestmentMutations } from './investments.hooks'
import { PositionStatusBadge } from './PositionStatusBadge'
import { PriceStatusBadge } from './PriceStatusBadge'
import type { LotMetrics, SaleMetrics } from './investments.utils'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-1.5 text-sm last:border-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="tabular flex min-w-0 flex-wrap justify-end text-right text-foreground">{children}</dd>
    </div>
  )
}

export function InvestmentDetails({ lot, onClose }: { lot: LotMetrics | null; onClose: () => void }) {
  const { removeSale } = useInvestmentMutations()
  const toast = useToast()
  const [saleToDelete, setSaleToDelete] = useState<SaleMetrics | null>(null)
  const inv = lot?.investment

  const confirmDeleteSale = async () => {
    if (!saleToDelete) return
    try {
      await removeSale.mutateAsync(saleToDelete.sale.id)
      toast.success('Sale removed. The position was re-opened for that quantity.')
      setSaleToDelete(null)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <>
      <Dialog
        open={lot !== null && saleToDelete === null}
        onClose={onClose}
        size="lg"
        title={inv ? `${inv.coinName} (${inv.symbol}) — position details` : 'Position details'}
        description={inv ? <code className="text-xs text-muted-foreground">CoinGecko ID: {inv.coinId}</code> : undefined}
      >
        {lot && inv && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <PositionStatusBadge lot={lot} />
              {lot.status === 'HOLDING' && <PriceStatusBadge status={lot.priceStatus} />}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <section aria-labelledby="purchase-h">
                <h3 id="purchase-h" className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Purchase
                </h3>
                <dl>
                  <Row label="Buy date">{formatDate(inv.buyDate)}</Row>
                  <Row label="Buy price">{formatPrice(lot.buyPrice)}</Row>
                  <Row label="Quantity">{formatQuantity(lot.quantity)}</Row>
                  <Row label="Gross purchase">{formatUsd(lot.grossPurchaseCost)}</Row>
                  <Row label="Purchase fee">{formatUsd(lot.buyFee)}</Row>
                  <Row label="Total cost basis">{formatUsd(lot.totalCostBasis)}</Row>
                </dl>
              </section>
              <section aria-labelledby="position-h">
                <h3 id="position-h" className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Position
                </h3>
                <dl>
                  <Row label="Sold quantity">{formatQuantity(lot.soldQuantity)}</Row>
                  <Row label="Remaining quantity">{formatQuantity(lot.remainingQuantity)}</Row>
                  <Row label="Remaining cost basis">{formatUsd(lot.remainingCostBasis)}</Row>
                  {lot.status === 'HOLDING' && (
                    <>
                      <Row label="Current price">{lot.currentPrice ? formatPrice(lot.currentPrice) : 'Unavailable'}</Row>
                      <Row label="Current value">{lot.currentValue ? formatUsd(lot.currentValue) : 'Unavailable'}</Row>
                      <Row label="Unrealized P/L">
                        {lot.unrealizedPL ? (
                          <span className="inline-flex gap-1.5">
                            <PLValue value={lot.unrealizedPL} />
                            <PLValue value={lot.unrealizedROI} format="percent" icon={false} />
                          </span>
                        ) : (
                          'Unavailable'
                        )}
                      </Row>
                    </>
                  )}
                  <Row label="Realized P/L">
                    {lot.sales.length ? (
                      <span className="inline-flex gap-1.5">
                        <PLValue value={lot.realizedPL} />
                        <PLValue value={lot.realizedROI} format="percent" icon={false} />
                      </span>
                    ) : (
                      '—'
                    )}
                  </Row>
                </dl>
              </section>
            </div>

            <section aria-labelledby="sales-h">
              <h3 id="sales-h" className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Sale history
              </h3>
              {lot.sales.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales recorded for this purchase.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead className="bg-muted text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-right font-medium">Quantity</th>
                        <th className="px-3 py-2 text-right font-medium">Price</th>
                        <th className="px-3 py-2 text-right font-medium">Fee</th>
                        <th className="px-3 py-2 text-right font-medium">Net proceeds</th>
                        <th className="px-3 py-2 text-right font-medium">Realized P/L</th>
                        <th className="px-3 py-2">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="tabular">
                      {lot.sales.map((s) => (
                        <tr key={s.sale.id} className="border-t border-border">
                          <td className="px-3 py-2">
                            {formatDate(s.sale.soldDate)}
                            {s.sale.note && <div className="text-xs whitespace-pre-wrap text-muted-foreground">{s.sale.note}</div>}
                          </td>
                          <td className="px-3 py-2 text-right">{formatQuantity(s.quantity)}</td>
                          <td className="px-3 py-2 text-right">{formatPrice(s.sale.price)}</td>
                          <td className="px-3 py-2 text-right">{formatUsd(s.fee)}</td>
                          <td className="px-3 py-2 text-right">{formatUsd(s.netProceeds)}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex flex-col items-end">
                              <PLValue value={s.realizedPL} />
                              <PLValue value={s.realizedROI} format="percent" icon={false} className="text-xs" />
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Delete sale on ${formatDate(s.sale.soldDate)}`}
                              onClick={() => setSaleToDelete(s)}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {inv.note && (
              <section aria-labelledby="note-h">
                <h3 id="note-h" className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Note
                </h3>
                <p className="text-sm whitespace-pre-wrap text-foreground">{inv.note}</p>
              </section>
            )}
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={saleToDelete !== null}
        title="Delete this sale?"
        message={
          saleToDelete && (
            <>
              The sale of {formatQuantity(saleToDelete.quantity)} {inv?.symbol} on {formatDate(saleToDelete.sale.soldDate)} will be
              removed and that quantity returns to Holding. This cannot be undone.
            </>
          )
        }
        confirmLabel="Delete sale"
        destructive
        loading={removeSale.isPending}
        onConfirm={confirmDeleteSale}
        onCancel={() => setSaleToDelete(null)}
      />
    </>
  )
}
