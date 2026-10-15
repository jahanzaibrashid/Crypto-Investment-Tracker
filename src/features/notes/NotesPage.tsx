import { PageHeader } from '@/components/layout/PageHeader'
import { PortfolioNote } from './PortfolioNote'

export function NotesPage() {
  return (
    <>
      <PageHeader title="Notes" description="Portfolio-level notes, synced to your account across devices." />
      <PortfolioNote />
    </>
  )
}
