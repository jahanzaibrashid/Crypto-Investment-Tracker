import { positionKind, type LotMetrics, type PositionKind } from './investments.utils'

export type StatusFilter = 'ALL' | PositionKind

export interface InvestmentFilterState {
  search: string
  status: StatusFilter
  /** Inclusive buy-date range, YYYY-MM-DD or '' */
  from: string
  to: string
}

export const EMPTY_FILTERS: InvestmentFilterState = { search: '', status: 'ALL', from: '', to: '' }

export function hasActiveFilters(f: InvestmentFilterState): boolean {
  return f.search.trim() !== '' || f.status !== 'ALL' || f.from !== '' || f.to !== ''
}

export function filterLots(lots: LotMetrics[], f: InvestmentFilterState): LotMetrics[] {
  const q = f.search.trim().toLowerCase()
  return lots.filter((lot) => {
    const inv = lot.investment
    if (q && !inv.coinName.toLowerCase().includes(q) && !inv.symbol.toLowerCase().includes(q) && !inv.coinId.includes(q)) {
      return false
    }
    if (f.status !== 'ALL' && positionKind(lot) !== f.status) return false
    if (f.from && inv.buyDate < f.from) return false
    if (f.to && inv.buyDate > f.to) return false
    return true
  })
}
