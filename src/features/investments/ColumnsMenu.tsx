import { useEffect, useId, useRef, useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type Modifier } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, Columns3, GripVertical, Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { DEFAULT_COLUMN_PREFS, MOVABLE_COLUMNS, type ColumnPrefs, type MovableColumnId } from './investments.columns'

const LABEL = Object.fromEntries(MOVABLE_COLUMNS.map((c) => [c.id, c.label])) as Record<MovableColumnId, string>

/** Drag only up and down. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border peer-focus-visible:ring-2 peer-focus-visible:ring-ring/60',
        checked ? 'border-primary-solid bg-primary-solid text-primary-foreground' : 'border-input-border bg-input',
      )}
    >
      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
  )
}

/** One movable column: grip to drag, checkbox to show or hide. */
function ColumnItem({ id, visible, onToggle }: { id: MovableColumnId; visible: boolean; onToggle: () => void }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('flex items-center gap-1 rounded-md bg-popover', isDragging && 'relative z-10 shadow-popover')}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Move ${LABEL[id]}`}
        title="Drag to move (or focus and use Space, then ↑ / ↓)"
        className="inline-flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing pointer-coarse:h-10 pointer-coarse:w-8"
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <label className="flex h-8 flex-1 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-sm text-foreground hover:bg-muted pointer-coarse:h-10">
        <input type="checkbox" className="peer sr-only" checked={visible} onChange={onToggle} />
        <Checkbox checked={visible} />
        <span className={cn(!visible && 'text-muted-foreground')}>{LABEL[id]}</span>
      </label>
    </li>
  )
}

/** "Columns" button: show/hide the table's columns and drag them into a new order. Saved in this browser. */
export function ColumnsMenu({ prefs, onChange, onReset }: { prefs: ColumnPrefs; onChange: (p: ColumnPrefs) => void; onReset: () => void }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const dragging = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    dragging.current = false
    if (!over || active.id === over.id) return
    const from = prefs.order.indexOf(active.id as MovableColumnId)
    const to = prefs.order.indexOf(over.id as MovableColumnId)
    onChange({ ...prefs, order: arrayMove(prefs.order, from, to) })
  }
  const toggle = (col: MovableColumnId) =>
    onChange({ ...prefs, hidden: prefs.hidden.includes(col) ? prefs.hidden.filter((h) => h !== col) : [...prefs.hidden, col] })

  const hiddenCount = prefs.hidden.length
  const isDefault = hiddenCount === 0 && prefs.order.every((c, i) => c === DEFAULT_COLUMN_PREFS.order[i])

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(e) => {
        // Esc closes the panel, unless it's cancelling a keyboard drag.
        if (e.key === 'Escape' && open && !dragging.current) {
          e.stopPropagation()
          setOpen(false)
          triggerRef.current?.focus()
        }
      }}
    >
      <Button
        ref={triggerRef}
        variant="secondary"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        icon={<Columns3 className="h-4 w-4" aria-hidden />}
      >
        Columns
        {hiddenCount > 0 && <span className="text-xs text-muted-foreground">({hiddenCount} hidden)</span>}
      </Button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label="Table columns"
          className="absolute top-full right-0 z-40 mt-1 w-64 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-popover"
        >
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Columns</span>
            <button
              type="button"
              onClick={onReset}
              disabled={isDefault}
              className="rounded px-1.5 py-0.5 text-xs font-medium text-primary-text hover:bg-muted disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent"
            >
              Reset
            </button>
          </div>
          <ul className="flex flex-col">
            {['#', 'Coin'].map((label) => (
              <li key={label} className="flex h-8 items-center gap-1 text-sm text-muted-foreground" title="Always shown, always first">
                <span className="inline-flex w-6 justify-center">
                  <Lock className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="px-1.5">{label}</span>
              </li>
            ))}
          </ul>
          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[verticalOnly]}
            onDragStart={() => (dragging.current = true)}
            onDragEnd={onDragEnd}
            onDragCancel={() => setTimeout(() => (dragging.current = false))}
          >
            <SortableContext items={prefs.order} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col">
                {prefs.order.map((col) => (
                  <ColumnItem key={col} id={col} visible={!prefs.hidden.includes(col)} onToggle={() => toggle(col)} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          <p className="mt-2 border-t border-border px-1 pt-2 text-xs text-muted-foreground">Drag ⠿ to reorder. Saved in this browser.</p>
        </div>
      )}
    </div>
  )
}
