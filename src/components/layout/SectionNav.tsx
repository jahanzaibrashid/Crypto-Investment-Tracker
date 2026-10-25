import { NavLink } from 'react-router'
import { CandlestickChart, LayoutDashboard, List, NotebookPen, PieChart, Target } from 'lucide-react'
import { cn } from '@/lib/cn'

const PAGES = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/holdings', label: 'Holdings', icon: PieChart },
  { to: '/investments', label: 'Investments', icon: List },
  { to: '/strategy', label: 'Strategy', icon: Target },
  { to: '/analyzer', label: 'Analyzer', icon: CandlestickChart },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
] as const

/**
 * Page navigation, used in the desktop sidebar and the mobile drawer. The current page is
 * highlighted. `onNavigate` runs after a link is chosen (the drawer closes itself with it).
 */
export function SectionNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {PAGES.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors pointer-coarse:py-2.5',
              isActive ? 'bg-primary/10 text-primary-text' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          }
        >
          <Icon className="h-4 w-4" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
