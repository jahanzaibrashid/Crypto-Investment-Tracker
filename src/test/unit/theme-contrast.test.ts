// @vitest-environment node
/**
 * WCAG contrast check for every token pair the UI renders, in both themes.
 * Reads src/styles/theme.css directly, so changing a token re-runs this check.
 *   text            ≥ 4.5:1 (AA, normal text); primary text ≥ 7:1
 *   UI boundaries   ≥ 3:1   (input borders, focus ring, status icons)
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../../styles/theme.css', import.meta.url)), 'utf8')

function block(selectorStart: string): Record<string, string> {
  const start = css.indexOf(selectorStart)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const vars: Record<string, string> = {}
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) vars[m[1]!] = m[2]!.toLowerCase()
  return vars
}

const THEMES = { light: block(':root,'), dark: block("[data-theme='dark']") }

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
/** `fg` at `alpha` over `bg` (how Tailwind's `bg-success/10` renders on a card). */
const blend = (fg: string, alpha: number, bg: string) => toHex(rgb(fg).map((v, i) => v * alpha + rgb(bg)[i]! * (1 - alpha)))
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

type Pair = [fg: string, bg: string, min: number]

function pairs(t: Record<string, string>): Pair[] {
  const surfaces = ['background', 'card', 'popover', 'row-hover']
  const p: Pair[] = []
  for (const s of [...surfaces, 'muted']) p.push(['foreground', s, 7])
  for (const s of surfaces) {
    p.push(['muted-foreground', s, 4.5])
    for (const text of ['primary-text', 'success-text', 'destructive-text', 'warning-text', 'info-text', 'long-term-text']) p.push([text, s, 4.5])
  }
  p.push(['primary-foreground', 'primary-solid', 4.5], ['primary-foreground', 'primary-solid-hover', 4.5])
  p.push(['primary-foreground', 'destructive-solid', 4.5], ['primary-foreground', 'destructive-solid-hover', 4.5])
  for (const s of ['input', 'card', 'background']) p.push(['input-border', s, 3], ['ring', s, 3])
  for (const icon of ['success', 'destructive', 'warning', 'info', 'primary', 'long-term']) p.push([icon, 'card', 3])
  void t
  return p
}

describe.each(Object.entries(THEMES))('%s theme contrast', (name, t) => {
  it('defines every token as a hex value', () => {
    expect(Object.keys(t).length).toBeGreaterThan(25)
  })

  it.each(pairs(t))(`${name}: --%s on --%s ≥ %s:1`, (fg, bg, min) => {
    expect(t[fg], `missing --${fg}`).toBeDefined()
    expect(t[bg], `missing --${bg}`).toBeDefined()
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(min)
  })

  it.each([
    ['success-text', 'success'],
    ['destructive-text', 'destructive'],
    ['warning-text', 'warning'],
    ['primary-text', 'primary'],
  ])(`${name}: badge text --%s on its 8%% tint (bg-<tone>/8) ≥ 4.5:1`, (text, tint) => {
    expect(contrast(t[text]!, blend(t[tint]!, 0.08, t.card!))).toBeGreaterThanOrEqual(4.5)
  })

  // Status-tinted table rows (and their hover shade). Inside them, secondary text and
  // profit text use the --row-* overrides (see [data-row-tone] in index.css).
  const ROWS = ['row-holding', 'row-long-term', 'row-profit', 'row-loss'].flatMap((r) => [r, `${r}-hover`])
  it.each(ROWS)(`${name}: text on --%s is readable`, (row) => {
    const bg = t[row]!
    expect(contrast(t.foreground!, bg)).toBeGreaterThanOrEqual(7)
    for (const text of ['row-muted-foreground', 'row-success-text', 'destructive-text', 'primary-text', 'long-term-text', 'row-warning-text']) {
      expect(contrast(t[text]!, bg), `--${text} on --${row}`).toBeGreaterThanOrEqual(4.5)
    }
    // Status badges sit on the row tint with their own 8% tint.
    const badges: [string, string][] = [['row-success-text', 'success'], ['destructive-text', 'destructive'], ['primary-text', 'primary'], ['long-term-text', 'long-term'], ['row-warning-text', 'warning']]
    for (const [text, tint] of badges) {
      expect(contrast(t[text]!, blend(t[tint]!, 0.08, bg)), `badge --${text} on --${row}`).toBeGreaterThanOrEqual(4.5)
    }
    // The 3px status stripe stays visible against the row.
    expect(contrast(t.foreground!, bg)).toBeGreaterThan(1)
  })

  it(`${name}: table header text on bg-muted/60 ≥ 4.5:1`, () => {
    expect(contrast(t['muted-foreground']!, blend(t.muted!, 0.6, t.card!))).toBeGreaterThanOrEqual(4.5)
  })

  it(`${name}: active nav text on bg-primary/10 ≥ 4.5:1`, () => {
    for (const s of ['card', 'sidebar', 'background']) {
      expect(contrast(t['primary-text']!, blend(t.primary!, 0.1, t[s]!))).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('specified palette is used', () => {
  it('matches the requested light and dark colors', () => {
    expect(THEMES.light).toMatchObject({
      background: '#f8fafc', card: '#ffffff', foreground: '#0f172a', 'muted-foreground': '#64748b', border: '#e2e8f0',
      primary: '#2563eb', success: '#16a34a', destructive: '#dc2626', muted: '#f1f5f9', input: '#ffffff', sidebar: '#ffffff',
    })
    expect(THEMES.dark).toMatchObject({
      background: '#0b1120', card: '#111827', foreground: '#f1f5f9', 'muted-foreground': '#94a3b8', border: '#273449',
      primary: '#3b82f6', success: '#4ade80', destructive: '#f87171', muted: '#1e293b', input: '#0f172a', sidebar: '#0f172a',
    })
  })
})
