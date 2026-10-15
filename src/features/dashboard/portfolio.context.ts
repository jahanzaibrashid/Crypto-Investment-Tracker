import { createContext, useContext } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Investment } from '@/features/investments/investments.types'
import type { CoinPosition, LotMetrics, PortfolioSummary } from '@/features/investments/investments.utils'
import type { PriceBook } from '@/features/prices/prices.hooks'

/** Portfolio data computed once in DashboardLayout and shared by every dashboard page. */
export interface PortfolioContextValue {
  investmentsQuery: UseQueryResult<Investment[]>
  prices: PriceBook
  lots: LotMetrics[]
  summary: PortfolioSummary | null
  positions: CoinPosition[]
}

export const PortfolioContext = createContext<PortfolioContextValue | null>(null)

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext)
  if (!ctx) throw new Error('usePortfolio must be used inside <DashboardLayout>')
  return ctx
}
