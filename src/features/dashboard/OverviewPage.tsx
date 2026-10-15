import { Link } from 'react-router'
import { ArrowRight, Plus, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { PortfolioGate } from './DashboardLayout'
import { PortfolioSummary } from './PortfolioSummary'
import { usePortfolio } from './portfolio.context'

const linkButton =
  'inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors'

export function OverviewPage() {
  const { investmentsQuery, summary, lots } = usePortfolio()
  const empty = !investmentsQuery.isLoading && lots.length === 0

  return (
    <>
      <PageHeader
        title="Overview"
        description="Portfolio totals across all of your investments."
        actions={
          <Link to="/investments" state={{ openAdd: true }} className={`${linkButton} bg-primary-solid text-primary-foreground hover:bg-primary-solid-hover`}>
            <Plus className="h-4 w-4" aria-hidden />
            Add Investment
          </Link>
        }
      />
      <PortfolioGate>
        {empty ? (
          <div className="surface-card">
            <EmptyState
              icon={<Wallet className="h-5 w-5" aria-hidden />}
              title="No investments yet"
              description="Add your first crypto purchase to start tracking value, profit/loss and ROI."
              action={
                <Link to="/investments" state={{ openAdd: true }} className={`${linkButton} bg-primary-solid text-primary-foreground hover:bg-primary-solid-hover`}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add your first investment
                </Link>
              }
            />
          </div>
        ) : (
          <>
            <PortfolioSummary summary={summary} loading={investmentsQuery.isLoading} />
            <div className="flex flex-wrap gap-2">
              <Link to="/holdings" className={`${linkButton} border border-border bg-card text-foreground shadow-card hover:bg-muted`}>
                Holdings by coin <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link to="/investments" className={`${linkButton} border border-border bg-card text-foreground shadow-card hover:bg-muted`}>
                All investments <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </>
        )}
      </PortfolioGate>
    </>
  )
}
