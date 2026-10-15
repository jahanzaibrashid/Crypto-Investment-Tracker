import { ArrowDownRight, ArrowUpRight, Hourglass, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { POSITION_KIND_LABEL, positionKind, type LotMetrics, type PositionKind } from './investments.utils'

const TONE = { HOLDING: 'info', LONG_TERM: 'longTerm', SOLD_PROFIT: 'positive', SOLD_LOSS: 'negative' } as const
const ICON = { HOLDING: Wallet, LONG_TERM: Hourglass, SOLD_PROFIT: ArrowUpRight, SOLD_LOSS: ArrowDownRight }

/** Holding / Long-term / Sold · Profit / Sold · Loss — label + icon + color, never color alone. */
export function PositionStatusBadge({ lot, kind = positionKind(lot), size }: { lot: LotMetrics; kind?: PositionKind; size?: 'md' | 'lg' }) {
  const Icon = ICON[kind]
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Badge size={size} tone={TONE[kind]}>
        <Icon className="h-3 w-3" aria-hidden />
        {POSITION_KIND_LABEL[kind]}
      </Badge>
      {lot.isPartiallySold && <Badge size={size} tone="warning">Partial sale</Badge>}
    </div>
  )
}
