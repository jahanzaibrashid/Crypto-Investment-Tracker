import { Settings } from 'lucide-react'
import { APP_NAME } from '@/lib/constants'

/** Shown instead of the app when required configuration is absent — never a silent fallback. */
export function ConfigMissing({ missing }: { missing: string[] }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="max-w-lg rounded-2xl border border-warning/40 bg-card p-6 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-warning-text">
          <Settings className="h-5 w-5" aria-hidden />
          <h1 className="text-base font-semibold">{APP_NAME} is not configured</h1>
        </div>
        <p className="text-sm text-foreground">These environment variables are missing:</p>
        <ul className="my-3 list-disc pl-6 font-mono text-sm text-foreground">
          {missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Copy <code>.env.example</code> to <code>.env</code>, add your Supabase project URL and anon key, then restart the dev
          server. On Vercel, add them under Project → Settings → Environment Variables and redeploy. See README → “Environment variables”.
        </p>
      </section>
    </main>
  )
}
