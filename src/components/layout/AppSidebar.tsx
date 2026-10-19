import { LineChart } from 'lucide-react'
import { SectionNav } from './SectionNav'

/** App logo and name, shown at the top of the sidebar and the mobile drawer. */
export function AppBrand() {
  return (
    <div className="flex items-center gap-2 px-2 text-foreground">
      <span className="rounded-lg bg-primary/10 p-1.5 text-primary-text">
        <LineChart className="h-4 w-4" aria-hidden />
      </span>
      <span className="text-sm leading-tight font-semibold">
        Crypto Investment
        <br />
        Tracker
      </span>
    </div>
  )
}

export const DISCLAIMER = 'Prices: CoinGecko (USD). Values are estimates and not financial advice.'

/** Desktop navigation (≥ lg). Smaller screens open the same navigation in a drawer (MobileNavDrawer). */
export function AppSidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-sidebar px-3 py-5 lg:flex">
      <div className="mb-6">
        <AppBrand />
      </div>
      <SectionNav />
      <p className="mt-auto px-2 text-[11px] leading-relaxed text-muted-foreground">{DISCLAIMER}</p>
    </aside>
  )
}
