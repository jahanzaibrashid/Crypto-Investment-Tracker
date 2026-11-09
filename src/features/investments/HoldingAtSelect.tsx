import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { controlText } from '@/components/ui/control'
import { useToast } from '@/components/ui/toast.context'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/formatters'
import { exchangeColor } from './exchanges'
import { useInvestmentMutations } from './investments.hooks'
import type { LotMetrics } from './investments.utils'

/**
 * "Held on" dropdown, an open lot's Hold status: the exchange or wallet the coins are in now, in that
 * place's own color (see exchangeColor). Same build as ProfitStatusSelect (pill + invisible native select).
 * Picking a place moves the lot there, e.g. Binance → MetaMask BSC. A brand-new name is added from the
 * Edit dialog, then shows up here too.
 */
export function HoldingAtSelect({ lot, options }: { lot: LotMetrics; options: readonly string[] }) {
  const { updateExchange } = useInvestmentMutations()
  const toast = useToast()
  const inv = lot.investment
  const current = inv.exchange ?? ''
  // The lot's own value is always selectable, even if the list doesn't have it.
  const names = current && !options.includes(current) ? [current, ...options] : options
  // Each place has its own color (Binance blue, MetaMask ETH amber, …); not set = grey.
  const color = exchangeColor(current)
  return (
    <Badge
      size="lg"
      tone={color.badge}
      title={current ? `Held on ${current}` : 'Where these coins are held'}
      className="relative max-w-32 focus-within:ring-2 focus-within:ring-ring/60 pointer-coarse:py-1"
    >
      <span className={cn('truncate', !current && 'text-muted-foreground')}>{current || 'Not set'}</span>
      <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
      <select
        aria-label={`Held on: ${inv.symbol} bought ${formatDate(inv.buyDate)}`}
        value={current}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) =>
          updateExchange.mutate({ ids: [inv.id], exchange: e.target.value || null }, { onError: (err) => toast.error(errorMessage(err)) })
        }
        className={cn('absolute inset-0 cursor-pointer rounded-full opacity-0', controlText)}
      >
        <option value="" className={cn('bg-popover', exchangeColor(null).text)}>
          Not set
        </option>
        {names.map((name) => (
          <option key={name} value={name} className={cn('bg-popover', exchangeColor(name).text)}>
            {name}
          </option>
        ))}
      </select>
    </Badge>
  )
}
