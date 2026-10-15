import { LineChart } from 'lucide-react'
import { SectionNav } from './SectionNav'

/** Desktop navigation (≥ lg). Smaller screens use the section pills in the header. */
export function AppSidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-sidebar px-3 py-5 lg:flex">
      <div className="mb-6 flex items-center gap-2 px-2 text-foreground">
        <span className="rounded-lg bg-primary/10 p-1.5 text-primary-text">
          <LineChart className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-sm leading-tight font-semibold">
          Crypto Investment
          <br />
          Tracker
        </span>
      </div>
      <SectionNav variant="sidebar" />
      <p className="mt-auto px-2 text-[11px] leading-relaxed text-muted-foreground">
        Prices: CoinGecko (USD). Values are estimates and not financial advice.
      </p>
    </aside>
  )
}
