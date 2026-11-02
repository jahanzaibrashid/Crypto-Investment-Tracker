/**
 * Cell contents shared by the desktop table and the mobile cards.
 *
 * Typography scale (kept consistent everywhere):
 *   12px  column headers, badges (Badge size="lg")
 *   13px  secondary lines, dates, the P/L % (muted or colored)
 *   15px  main values and the P/L $ pill (semibold)
 *   lines stack with no gap and leading-snug, to keep rows compact
 */
import { Tooltip } from '@/components/ui/Tooltip'
import { ArrowDownRight, ArrowUpRight, Pencil, Target } from 'lucide-react'
import { PLPill } from '@/components/ui/PLPill'
import { PLValue } from '@/components/ui/PLValue'
import { cn } from '@/lib/cn'
import type { Dec } from '@/lib/decimal'
import { formatAmount, formatDate, formatPrice, formatQuantity, formatUsd, plClass } from '@/lib/formatters'
import { PriceStatusBadge } from './PriceStatusBadge'
import { activeTarget, displayPL, displayROI, saleSummary, targetMetrics, type LotMetrics, type TargetMetrics } from './investments.utils'

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
      {/* Where it was bought. Phones: small grey text, so the column stays narrow. ≥ sm: the
          same look as an "info" Badge. One element, so the name isn't in the row twice. */}
      {inv.exchange && (
        <span
          title={`Bought on ${inv.exchange}`}
          className={cn(
            'block max-w-16 truncate text-[11px] leading-tight text-muted-foreground',
            'sm:mt-1 sm:inline-block sm:max-w-24 sm:rounded-full sm:border sm:border-primary/40 sm:bg-primary/8 sm:px-2 sm:py-0.5 sm:font-medium sm:text-primary-text',
          )}
        >
          {inv.exchange}
        </span>
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
      {/* Buy price per coin leads; it lives here (not under Bought) so no cell needs three lines. */}
      <div className={primary}>@ {formatPrice(lot.buyPrice)}</div>
      <div className="text-[15px] leading-snug text-muted-foreground">{formatAmount(lot.grossPurchaseCost)}</div>
      {lot.buyFee.gt(0) && <div className={secondary}>+{formatUsd(lot.buyFee)} fee</div>}
    </div>
  )
}

/**
 * A current value colored against what was invested in it: green with ↗ when it is worth more,
 * red with ↘ when it is worth less (arrow + tooltip, so not color alone). `pl` = value − invested.
 */
export function ValueVsInvested({ value, pl, small = false }: { value: Dec; pl: Dec | null; small?: boolean }) {
  const up = pl !== null && pl.gt(0)
  const down = pl !== null && pl.lt(0)
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : null
  const title = pl === null ? undefined : up ? `${formatUsd(pl)} more than invested` : down ? `${formatUsd(pl.abs())} less than invested` : 'Same as invested'
  return (
    <span className={cn('inline-flex items-center gap-0.5', small ? 'text-[15px] leading-snug' : 'text-[15px] font-semibold', pl === null ? 'text-foreground' : plClass(pl))} title={title}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      {formatUsd(value)}
      {title && <span className="sr-only">, {title}</span>}
    </span>
  )
}

/** Props for buttons inside a row: their clicks and keys must not also open the row's details. */
const insideRow = {
  onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
}

/** Badge once the live price has reached the target. */
function TargetReached({ target }: { target: TargetMetrics }) {
  if (!target.reached) return null
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[12px] font-semibold text-success-text">
      <Target className="h-3 w-3" aria-hidden /> Target reached · sell?
    </span>
  )
}

export function CurrentValueCell({ lot }: { lot: LotMetrics }) {
  if (lot.status === 'SOLD') return empty
  return (
    <div className="flex flex-col items-start">
      {/* Current coin price leads; the lot's value sits under it. */}
      {lot.currentPrice ? (
        <div className={cn('text-[15px] leading-snug font-semibold', lot.unrealizedPL === null || lot.unrealizedPL.isZero() ? 'text-foreground' : plClass(lot.unrealizedPL))}>@ {formatPrice(lot.currentPrice)}</div>
      ) : (
        <div className={primary}>Unavailable</div>
      )}
      {lot.currentValue && <ValueVsInvested value={lot.currentValue} pl={lot.unrealizedPL} small />}
      <PriceStatusBadge status={lot.priceStatus} size="lg" />
    </div>
  )
}

/**
 * The target sell price of the coins still held, shown in the Sold amount column until they're sold.
 * On: a planned figure, boxed with a dashed border so it can't be mistaken for a real sale. Off: one muted line.
 */
function TargetSale({ lot, target, onTarget }: { lot: LotMetrics; target: TargetMetrics; onTarget?: () => void }) {
  const on = lot.investment.targetEnabled
  return (
    <div className={cn('flex flex-col items-start', on && '-mx-1 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-1.5 py-1')}>
      <button
        type="button"
        title="Edit target price"
        disabled={!onTarget}
        onClick={(e) => {
          e.stopPropagation()
          onTarget?.()
        }}
        {...insideRow}
        className={cn(
          'inline-flex items-center gap-1 rounded leading-snug hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:no-underline',
          on ? 'text-[15px] font-semibold text-foreground' : 'text-[13px] text-muted-foreground',
        )}
      >
        <Target className={cn('h-3.5 w-3.5', on && 'text-primary-text')} aria-hidden />
        Target @ {formatPrice(target.price)}
        {!on && ' (off)'}
        {onTarget && <Pencil className="h-3 w-3 text-muted-foreground" aria-hidden />}
      </button>
      {on && <ValueVsInvested value={target.value} pl={target.pl} small />}
      <TargetReached target={target} />
    </div>
  )
}

/** What was sold (net proceeds, price, date); for coins still held, the target sell price when one is set. */
export function SoldAmountCell({ lot, onTarget }: { lot: LotMetrics; onTarget?: () => void }) {
  const s = saleSummary(lot)
  const target = targetMetrics(lot)
  if (!s && !target) return empty
  return (
    <div className="flex flex-col gap-1">
      {s && (
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
      )}
      {target && <TargetSale lot={lot} target={target} onTarget={onTarget} />}
    </div>
  )
}

/** Pill with the $ result, then the % return underneath. */
export function ProfitLossCell({ lot }: { lot: LotMetrics }) {
  // Target on: profit at the target replaces the live unrealized P/L.
  const target = activeTarget(lot)
  return (
    <div className="flex flex-col items-start gap-0.5">
      <PLPill value={target ? target.pl : displayPL(lot)} planned={target !== null} />
      <PLValue value={target ? target.roi : displayROI(lot)} format="percent" icon={false} suffix={target ? 'if sold at target' : undefined} className="pl-0.5 text-[13px]" />
      {lot.isPartiallySold && (
        <div className="pl-0.5 text-[13px]">
          <PLValue value={lot.realizedPL} icon={false} suffix="realized" />
        </div>
      )}
    </div>
  )
}
