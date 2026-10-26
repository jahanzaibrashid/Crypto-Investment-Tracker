import type { IChartApiBase, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, SeriesType, Time } from 'lightweight-charts'

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0]

/** The candle fields the labels need: the candle's real OHLC, at its chart time. */
export interface RangeLabelCandle {
  time: Time
  open: number
  high: number
  low: number
  close: number
}

interface Label {
  x: number
  y: number
  text: string
}

const FONT_PX = 10
/** Space between a candle's wick tip and its label. */
const WICK_GAP = 3
/** Least space between two labels on the same row. */
const LABEL_GAP = 4

class RangeLabelsRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly highs: Label[],
    private readonly lows: Label[],
    private readonly color: string,
  ) {}

  draw(target: DrawTarget) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.save()
      ctx.font = `${FONT_PX}px ui-sans-serif, system-ui, sans-serif`
      ctx.fillStyle = this.color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      drawRow(ctx, this.highs)
      ctx.textBaseline = 'top'
      drawRow(ctx, this.lows)
      ctx.restore()
    })
  }
}

/**
 * Newest candle first; a label that would run into the one already drawn to its right is skipped,
 * so zoomed-out charts stay readable (zoom in to see every candle's label).
 */
function drawRow(ctx: CanvasRenderingContext2D, labels: Label[]) {
  let leftEdge = Infinity
  for (const l of labels) {
    const half = ctx.measureText(l.text).width / 2
    if (l.x + half + LABEL_GAP > leftEdge) continue
    ctx.fillText(l.text, l.x, l.y)
    leftEdge = l.x - half
  }
}

/**
 * Writes a green candle's high above its wick and a red candle's low below it
 * (or both on every candle). Attach to the candlestick series; detaching removes every label.
 */
export class CandleRangeLabels implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null
  private series: ISeriesApi<SeriesType, Time> | null = null
  private requestUpdate: (() => void) | null = null
  private candles: RangeLabelCandle[] = []
  private color: string
  private both: boolean
  private renderer: RangeLabelsRenderer | null = null
  private readonly views: readonly IPrimitivePaneView[] = [{ zOrder: () => 'top', renderer: () => this.renderer }]

  constructor(color: string, both: boolean) {
    this.color = color
    this.both = both
  }

  attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>) {
    this.chart = chart
    this.series = series
    this.requestUpdate = requestUpdate
  }

  detached() {
    this.chart = null
    this.series = null
    this.requestUpdate = null
    this.renderer = null
  }

  /** Same candles, in the same order, as the series data. */
  setCandles(candles: RangeLabelCandle[]) {
    this.candles = candles
    this.requestUpdate?.()
  }

  /** true: high and low on every candle; false: green → high, red → low. */
  setBoth(both: boolean) {
    this.both = both
    this.requestUpdate?.()
  }

  setColor(color: string) {
    this.color = color
    this.requestUpdate?.()
  }

  updateAllViews() {
    const { chart, series, candles, both } = this
    const range = chart?.timeScale().getVisibleLogicalRange()
    if (!chart || !series || !range || candles.length === 0) {
      this.renderer = null
      return
    }
    const timeScale = chart.timeScale()
    const highs: Label[] = []
    const lows: Label[] = []
    const first = Math.max(0, Math.floor(range.from))
    for (let i = Math.min(candles.length - 1, Math.ceil(range.to)); i >= first; i--) {
      const k = candles[i]!
      const x = timeScale.timeToCoordinate(k.time)
      const yHigh = series.priceToCoordinate(k.high)
      const yLow = series.priceToCoordinate(k.low)
      if (x === null || yHigh === null || yLow === null) continue
      // Same up/down rule as the candle colors: close >= open is green.
      const green = k.close >= k.open
      if (both || green) highs.push({ x, y: yHigh - WICK_GAP, text: k.high.toFixed(0) })
      if (both || !green) lows.push({ x, y: yLow + WICK_GAP, text: k.low.toFixed(0) })
    }
    this.renderer = new RangeLabelsRenderer(highs, lows, this.color)
  }

  paneViews() {
    return this.views
  }
}
