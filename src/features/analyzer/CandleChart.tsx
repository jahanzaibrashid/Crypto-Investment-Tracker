import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Candle } from './binance.service'
import { PKT_OFFSET_MS } from './time'

/** Chart colors come from the app's theme tokens, so the chart follows light/dark mode. */
function themeColors() {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return {
    background: v('--card', '#ffffff'),
    text: v('--muted-foreground', '#64748b'),
    grid: v('--border', '#e2e8f0'),
    up: v('--success', '#16a34a'),
    down: v('--destructive', '#dc2626'),
    liquidityAbove: v('--chart-liquidity-above', '#0d9488'),
    liquidityBelow: v('--chart-liquidity-below', '#db2777'),
    fibAbove: v('--warning', '#d97706'),
    fibBelow: v('--primary-solid', '#2563eb'),
    entry: v('--primary-solid', '#2563eb'),
  }
}

/** #rrggbb → rgba(); other color formats are returned unchanged. */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color)
  if (!m) return color
  const n = parseInt(m[1]!, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

type Colors = ReturnType<typeof themeColors>
const TONE_COLOR: Record<LevelTone, (c: Colors) => string> = {
  above: (c) => c.liquidityAbove,
  below: (c) => c.liquidityBelow,
  'fib-above': (c) => c.fibAbove,
  'fib-below': (c) => c.fibBelow,
  entry: (c) => c.entry,
  stop: (c) => c.down,
  target: (c) => c.up,
}

/**
 * The chart library shows its timestamps as UTC. Shifting every time by PKT's fixed +5 h (Pakistan
 * has no daylight saving) makes the time axis and crosshair read in Pakistan time.
 */
const toTime = (ms: number) => Math.floor((ms + PKT_OFFSET_MS) / 1000) as UTCTimestamp

/**
 * Horizontal line. above = liquidity above the price (teal), below = liquidity below (pink),
 * fib-above / fib-below = Fibonacci level above (orange) or below (blue) the price,
 * entry / stop / target = a trade plan.
 */
export type LevelTone = 'above' | 'below' | 'fib-above' | 'fib-below' | 'entry' | 'stop' | 'target'

export interface ChartLevel {
  id: string
  price: number
  title: string
  tone: LevelTone
  major: boolean
  /** Show a price label on the right axis (only for important lines, so labels don't pile up). */
  axisLabel: boolean
}

const SOLID: LevelTone[] = ['above', 'below', 'fib-above', 'fib-below']

function lineOptions(l: ChartLevel, c: Colors) {
  return {
    price: l.price,
    // Minor lines are thinner but still clearly visible.
    color: withAlpha(TONE_COLOR[l.tone](c), l.major ? 1 : 0.85),
    lineWidth: (l.major ? 2 : 1) as 1 | 2,
    lineStyle: SOLID.includes(l.tone) ? LineStyle.Solid : LineStyle.LargeDashed,
    axisLabelVisible: l.axisLabel,
    title: l.title,
  }
}

/** Candles visible after loading a new timeframe (the rest is a scroll away). */
const INITIAL_VISIBLE = 150

/** Arrow on a candle, e.g. a liquidity sweep. */
export interface ChartMarker {
  time: number
  bias: 'bullish' | 'bearish'
  text: string
}

interface Props {
  /** All candles to draw, including the one still forming. */
  candles: Candle[]
  levels?: ChartLevel[]
  markers?: ChartMarker[]
  height?: number
  /** Changing it (e.g. the timeframe) resets the zoom once the new candles arrive. */
  resetKey?: string
}

/** Candlesticks with volume. Times are Pakistan time (PKT). */
export function CandleChart({ candles, levels = [], markers = [], height = 640, resetKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<{
    candles: ISeriesApi<'Candlestick'>
    volume: ISeriesApi<'Histogram'>
  } | null>(null)
  const linesRef = useRef(new Map<string, IPriceLine>())
  const zoomedForRef = useRef<string | undefined>(undefined)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const [themeVersion, setThemeVersion] = useState(0)

  // Create the chart once; follow theme changes.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const c = themeColors()
    // autoSize follows the container, so a height change never rebuilds the chart (lines stay).
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: c.background }, textColor: c.text, attributionLogo: true },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.grid },
      timeScale: { borderColor: c.grid, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      // Phones: a vertical swipe scrolls the page instead of being caught by the chart.
      handleScroll: { vertTouchDrag: false },
    })
    const candlesSeries = chart.addSeries(CandlestickSeries, {
      upColor: c.up,
      downColor: c.down,
      borderUpColor: c.up,
      borderDownColor: c.down,
      wickUpColor: c.up,
      wickDownColor: c.down,
    })
    const volume = chart.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    seriesRef.current = { candles: candlesSeries, volume }
    markersRef.current = createSeriesMarkers(candlesSeries, [])
    chartRef.current = chart

    const applyTheme = () => {
      const t = themeColors()
      chart.applyOptions({
        layout: { background: { type: ColorType.Solid, color: t.background }, textColor: t.text },
        grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      })
      candlesSeries.applyOptions({ upColor: t.up, downColor: t.down, borderUpColor: t.up, borderDownColor: t.down, wickUpColor: t.up, wickDownColor: t.down })
      setThemeVersion((v) => v + 1) // recolor levels and markers
    }
    const observer = new MutationObserver(applyTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })

    return () => {
      observer.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      linesRef.current = new Map()
      zoomedForRef.current = undefined
      markersRef.current = null
    }
  }, [])

  // Update data in place so zoom and scroll survive refreshes.
  useEffect(() => {
    const s = seriesRef.current
    if (!s) return
    const c = themeColors()
    s.candles.setData(candles.map((k) => ({ time: toTime(k.openTime), open: k.open, high: k.high, low: k.low, close: k.close })))
    s.volume.setData(
      candles.map((k) => ({ time: toTime(k.openTime), value: k.volume, color: withAlpha(k.close >= k.open ? c.up : c.down, 0.35) })),
    )
    // New timeframe: show the latest candles instead of keeping the old zoom.
    if (candles.length > 0 && zoomedForRef.current !== resetKey) {
      zoomedForRef.current = resetKey
      chartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - INITIAL_VISIBLE), to: candles.length + 3 })
    }
  }, [candles, resetKey])

  // Level lines: update in place by id, so unchanged lines don't flicker on every price tick.
  useEffect(() => {
    const s = seriesRef.current
    if (!s) return
    const c = themeColors()
    const lines = linesRef.current
    const keep = new Set(levels.map((l) => l.id))
    for (const [id, line] of lines) {
      if (!keep.has(id)) {
        s.candles.removePriceLine(line)
        lines.delete(id)
      }
    }
    for (const l of levels) {
      const existing = lines.get(l.id)
      if (existing) existing.applyOptions(lineOptions(l, c))
      else lines.set(l.id, s.candles.createPriceLine(lineOptions(l, c)))
    }
  }, [levels, themeVersion])

  useEffect(() => {
    const c = themeColors()
    markersRef.current?.setMarkers(
      [...markers]
        .sort((a, b) => a.time - b.time)
        .map((m) => ({
          time: toTime(m.time),
          position: m.bias === 'bullish' ? 'belowBar' : 'aboveBar',
          shape: m.bias === 'bullish' ? 'arrowUp' : 'arrowDown',
          color: m.bias === 'bullish' ? c.up : c.down,
          text: m.text,
        })),
    )
  }, [markers, themeVersion])

  return <div ref={containerRef} className="w-full" style={{ height }} role="img" aria-label="ETH/USDT candlestick chart with volume and liquidity levels" />
}
