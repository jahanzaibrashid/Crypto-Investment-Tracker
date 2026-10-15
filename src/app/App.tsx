import { BrowserRouter } from 'react-router'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { missingEnvVars } from '@/lib/env'
import { ConfigMissing } from './ConfigMissing'
import { Providers } from './providers'
import { PwaUpdatePrompt } from './PwaUpdatePrompt'
import { AppRoutes } from './routes'

export function App() {
  const missing = missingEnvVars()
  if (missing.length > 0) return <ConfigMissing missing={missing} />

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Providers>
          <AppRoutes />
        </Providers>
      </BrowserRouter>
      <PwaUpdatePrompt />
    </ErrorBoundary>
  )
}
