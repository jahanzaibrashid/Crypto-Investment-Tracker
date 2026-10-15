import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Cloud, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/LoadingState'
import { controlClass } from '@/components/ui/control'
import { cn } from '@/lib/cn'
import { useToast } from '@/components/ui/toast.context'
import { LIMITS } from '@/lib/constants'
import { ConflictError, errorMessage } from '@/lib/errors'
import { formatRelative } from '@/lib/formatters'
import { useNow } from '@/hooks/useNow'
import { usePortfolioNote, usePortfolioNoteRealtime, useSavePortfolioNote } from './notes.hooks'
import type { PortfolioNote as PortfolioNoteData } from './notes.service'

const AUTOSAVE_DELAY_MS = 1500

/**
 * Portfolio-level note with autosave and optimistic concurrency:
 * every save sends the version it was based on; if another device saved in
 * between, the save is rejected and the user chooses which text to keep.
 */
export function PortfolioNote() {
  const textareaId = useId()
  const query = usePortfolioNote()
  usePortfolioNoteRealtime()
  const save = useSavePortfolioNote()
  const toast = useToast()
  const now = useNow(30_000)

  const [draft, setDraft] = useState('')
  const [base, setBase] = useState<PortfolioNoteData | null>(null)
  const [dirty, setDirty] = useState(false)
  const [failed, setFailed] = useState(false)
  const draftRef = useRef('')

  const server = query.data
  // Adopt server state when we have no local edits (initial load or a remote update).
  if (server && (base === null || (!dirty && server.version !== base.version))) {
    setBase(server)
    setDraft(server.note)
  }
  const remoteChanged = Boolean(server && base && dirty && server.version !== base.version)

  const doSave = () => {
    if (!base || save.isPending) return
    const text = draftRef.current
    setFailed(false)
    save.mutate(
      { note: text, version: base.version },
      {
        onSuccess: (saved) => {
          setBase(saved)
          if (draftRef.current === text) setDirty(false)
        },
        onError: (err) => {
          if (err instanceof ConflictError) return // banner shows via remoteChanged
          setFailed(true)
          toast.error(errorMessage(err, 'Could not save the portfolio note.'))
        },
      },
    )
  }

  // Debounced autosave.
  const doSaveRef = useRef(doSave)
  useEffect(() => {
    doSaveRef.current = doSave
  })
  useEffect(() => {
    if (!dirty || remoteChanged || failed) return
    const t = setTimeout(() => doSaveRef.current(), AUTOSAVE_DELAY_MS)
    return () => clearTimeout(t)
  }, [draft, dirty, remoteChanged, failed])

  // Warn before leaving with unsaved text.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const loadLatest = () => {
    if (!server) return
    setBase(server)
    setDraft(server.note)
    draftRef.current = server.note
    setDirty(false)
  }

  const keepMine = () => {
    if (!server) return
    setBase(server) // re-base on the latest version; the next save overwrites it
    setFailed(false)
  }

  let status: { icon: ReactNode; text: string; tone: string }
  if (save.isPending) status = { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />, text: 'Saving…', tone: 'text-muted-foreground' }
  else if (remoteChanged)
    status = { icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden />, text: 'Changed on another device', tone: 'text-warning-text' }
  else if (failed) status = { icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden />, text: 'Save failed', tone: 'text-destructive-text' }
  else if (dirty) status = { icon: <Cloud className="h-3.5 w-3.5" aria-hidden />, text: 'Unsaved changes', tone: 'text-muted-foreground' }
  else
    status = {
      icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />,
      text: base ? `Saved ${formatRelative(new Date(base.updatedAt).getTime(), now)}` : 'Saved',
      tone: 'text-success-text',
    }

  return (
    <section aria-labelledby={`${textareaId}-h`} className="surface-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id={`${textareaId}-h`} className="text-sm font-semibold text-foreground">
            Portfolio notes
          </h2>
          <p className="text-xs text-muted-foreground">Synced to your account across devices.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1.5 text-xs ${status.tone}`} role="status" aria-live="polite" data-testid="note-status">
            {status.icon}
            {status.text}
          </span>
          <Button size="sm" variant="secondary" onClick={doSave} disabled={!dirty || remoteChanged || save.isPending} icon={<Save className="h-3.5 w-3.5" aria-hidden />}>
            Save
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : query.isError ? (
        <ErrorState title="Could not load notes" message={errorMessage(query.error)} onRetry={() => query.refetch()} retrying={query.isFetching} />
      ) : (
        <>
          {remoteChanged && server && (
            <div role="alert" className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
              <p className="mb-2">This note was updated on another device while you were editing.</p>
              <details className="mb-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Show the other version</summary>
                <p className="mt-1 whitespace-pre-wrap">{server.note || '(empty)'}</p>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={loadLatest}>
                  Load latest (discard mine)
                </Button>
                <Button size="sm" variant="primary" onClick={keepMine}>
                  Keep mine (overwrite)
                </Button>
              </div>
            </div>
          )}
          <label htmlFor={textareaId} className="sr-only">
            Portfolio note
          </label>
          <textarea
            id={textareaId}
            value={draft}
            maxLength={LIMITS.portfolioNoteMax}
            onChange={(e) => {
              setDraft(e.target.value)
              draftRef.current = e.target.value
              setDirty(true)
              setFailed(false)
            }}
            onBlur={() => dirty && !remoteChanged && doSave()}
            rows={6}
            placeholder="Strategy, targets, reminders…"
            className={cn(controlClass, 'border-input-border py-2')}
          />
          <div className="mt-1 text-right text-xs text-muted-foreground">
            {draft.length.toLocaleString()} / {LIMITS.portfolioNoteMax.toLocaleString()}
          </div>
        </>
      )}
    </section>
  )
}
