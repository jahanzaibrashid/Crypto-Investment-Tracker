import { NavLink } from 'react-router'
import { LayoutDashboard, List, NotebookPen, PieChart } from 'lucide-react'
import { cn } from '@/lib/cn'

const PAGES = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/holdings', label: 'Holdings', icon: PieChart },
  { to: '/investments', label: 'Investments', icon: List },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
] as const

/** Page navigation: vertical in the desktop sidebar, scrollable pills on small screens. The current page is highlighted. */
export function SectionNav({ variant }: { variant: 'sidebar' | 'pills' }) {
  const sidebar = variant === 'sidebar'
  return (
    <nav aria-label="Main" className={sidebar ? 'flex flex-col gap-0.5' : '-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 scrollbar-none'}>
      {PAGES.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'flex shrink-0 items-center gap-2 font-medium transition-colors',
              sidebar ? 'rounded-lg px-2.5 py-2 text-sm' : 'rounded-full border px-3 py-1 text-xs',
              isActive
                ? cn('bg-primary/10 text-primary-text', !sidebar && 'border-primary/40')
                : cn('text-muted-foreground hover:bg-muted hover:text-foreground', !sidebar && 'border-border'),
            )
          }
        >
          <Icon className={sidebar ? 'h-4 w-4' : 'h-3.5 w-3.5'} aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
