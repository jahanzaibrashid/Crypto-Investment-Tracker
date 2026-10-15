/**
 * Font size for form controls: 16px on phones (iOS Safari zooms the page when focusing
 * anything smaller), 14px from `sm` up.
 */
export const controlText = 'text-base sm:text-sm'

/** Shared styling for form controls (inputs, selects, textareas, comboboxes). */
export const controlClass =
  `w-full min-w-0 rounded-lg border bg-input px-3 ${controlText} text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring/60 disabled:opacity-60`

/** Border state shared by inputs and selects. */
export function controlBorder(error?: string, active?: boolean): string {
  return error ? 'border-destructive' : active ? 'border-primary ring-1 ring-primary/30' : 'border-input-border'
}
