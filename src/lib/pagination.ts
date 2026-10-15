/** Page numbers to show: always first/last, a window around the current page, gaps as null. */
export function pageWindow(current: number, count: number, radius = 1): (number | null)[] {
  const pages = new Set<number>([0, count - 1])
  for (let i = current - radius; i <= current + radius; i++) if (i >= 0 && i < count) pages.add(i)
  const sorted = [...pages].filter((p) => p >= 0).sort((a, b) => a - b)
  const out: (number | null)[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push(null)
    out.push(p)
  })
  return out
}
