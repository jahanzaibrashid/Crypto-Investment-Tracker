import { Badge } from '@/components/ui/Badge'
import type { PriceStatus } from '@/features/prices/prices.types'

export function PriceStatusBadge({ status, size }: { status: PriceStatus; size?: 'md' | 'lg' }) {
  switch (status) {
    case 'stale':
      return (
        <Badge size={size} tone="warning" title="Last known price — the latest refresh failed or the quote is old">
          Stale
        </Badge>
      )
    case 'unavailable':
      return (
        <Badge size={size} tone="negative" title="No current price available from CoinGecko">
          No price
        </Badge>
      )
    case 'loading':
      return <Badge size={size} tone="neutral">Loading</Badge>
    default:
      return null
  }
}
