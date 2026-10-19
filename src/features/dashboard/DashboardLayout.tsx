import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Outlet } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { MobileNavDrawer } from '@/components/layout/MobileNavDrawer'
import { PageContainer } from '@/components/layout/PageContainer'
import { ErrorState } from '@/components/ui/ErrorState'
import { useToast } from '@/components/ui/toast.context'
import { errorMessage } from '@/lib/errors'
import { useAuth, useUserId } from '@/features/auth/auth.context'
import { ImportDialog } from '@/features/import/ImportDialog'
import { useInvestments } from '@/features/investments/investments.hooks'
import { aggregateByCoin, computeLot, summarizePortfolio } from '@/features/investments/investments.utils'
import { noteKeys } from '@/features/notes/notes.hooks'
import { fetchPortfolioNote } from '@/features/notes/notes.service'
import { describeMarketDataError } from '@/features/prices/coingecko.service'
import { usePrices } from '@/features/prices/prices.hooks'
import { PortfolioContext, usePortfolio, type PortfolioContextValue } from './portfolio.context'

/**
 * Shell for the authenticated pages (Overview, Holdings, Investments, Notes):
 * sidebar, header actions, price warnings, and the shared portfolio data.
 */
export function DashboardLayout() {
  const { user, signOut } = useAuth()
  const userId = useUserId()
  const toast = useToast()
  const queryClient = useQueryClient()
  const investmentsQuery = useInvestments()

  const investments = investmentsQuery.data
  // Only open positions need a live price; sold lots are valued at their sale.
  const openCoinIds = useMemo(
    () => [...new Set((investments ?? []).filter((i) => i.status === 'HOLDING').map((i) => i.coinId))],
    [investments],
  )
  const prices = usePrices(openCoinIds)
  const lots = useMemo(() => (investments ?? []).map((i) => computeLot(i, prices.getQuote)), [investments, prices.getQuote])
  const summary = useMemo(() => (investments ? summarizePortfolio(lots) : null), [investments, lots])
  const positions = useMemo(() => (summary ? aggregateByCoin(lots, summary.currentValue) : []), [lots, summary])

  const value = useMemo<PortfolioContextValue>(
    () => ({ investmentsQuery, prices, lots, summary, positions }),
    [investmentsQuery, prices, lots, summary, positions],
  )

  const [exporting, setExporting] = useState(false)
  const handleExport = async () => {
    if (!summary) return
    setExporting(true)
    try {
      let note: string | null
      try {
        note = (await queryClient.ensureQueryData({ queryKey: noteKeys.portfolio(userId), queryFn: fetchPortfolioNote })).note
      } catch {
        note = '(portfolio note could not be loaded at export time)'
      }
      const { exportToExcel } = await import('@/features/export/excel.service')
      const file = exportToExcel({
        lots,
        summary,
        portfolioNote: note,
        exportedAt: Date.now(),
        pricesFetchedAt: prices.lastSuccessAt,
        pricesStale: prices.isStale,
      })
      toast.success(`Exported ${lots.length} investment${lots.length === 1 ? '' : 's'} to ${file}.`)
    } catch (e) {
      toast.error(`Export failed: ${errorMessage(e, 'unknown error')}`)
    } finally {
      setExporting(false)
    }
  }

  // Import: a hidden file picker opened by the header button; the dialog previews and confirms.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importFile, setImportFile] = useState<File | null>(null)

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const [menuOpen, setMenuOpen] = useState(false)
  const online = useOnlineStatus()
  // Offline already has its own banner; a "network error" on top of it adds nothing.
  const priceError = prices.error && online ? describeMarketDataError(prices.error) : null

  return (
    <PortfolioContext.Provider value={value}>
      <div className="flex min-h-screen">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader
            email={user?.email ?? null}
            lastPriceUpdate={prices.lastSuccessAt}
            pricesStale={prices.isStale}
            pricesRefreshing={prices.isFetching}
            priceError={priceError}
            onRefreshPrices={() => void prices.refresh()}
            onImport={() => fileInputRef.current?.click()}
            importDisabled={!investments}
            onExport={handleExport}
            exporting={exporting}
            exportDisabled={!investments || investments.length === 0}
            onSignOut={handleSignOut}
            onOpenMenu={() => setMenuOpen(true)}
            menuOpen={menuOpen}
          />
          <MobileNavDrawer
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            email={user?.email ?? null}
            onRefreshPrices={() => void prices.refresh()}
            pricesRefreshing={prices.isFetching}
            onImport={() => fileInputRef.current?.click()}
            importDisabled={!investments}
            onExport={handleExport}
            exporting={exporting}
            exportDisabled={!investments || investments.length === 0}
            onSignOut={handleSignOut}
          />
          <PageContainer>
            {!online && (
              <div role="status" className="flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">
                <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>You're offline. Showing the last loaded data; changes and price updates resume when you reconnect.</span>
              </div>
            )}
            {priceError && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden />
                <span>
                  {priceError}
                  {prices.lastSuccessAt ? ' Prices shown are the last successful update and are marked stale.' : ' Current values are unavailable.'}
                </span>
              </div>
            )}
            <Outlet />
          </PageContainer>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            data-testid="import-file-input"
            onChange={(e) => {
              setImportFile(e.target.files?.[0] ?? null)
              e.target.value = '' // allow choosing the same file again
            }}
          />
          <ImportDialog file={importFile} existing={investments ?? []} onClose={() => setImportFile(null)} />
        </div>
      </div>
    </PortfolioContext.Provider>
  )
}

/** Renders a retryable error instead of the page when investments failed to load. */
export function PortfolioGate({ children }: { children: ReactNode }) {
  const { investmentsQuery } = usePortfolio()
  if (investmentsQuery.isError) {
    return (
      <ErrorState
        title="Could not load your investments"
        message={errorMessage(investmentsQuery.error)}
        onRetry={() => investmentsQuery.refetch()}
        retrying={investmentsQuery.isFetching}
      />
    )
  }
  return <>{children}</>
}
