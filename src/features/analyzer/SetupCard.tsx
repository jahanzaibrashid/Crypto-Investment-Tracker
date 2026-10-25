import type { ReactNode } from 'react'
import { CheckCircle2, CircleHelp, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/formatters'
import type { TradeSetup } from './setup'
import { formatPkt } from './time'

const usd = (n: number) => formatPrice(n.toFixed(2))

const STATUS = {
  valid: { label: 'Valid setup', tone: 'positive' },
  waiting: { label: 'Waiting', tone: 'info' },
  'no-trade': { label: 'No trade', tone: 'neutral' },
} as const

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular text-sm font-semibold wrap-anywhere text-foreground">{children}</dd>
    </div>
  )
}

/** One strategy's result: plan (if any), the conditions checklist, reasons and invalidation. */
export function SetupCard({ setup: s, pair, timeframe, price }: { setup: TradeSetup; pair: string; timeframe: string; price: number }) {
  const status = STATUS[s.status]
  return (
    <div className={cn('flex flex-col gap-3 rounded-xl border p-3 sm:p-4', s.status === 'valid' ? 'border-success/50 bg-success/5' : 'border-border bg-background')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{s.title}</p>
          <p className="text-xs text-muted-foreground">
            {pair} · {timeframe} · {s.direction === 'bullish' ? 'Bullish (buy)' : s.direction === 'bearish' ? 'Bearish (spot: no buy)' : 'No direction'} · price{' '}
            {usd(price)} · candle {formatPkt(s.time)}
          </p>
        </div>
        <Badge tone={status.tone} size="lg">
          {status.label}
        </Badge>
      </div>

      {s.entry && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Entry zone">
            {usd(s.entry.from)} – {usd(s.entry.to)}
          </Field>
          <Field label="Stop-loss">{s.stopLoss !== null ? usd(s.stopLoss) : '—'}</Field>
          <Field label="Take-profit">
            {s.targets.map((t) => (
              <span key={t.label} className="block">
                {usd(t.price)} <span className="text-xs font-normal text-muted-foreground">{t.label}</span>
              </span>
            ))}
          </Field>
          <Field label="Reward : risk (TP1)">{s.rewardRisk !== null ? `${s.rewardRisk.toFixed(2)} : 1` : '—'}</Field>
        </dl>
      )}
      {s.conditions.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Conditions">
          {s.conditions.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              {c.met === true ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-text" aria-label="Met" />
              ) : c.met === false ? (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive-text" aria-label="Not met" />
              ) : (
                <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Unknown" />
              )}
              <span className="min-w-0">
                <span className="text-foreground">{c.label}</span>
                {c.required && <span className="ml-1 text-xs text-muted-foreground">(required)</span>}
                <span className="block text-xs text-muted-foreground">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {s.reasons.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground">Why</h4>
          <ul className="mt-1 list-disc pl-5 text-sm text-foreground">
            {s.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {s.invalidations.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground">Invalid if</h4>
          <ul className="mt-1 list-disc pl-5 text-sm text-foreground">
            {s.invalidations.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
