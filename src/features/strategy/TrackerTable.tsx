import { Fragment, useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { InfoTip } from '@/components/ui/InfoTip'
import { PLValue } from '@/components/ui/PLValue'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/cn'
import type { Dec } from '@/lib/decimal'
import { formatAmount, formatDate, formatQuantity } from '@/lib/formatters'
import type { CycleProgress, RealizedTrade, TrackerDay } from './strategy.utils'

const dash = <span className="text-muted-foreground">—</span>

/** "+$10 shortfall" / "−$10 credit" / "$0". */
function Carry({ value }: { value: Dec | null }) {
  if (value === null) return dash
  if (value.isZero()) return <span className="text-muted-foreground">$0</span>
  return value.gt(0) ? (
    <span className="text-destructive-text">+{formatAmount(value)} shortfall</span>
  ) : (
    <span className="text-success-text">−{formatAmount(value.neg())} credit</span>
  )
}

const amount = (v: Dec | null) => (v === null ? dash : formatAmount(v))

function Trades({ trades }: { trades: RealizedTrade[] }) {
  return (
    <ul className="flex flex-col gap-1.5 text-xs">
      {trades.map((t) => (
        <li key={t.saleId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
          <span className="text-foreground">
            Sold {formatQuantity(t.quantity)} <span className="font-medium">{t.symbol}</span>
            <span className="text-muted-foreground"> · proceeds {formatAmount(t.netProceeds)} · cost {formatAmount(t.costBasis)}</span>
            {t.fees.gt(0) && <span className="text-muted-foreground"> · fees {formatAmount(t.fees)}</span>}
          </span>
          <PLValue value={t.realizedPL} format="amount" />
        </li>
      ))}
    </ul>
  )
}

function StatusBadge({ day }: { day: TrackerDay }) {
  if (day.status === 'today') return <Badge tone="info">Today</Badge>
  return null
}

function DayCards({ days }: { days: TrackerDay[] }) {
  return (
    <ul className="flex flex-col gap-2.5 px-4 pt-3 pb-4" aria-label="Daily tracker">
      {days.map((d) => (
        <li
          key={d.day}
          className={cn(
            'tabular flex flex-col gap-2 rounded-xl border border-border p-3',
            d.status === 'upcoming' && 'opacity-60',
            d.status === 'today' && 'border-primary/50',
            // Profitable day: green.
            d.actual?.gt(0) && 'border-success/60 bg-success/10',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 font-medium text-foreground">
                Day {d.day} <StatusBadge day={d} />
              </div>
              <div className="text-xs text-muted-foreground">{formatDate(d.date)}</div>
            </div>
            {d.actual ? <PLValue value={d.actual} format="amount" /> : <span className="text-xs text-muted-foreground">Upcoming</span>}
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <Field label="Target">{d.adjustedTarget ? formatAmount(d.adjustedTarget) : `${formatAmount(d.baseTarget)} base`}</Field>
            <Field label="Carried in"><Carry value={d.carryIn} /></Field>
            <Field label="Remaining">{amount(d.remaining)}</Field>
            <Field label="Excess">{amount(d.surplus)}</Field>
            <Field label="Daily return"><PLValue value={d.dailyReturnPct} format="percent" icon={false} /></Field>
            <Field label="Cumulative"><PLValue value={d.cumulativeReturnPct} format="percent" icon={false} /></Field>
          </dl>
          {d.trades.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-primary-text">
                {d.trades.length} sale{d.trades.length === 1 ? '' : 's'}
              </summary>
              <div className="mt-2">
                <Trades trades={d.trades} />
              </div>
            </details>
          )}
        </li>
      ))}
    </ul>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  )
}

const TH = 'px-3 py-2 text-right font-medium whitespace-nowrap'

function DayTable({ days }: { days: TrackerDay[] }) {
  const [open, setOpen] = useState<Set<number>>(() => new Set())
  const toggle = (day: number) =>
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })

  return (
    <div className="overflow-x-auto px-1 pb-2">
      <table className="w-full min-w-[960px] text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="px-4 py-2 text-left font-medium">Day</th>
            <th scope="col" className={TH}>Base</th>
            <th scope="col" className={TH}>Carried in</th>
            <th scope="col" className={TH}>Adjusted target</th>
            <th scope="col" className={TH}>Realized P/L</th>
            <th scope="col" className={TH}>Remaining</th>
            <th scope="col" className={TH}>Excess</th>
            <th scope="col" className={TH}>Daily %</th>
            <th scope="col" className={TH}>Cumulative</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {days.map((d) => {
            const expanded = open.has(d.day)
            return (
              <Fragment key={d.day}>
                <tr
                  className={cn(
                    'border-b border-border last:border-0',
                    d.status === 'upcoming' && 'text-muted-foreground',
                    d.status === 'today' && 'bg-primary/5',
                    // Profitable day: green row with a green line on the left.
                    d.actual?.gt(0) && 'bg-success/10 shadow-[inset_3px_0_0_var(--success)]',
                  )}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {d.trades.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggle(d.day)}
                          aria-expanded={expanded}
                          aria-label={`${expanded ? 'Hide' : 'Show'} sales of day ${d.day}`}
                          className="-m-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {expanded ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
                        </button>
                      ) : (
                        <span className="w-3.5" aria-hidden />
                      )}
                      <span className="font-medium text-foreground">{d.day}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(d.date)}</span>
                      <StatusBadge day={d} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(d.baseTarget)}</td>
                  <td className="px-3 py-2.5 text-right"><Carry value={d.carryIn} /></td>
                  <td className="px-3 py-2.5 text-right font-medium">{amount(d.adjustedTarget)}</td>
                  <td className="px-3 py-2.5 text-right">{d.actual ? <PLValue value={d.actual} format="amount" /> : dash}</td>
                  <td className="px-3 py-2.5 text-right">{amount(d.remaining)}</td>
                  <td className="px-3 py-2.5 text-right">{amount(d.surplus)}</td>
                  <td className="px-3 py-2.5 text-right"><PLValue value={d.dailyReturnPct} format="percent" icon={false} /></td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex flex-col items-end">
                      {d.cumulativeActual ? <PLValue value={d.cumulativeActual} format="amount" icon={false} /> : dash}
                      <span className="text-xs text-muted-foreground">of {formatAmount(d.cumulativeTarget)}</span>
                    </div>
                  </td>
                </tr>
                {expanded && (
                  <tr className="border-b border-border bg-muted/40">
                    <td colSpan={9} className="px-4 py-2.5 pl-11">
                      <Trades trades={d.trades} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** The daily log, collapsed to one summary row by default; click the title to open it. */
export function TrackerTable({ progress }: { progress: CycleProgress }) {
  const phone = useMediaQuery('(max-width: 767px)')
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const logged = progress.days.filter((d) => d.status !== 'upcoming').length
  return (
    <section aria-label="Daily log" className="surface-card">
      <div className="flex flex-wrap items-center gap-2 px-4 py-4 sm:px-5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden />
          <span className="text-sm font-semibold text-foreground">Daily log</span>
          <span className="tabular text-xs text-muted-foreground">
            {logged} day{logged === 1 ? '' : 's'} · <span className="text-success-text">{progress.profitableDays} profitable</span> ·{' '}
            <span className="text-destructive-text">{progress.losingDays} losing</span>
          </span>
        </button>
        <InfoTip
          label="the daily log"
          text="Realized P/L of the sales you recorded on each date. Adjusted target = base target + unrecovered shortfall − surplus credit from earlier days. A day without sales counts as $0. Coins you still hold don't count."
        />
      </div>
      {open && (
        <div id={bodyId} className="border-t border-border pt-3">
          <p className="px-4 text-xs text-muted-foreground sm:px-5">
            Informational for swing trading: profits come in steps, so judge the cycle total, not single days. From your{' '}
            <Link to="/investments" className="text-primary-text hover:underline">
              Investments
            </Link>{' '}
            (fees already deducted).
          </p>
          {phone ? <DayCards days={progress.days} /> : <DayTable days={progress.days} />}
        </div>
      )}
    </section>
  )
}
