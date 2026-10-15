import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { controlText } from './control'
import { pageWindow } from '@/lib/pagination'

interface PaginationProps {
  pageIndex: number
  pageCount: number
  pageSize: number
  pageSizes: readonly number[]
  total: number
  onPageChange: (index: number) => void
  onPageSizeChange: (size: number) => void
}

const iconBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40'

/** "Rows per page" + range summary on the left; ‹ 1 … 4 5 6 … 12 › on the right. */
export function Pagination({ pageIndex, pageCount, pageSize, pageSizes, total, onPageChange, onPageSizeChange }: PaginationProps) {
  const count = Math.max(pageCount, 1)
  const first = total === 0 ? 0 : pageIndex * pageSize + 1
  const last = Math.min((pageIndex + 1) * pageSize, total)
  const canPrev = pageIndex > 0
  const canNext = pageIndex < count - 1

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:px-5"
    >
      <div className="flex items-center gap-2">
        <label htmlFor="page-size">Rows per page</label>
        <select
          id="page-size"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className={cn('h-8 rounded-lg border border-input-border bg-input px-2 text-foreground', controlText)}
        >
          {pageSizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span aria-live="polite" className="tabular">
          {first}–{last} of {total}
        </span>
      </div>

      {/* First/last jump buttons are dropped on phones: page 1 and the last page are always listed. */}
      <div className="flex items-center gap-0.5 sm:gap-1">
        <button type="button" className={cn(iconBtn, 'hidden sm:inline-flex')} aria-label="First page" disabled={!canPrev} onClick={() => onPageChange(0)}>
          <ChevronsLeft className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" className={iconBtn} aria-label="Previous page" disabled={!canPrev} onClick={() => onPageChange(pageIndex - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        {pageWindow(pageIndex, count).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="w-5 text-center sm:w-6" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              aria-label={`Page ${p + 1}`}
              aria-current={p === pageIndex ? 'page' : undefined}
              onClick={() => onPageChange(p)}
              className={cn(
                'tabular inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-semibold transition-colors',
                p === pageIndex ? 'bg-primary-solid text-primary-foreground' : 'text-foreground hover:bg-muted',
              )}
            >
              {p + 1}
            </button>
          ),
        )}
        <button type="button" className={iconBtn} aria-label="Next page" disabled={!canNext} onClick={() => onPageChange(pageIndex + 1)}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" className={cn(iconBtn, 'hidden sm:inline-flex')} aria-label="Last page" disabled={!canNext} onClick={() => onPageChange(count - 1)}>
          <ChevronsRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </nav>
  )
}
