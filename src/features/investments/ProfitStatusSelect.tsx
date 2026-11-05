import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { controlText } from '@/components/ui/control'
import { useToast } from '@/components/ui/toast.context'
import { cn } from '@/lib/cn'
import { PROFIT_STATUSES } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/formatters'
import { useInvestmentMutations } from './investments.hooks'
import type { ProfitStatus } from './investments.types'
import type { LotMetrics } from './investments.utils'

/** One color per status: the pill, and the same status's line in the open list. */
const TONES = {
  '': { badge: 'neutral', text: 'text-muted-foreground' },
  SPENT: { badge: 'negative', text: 'text-destructive-text' },
  METAMASK_ETH: { badge: 'warning', text: 'text-warning-text' },
  METAMASK_BSC: { badge: 'longTerm', text: 'text-long-term-text' },
  METAMASK_MATIC: { badge: 'violet', text: 'text-violet-text' },
  BINANCE_SPOT: { badge: 'info', text: 'text-primary-text' },
  BINANCE_FUNDING: { badge: 'positive', text: 'text-success-text' },
} as const

/**
 * The Profit status dropdown in a table row: a status pill with an invisible native select on top, so the
 * pill fits its label and the browser's own list still opens. Clicks and keys must not also open the row's details.
 */
export function ProfitStatusSelect({ lot }: { lot: LotMetrics }) {
  const { updateProfitStatus } = useInvestmentMutations()
  const toast = useToast()
  const inv = lot.investment
  // A value this app version doesn't know reads as not selected rather than breaking the table.
  const status = PROFIT_STATUSES.find((s) => s.value === inv.profitStatus) ?? PROFIT_STATUSES[0]
  return (
    <Badge size="lg" tone={TONES[status.value].badge} className="relative focus-within:ring-2 focus-within:ring-ring/60 pointer-coarse:py-1">
      {status.label}
      <ChevronDown className="h-3 w-3" aria-hidden />
      <select
        aria-label={`Profit status: ${inv.symbol} bought ${formatDate(inv.buyDate)}`}
        value={status.value}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) =>
          updateProfitStatus.mutate(
            { id: inv.id, profitStatus: (e.target.value || null) as ProfitStatus | null },
            { onError: (err) => toast.error(errorMessage(err)) },
          )
        }
        className={cn('absolute inset-0 cursor-pointer rounded-full opacity-0', controlText)}
      >
        {PROFIT_STATUSES.map((s) => (
          <option key={s.value} value={s.value} className={cn('bg-popover', TONES[s.value].text)}>
            {s.label}
          </option>
        ))}
      </select>
    </Badge>
  )
}
