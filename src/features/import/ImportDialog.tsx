import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, CopyMinus, FileSpreadsheet } from 'lucide-react'
import { FormAlert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { LoadingState } from '@/components/ui/LoadingState'
import { useToast } from '@/components/ui/toast.context'
import { errorMessage } from '@/lib/errors'
import { formatShortDate } from '@/lib/formatters'
import { useInvestmentMutations } from '@/features/investments/investments.hooks'
import type { Investment } from '@/features/investments/investments.types'
import type { ImportRowError, ParsedLot } from './excel-import.service'

/** How many problem rows to list before summarizing the rest. */
const MAX_LISTED = 50

interface Preview {
  toImport: ParsedLot[]
  duplicates: ParsedLot[]
  errors: ImportRowError[]
}

type State = { kind: 'reading' } | { kind: 'failed'; message: string } | { kind: 'preview'; preview: Preview }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function Section({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

function RowList({ items }: { items: string[] }) {
  return (
    <ul className="max-h-40 list-disc overflow-y-auto overscroll-contain pl-5 text-xs text-muted-foreground">
      {items.slice(0, MAX_LISTED).map((item, i) => (
        <li key={i}>{item}</li>
      ))}
      {items.length > MAX_LISTED && <li>…and {items.length - MAX_LISTED} more</li>}
    </ul>
  )
}

/**
 * Reads the chosen workbook, shows what will be added / skipped / rejected, and imports
 * only after the user confirms. Existing investments are never changed.
 */
export function ImportDialog({ file, existing, onClose }: { file: File | null; existing: Investment[]; onClose: () => void }) {
  const { importLots } = useInvestmentMutations()
  const toast = useToast()
  const [state, setState] = useState<State>({ kind: 'reading' })
  const [saveError, setSaveError] = useState<string | null>(null)
  // A different file was chosen: start over (reset during render, not in the effect).
  const [shownFile, setShownFile] = useState(file)
  if (file !== shownFile) {
    setShownFile(file)
    setState({ kind: 'reading' })
    setSaveError(null)
  }

  // Parse whenever a new file is chosen. `existing` is read once per file so a background
  // refetch doesn't re-run the preview while the user is looking at it.
  useEffect(() => {
    if (!file) return
    let cancelled = false
    ;(async () => {
      try {
        const { ImportFileError, MAX_IMPORT_FILE_BYTES, parseImportWorkbook, splitDuplicates } = await import('./excel-import.service')
        if (file.size > MAX_IMPORT_FILE_BYTES) throw new ImportFileError('The file is larger than 5 MB. Choose an export from this app.')
        const parsed = parseImportWorkbook(await file.arrayBuffer())
        const { toImport, duplicates } = splitDuplicates(parsed.lots, existing)
        if (!cancelled) setState({ kind: 'preview', preview: { toImport, duplicates, errors: parsed.errors } })
      } catch (e) {
        if (!cancelled) setState({ kind: 'failed', message: errorMessage(e, 'This file could not be read.') })
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  const pending = importLots.isPending
  const preview = state.kind === 'preview' ? state.preview : null
  const count = preview?.toImport.length ?? 0
  const saleCount = preview?.toImport.reduce((n, p) => n + p.lot.sales.length, 0) ?? 0

  const confirm = async () => {
    if (!preview || count === 0) return
    setSaveError(null)
    try {
      const imported = await importLots.mutateAsync(preview.toImport.map((p) => p.lot))
      const skipped = preview.duplicates.length + new Set(preview.errors.filter((e) => e.sheet === 'Investments').map((e) => e.row)).size
      toast.success(`Imported ${plural(imported, 'investment')}${skipped ? `; ${skipped} skipped` : ''}.`)
      onClose()
    } catch (e) {
      setSaveError(`${errorMessage(e)} Nothing was imported.`)
    }
  }

  const lotLabel = (p: ParsedLot) => `Row ${p.row}: ${p.lot.symbol} bought ${formatShortDate(p.lot.buyDate)}`

  return (
    <Dialog
      open={file !== null}
      onClose={onClose}
      dismissible={!pending}
      title="Import investments"
      description={
        file ? (
          <span className="inline-flex items-center gap-1.5 break-all">
            <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
            {file.name}
          </span>
        ) : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} loading={pending} disabled={!preview || count === 0}>
            {count > 0 ? `Import ${plural(count, 'investment')}` : 'Nothing to import'}
          </Button>
        </>
      }
    >
      {state.kind === 'reading' && <LoadingState label="Reading file…" />}

      {state.kind === 'failed' && <FormAlert tone="error">{state.message}</FormAlert>}

      {preview && (
        <div className="flex flex-col gap-3 text-sm" aria-live="polite">
          {saveError && <FormAlert tone="error">{saveError}</FormAlert>}

          <Section
            icon={<CheckCircle2 className="h-4 w-4 shrink-0 text-success-text" aria-hidden />}
            title={
              count > 0
                ? `${plural(count, 'new investment')}${saleCount ? ` (with ${plural(saleCount, 'sale')})` : ''} will be added`
                : 'No new investments to add'
            }
          >
            <p className="text-xs text-muted-foreground">
              They are added to your account only. Your existing investments are not changed or removed.
            </p>
          </Section>

          {preview.duplicates.length > 0 && (
            <Section
              icon={<CopyMinus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
              title={`${plural(preview.duplicates.length, 'investment')} already in your portfolio will be skipped`}
            >
              <p className="text-xs text-muted-foreground">Same coin, buy date, price, quantity and fee as an investment you already have.</p>
              <RowList items={preview.duplicates.map(lotLabel)} />
            </Section>
          )}

          {preview.errors.length > 0 && (
            <Section
              icon={<AlertTriangle className="h-4 w-4 shrink-0 text-warning-text" aria-hidden />}
              title={`${plural(preview.errors.length, 'row')} can't be imported`}
            >
              <RowList items={preview.errors.map((e) => `${e.sheet} row ${e.row}: ${e.message}`)} />
              <p className="text-xs text-muted-foreground">Fix these rows in the file and import it again; rows already imported will be skipped as duplicates.</p>
            </Section>
          )}
        </div>
      )}
    </Dialog>
  )
}
