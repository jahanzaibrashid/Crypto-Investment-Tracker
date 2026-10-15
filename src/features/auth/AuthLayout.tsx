import type { ReactNode } from 'react'
import { LineChart } from 'lucide-react'
import { APP_NAME } from '@/lib/constants'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-foreground">
          <span className="rounded-lg bg-primary/10 p-2 text-primary-text">
            <LineChart className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
        </div>
        <section className="surface-card p-6">
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </section>
        {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </main>
  )
}
