import { Link } from 'react-router'
import { PieChart } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/LoadingState'
import { PortfolioGate } from './DashboardLayout'
import { PortfolioStats } from './PortfolioStats'
import { usePortfolio } from './portfolio.context'

export function HoldingsPage() {
  const { investmentsQuery, positions } = usePortfolio()
  const hasOpen = positions.some((p) => p.remainingQuantity.gt(0))

  return (
    <>
      <PageHeader title="Holdings" description="Open positions per coin — multiple purchases of the same coin combined." />
      <PortfolioGate>
        {investmentsQuery.isLoading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : hasOpen ? (
          <PortfolioStats positions={positions} />
        ) : (
          <div className="surface-card">
            <EmptyState
              icon={<PieChart className="h-5 w-5" aria-hidden />}
              title="No open holdings"
              description="Coins you still hold appear here. Sold positions are listed on the Investments page."
              action={
                <Link to="/investments" className="text-sm font-medium text-primary-text hover:underline">
                  Go to Investments
                </Link>
              }
            />
          </div>
        )}
      </PortfolioGate>
    </>
  )
}
