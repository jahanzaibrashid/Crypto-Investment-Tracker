import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/cn'
import { setThemePreference, useThemePreference, type ThemePreference } from '@/lib/theme'

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light theme', icon: Sun },
  { value: 'dark', label: 'Dark theme', icon: Moon },
  { value: 'system', label: 'System theme', icon: Monitor },
]

/** Light / Dark / System segmented control. */
export function ThemeToggle({ className }: { className?: string }) {
  const current = useThemePreference()
  return (
    <div role="radiogroup" aria-label="Color theme" className={cn('inline-flex rounded-lg border border-border bg-card p-0.5', className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = current === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setThemePreference(value)}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md transition-colors pointer-coarse:h-8 pointer-coarse:w-8',
              active ? 'bg-muted text-primary-text' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
