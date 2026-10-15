import { formatPercent, formatPrice, formatQuantity, formatUsd } from '@/lib/formatters'
import { PLValue } from '@/components/ui/PLValue'
import { PriceStatusBadge } from '@/features/investments/PriceStatusBadge'
import type { CoinPosition } from '@/features/investments/investments.utils'

/** Holdings aggregated by coin (combines multiple purchases of the same coin). */
export function PortfolioStats({ positions }: { positions: CoinPosition[] }) {
  const open = positions.filter((p) => p.remainingQuantity.gt(0))
  if (open.length === 0) return null

  return (
    <section aria-labelledby="by-coin-h" className="surface-card">
      <div className="px-4 pt-4 sm:px-5">
        <h2 id="by-coin-h" className="text-sm font-semibold text-foreground">
          Holdings by coin
        </h2>
        <p className="text-xs text-muted-foreground">Multiple purchases of the same coin combined. Average cost includes fees.</p>
      </div>
      <div className="overflow-x-auto px-1 pb-2">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-4 py-2 text-left font-medium">Coin</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Lots</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Quantity</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Avg cost</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Price</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Value</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Unrealized P/L</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Allocation</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {open.map((p) => (
              <tr key={p.coinId} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5">
                  <span className="font-medium text-foreground">{p.coinName}</span> <span className="text-xs text-muted-foreground">{p.symbol}</span>
                </td>
                <td className="px-3 py-2.5 text-right">{p.lots}</td>
                <td className="px-3 py-2.5 text-right">{formatQuantity(p.remainingQuantity)}</td>
                <td className="px-3 py-2.5 text-right">{p.averageCost ? formatPrice(p.averageCost) : '—'}</td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <PriceStatusBadge status={p.priceStatus} />
                    {p.currentPrice ? formatPrice(p.currentPrice) : 'Unavailable'}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">{p.currentValue ? formatUsd(p.currentValue) : '—'}</td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex flex-col items-end">
                    <PLValue value={p.unrealizedPL} />
                    <PLValue value={p.unrealizedROI} format="percent" icon={false} className="text-xs" />
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {p.allocation ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full bg-primary-solid" style={{ width: `${Math.min(100, p.allocation.toNumber())}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{formatPercent(p.allocation, { signed: false })}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
