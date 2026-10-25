import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { DEFAULT_SESSIONS, sessionWindows, tzOffsetMs, type SessionWindow } from './sessions'
import { formatPktTime, PKT_ZONE } from './time'

const DAY = 86_400_000

const dayName = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { timeZone: PKT_ZONE, weekday: 'long', day: 'numeric', month: 'short' })
const pktDay = (ms: number) => Math.floor((ms + tzOffsetMs(ms, PKT_ZONE)) / DAY)

function until(ms: number, now: number): string {
  const mins = Math.max(0, Math.round((ms - now) / 60_000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

/**
 * When each trading session opens and closes in Pakistan time (PKT, UTC+5, no daylight saving).
 * London and New York move one hour earlier in PKT during their summer time. No sessions at the
 * weekend, so on Saturday/Sunday Monday's times are shown.
 */
export function SessionTimes({ now }: { now: number }) {
  const today = pktDay(now)
  const weekday = new Date(today * DAY).getUTCDay()
  const showDay = weekday === 6 ? today + 2 : weekday === 0 ? today + 1 : today
  const windows = sessionWindows(DEFAULT_SESSIONS, now - DAY, now + 4 * DAY)
  const live = windows.filter((w) => w.start <= now && now < w.end)
  const shown: SessionWindow[] = [...live, ...windows.filter((w) => pktDay(w.start) === showDay && !live.includes(w))].sort((a, b) => a.start - b.start)
  const weekend = showDay !== today

  const next = windows.find((w) => w.start > now)
  const summary = live.length
    ? `${live.map((w) => w.label).join(' + ')} open now`
    : next
      ? `${next.label} opens in ${until(next.start, now)}`
      : 'No session open'

  // Closed by default; opens on click, like the trade-management guide.
  return (
    <details className="surface-card group p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-center gap-2">
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
          <span className="text-sm font-semibold text-foreground">Trading sessions (Pakistan time)</span>
        </span>
        <Badge tone={live.length ? 'positive' : 'neutral'}>{summary}</Badge>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {weekend ? `Weekend: the big markets are closed. Next sessions: ${dayName(showDay * DAY + DAY / 2)}.` : dayName(now)}. Crypto trades 24/7, but volume and
          volatility usually rise when these markets are open. London and New York open one hour earlier in PKT during their summer time.
        </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {shown.map((w) => {
          const isLive = w.start <= now && now < w.end
          const isDone = now >= w.end
          const s = DEFAULT_SESSIONS.sessions[w.id]
          return (
            <li
              key={`${w.id}-${w.start}`}
              className={cn('tabular flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm', isLive ? 'border-success/50 bg-success/5' : 'border-border bg-background')}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">{w.label}</span>
                {isLive ? (
                  <Badge tone="positive">Open now</Badge>
                ) : isDone ? (
                  <Badge tone="neutral">Closed</Badge>
                ) : (
                  <Badge tone="info">Opens in {until(w.start, now)}</Badge>
                )}
              </span>
              <span className="text-base font-semibold text-foreground">
                {formatPktTime(w.start)} – {formatPktTime(w.end)}
                {pktDay(w.end) !== pktDay(w.start) && <span className="ml-1 text-xs font-normal text-muted-foreground">(next day)</span>}
              </span>
              <span className="text-xs text-muted-foreground">
                {isLive ? `Closes in ${until(w.end, now)} · ` : ''}
                {s.start}–{s.end} {s.timeZone.split('/')[1]!.replace('_', ' ')} time
              </span>
            </li>
          )
        })}
      </ul>
      </div>
    </details>
  )
}
