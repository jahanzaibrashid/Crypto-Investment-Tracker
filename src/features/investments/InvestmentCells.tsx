/**
 * Cell contents shared by the desktop table and the mobile cards.
 *
 * Typography scale (kept consistent everywhere):
 *   12px  column headers, badges (Badge size="lg")
 *   13px  secondary lines, dates, the P/L % (muted or colored)
 *   15px  main values and the P/L $ pill (semibold)
 *   lines stack with no gap and leading-snug, to keep rows compact
 */
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { PLPill } from '@/components/ui/PLPill'
import { PLValue } from '@/components/ui/PLValue'
import { cn } from '@/lib/cn'
import type { Dec } from '@/lib/decimal'
import { formatAmount, formatDate, formatPrice, formatQuantity, formatUsd, plClass } from '@/lib/formatters'
import { PriceStatusBadge } from './PriceStatusBadge'
import { displayPL, displayROI, saleSummary, type LotMetrics } from './investments.utils'

const primary = 'text-[15px] leading-snug font-semibold text-foreground'
const secondary = 'text-[13px] leading-snug text-muted-foreground'
const dateLine = 'text-[13px] leading-snug text-muted-foreground'
const empty = <span className="text-[15px] text-muted-foreground">—</span>

export function CoinCell({ lot }: { lot: LotMetrics }) {
  const inv = lot.investment
  return (
    <div className="min-w-0">
      {/* Only the ticker is shown; the full name appears on hover and is read by screen readers. */}
      <div className={primary}>
        <Tooltip text={inv.coinName}>{inv.symbol}</Tooltip>
        <span className="sr-only"> {inv.coinName}</span>
      </div>
      {/* Hidden on phones to keep the column narrow; the exchange is in the details panel there. */}
      {inv.exchange && (
        <div className="hidden sm:block">
          <Badge tone="info" className="mt-1 max-w-24 truncate" title={`Bought on ${inv.exchange}`}>
            {inv.exchange}
          </Badge>
        </div>
      )}
    </div>
  )
}

export function BoughtCell({ lot }: { lot: LotMetrics }) {
  return (
    <div className="flex flex-col">
      <div className={primary}>{formatQuantity(lot.quantity)}</div>
      <div className={dateLine}>
        {formatDate(lot.investment.buyDate)}
      </div>
      {lot.isPartiallySold && <div className="text-[13px] font-medium text-warning-text">{formatQuantity(lot.remainingQuantity)} left</div>}
    </div>
  )
}

export function InvestedCell({ lot }: { lot: LotMetrics }) {
  return (
    <div className="flex flex-col">
      <div className={primary}>{formatAmount(lot.grossPurchaseCost)}</div>
      {/* Buy price per coin lives here (not under Bought) so no cell needs three lines. */}
      <div className={secondary}>@ {formatPrice(lot.buyPrice)}</div>
      {lot.buyFee.gt(0) && <div className={secondary}>+{formatUsd(lot.buyFee)} fee</div>}
    </div>
  )
}

/**
 * A current value colored against what was invested in it: green with ↗ when it is worth more,
 * red with ↘ when it is worth less (arrow + tooltip, so not color alone). `pl` = value − invested.
 */
export function ValueVsInvested({ value, pl }: { value: Dec; pl: Dec | null }) {
  const up = pl !== null && pl.gt(0)
  const down = pl !== null && pl.lt(0)
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : null
  const title = pl === null ? undefined : up ? `${formatUsd(pl)} more than invested` : down ? `${formatUsd(pl.abs())} less than invested` : 'Same as invested'
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[15px] font-semibold', pl === null ? 'text-foreground' : plClass(pl))} title={title}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      {formatUsd(value)}
      {title && <span className="sr-only">, {title}</span>}
    </span>
  )
}

export function CurrentValueCell({ lot }: { lot: LotMetrics }) {
  if (lot.status === 'SOLD') return empty
  return (
    <div className="flex flex-col items-start">
      {lot.currentValue ? <ValueVsInvested value={lot.currentValue} pl={lot.unrealizedPL} /> : <div className={primary}>Unavailable</div>}
      {lot.currentPrice && (
        <div className={cn('text-[13px]', lot.unrealizedPL === null || lot.unrealizedPL.isZero() ? 'text-muted-foreground' : plClass(lot.unrealizedPL))}>
          @ {formatPrice(lot.currentPrice)}
        </div>
      )}
      <PriceStatusBadge status={lot.priceStatus} size="lg" />
    </div>
  )
}

export function SoldAmountCell({ lot }: { lot: LotMetrics }) {
  const s = saleSummary(lot)
  if (!s) return empty
  return (
    <div className="flex flex-col">
      <div className={primary}>{formatUsd(s.netProceeds)}</div>
      <div className={secondary}>
        {s.count > 1 ? 'avg ' : ''}@ {formatPrice(s.averagePrice)}
      </div>
      <div className={dateLine}>
        {formatDate(s.lastSoldDate)}
        {s.count > 1 && <span className="text-[13px]"> · last of {s.count}</span>}
      </div>
      {s.fees.gt(0) && <div className={secondary}>after {formatUsd(s.fees)} fee</div>}
    </div>
  )
}

/** Pill with the $ result, then the % return underneath. */
export function ProfitLossCell({ lot }: { lot: LotMetrics }) {
  const roi = displayROI(lot)
  return (
    <div className="flex flex-col items-start gap-0.5">
      <PLPill value={displayPL(lot)} />
      <PLValue value={roi} format="percent" icon={false} className="pl-0.5 text-[13px]" />
      {lot.isPartiallySold && (
        <div className="pl-0.5 text-[13px]">
          <PLValue value={lot.realizedPL} icon={false} suffix="realized" />
        </div>
      )}
    </div>
  )
}
