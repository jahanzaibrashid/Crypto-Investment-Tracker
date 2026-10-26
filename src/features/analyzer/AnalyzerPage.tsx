import { useMemo, useState, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/LoadingState'
import { Select } from '@/components/ui/Select'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useNow } from '@/hooks/useNow'
import { formatPrice, formatRelative } from '@/lib/formatters'
import { describeMarketDataError } from '@/features/prices/coingecko.service'
import { useCandles, useTickerPrice } from './analyzer.hooks'
import { INTERVAL_MS, INTERVALS, splitClosed, type Interval } from './binance.service'
import { CandleChart, type ChartLevel, type ChartMarker } from './CandleChart'
import { analyzeLiquidity, levelLabel, pivotStrengthFor } from './liquidity'
import { LiquidityPanel } from './LiquidityPanel'
import { analyzeFibonacci, fibLabel } from './fibonacci'
import { FibonacciPanel } from './FibonacciPanel'
import { SessionTimes } from './SessionTimes'
import { SwingSummary } from './SwingSummary'
import { marketSignals, type OpenLot } from './positions'
import { analyzeStructure } from './structure'
import { intervalPlan, PLAN } from './intervalPlan'
import { StructurePanel, type StructureSettings } from './StructurePanel'
import { BacktestPanel } from './BacktestPanel'
import { usePortfolio } from '@/features/dashboard/portfolio.context'

/** Spot only: the analyzer looks for long setups; bearish conditions mean "avoid / consider selling". */
const PAIR = { symbol: 'ETHUSDT', label: 'ETH/USDT' } as const
const DEFAULT_INTERVAL: Interval = '4h'
/** Nearest levels drawn (each with its price label) on the chart on each side; the panel lists more. */
const CHART_LEVELS = 4
/** Fibonacci levels that get a price label on the axis (the others are drawn without one). */
const FIB_AXIS_LABELS = [0, 0.5, 0.618, 0.786, 1]
/** Chart height in px: taller on desktop, shorter on phones so it fits the screen. */
const CHART_HEIGHT = { desktop: 640, phone: 460 }
/** Most recent breaks of structure marked on the chart (older ones would clutter it). */
const CHART_BREAKS = 10

/** A positive number from an input, or the fallback. */
const positive = (text: string, fallback: number) => {
  const n = Number(text)
  return text.trim() !== '' && n > 0 ? n : fallback
}

/**
 * What each timeframe is for in spot swing trading (positions held for days to weeks):
 *   swing  4h / 12h / 1d — where swing setups are found
 *   entry  1h            — timing an entry for a setup seen on 4h / 12h / 1d
 *   view   15m / 3d / 1w / 1M — chart only: too short for swing holds, or too long (and too little
 *          history for the trend check); levels are drawn but no setups are given
 */
type TimeframeRole = 'swing' | 'entry' | 'view'
const TIMEFRAME_ROLE: Record<Interval, TimeframeRole> = {
  '15m': 'view',
  '1h': 'entry',
  '4h': 'swing',
  '12h': 'swing',
  '1d': 'swing',
  '3d': 'view',
  '1w': 'view',
  '1M': 'view',
}
const ROLE_LABEL: Record<TimeframeRole, string> = { swing: 'Swing setups', entry: 'Entry timing', view: 'View only' }
const ROLE_HINT: Record<TimeframeRole, string> = {
  swing: 'Swing setups are found on this timeframe.',
  entry: 'Use 1 hour to time an entry for a setup seen on 4 hours, 12 hours or 1 day.',
  view: 'Chart only. Switch to 4 hours, 12 hours or 1 day for swing setups.',
}


const INTERVAL_LABEL: Record<Interval, string> = {
  '15m': '15 minutes',
  '1h': '1 hour',
  '4h': '4 hours',
  '12h': '12 hours',
  '1d': '1 day',
  '3d': '3 days',
  '1w': '7 days (1 week)',
  '1M': '1 month',
}

export function AnalyzerPage() {
  const [interval, setTimeframe] = useState<Interval>(DEFAULT_INTERVAL)
  const candlesQuery = useCandles(PAIR.symbol, interval)
  const ticker = useTickerPrice(PAIR.symbol)
  const now = useNow(15_000)
  const phone = useMediaQuery('(max-width: 767px)')
  const chartHeight = phone ? CHART_HEIGHT.phone : CHART_HEIGHT.desktop

  const all = useMemo(() => candlesQuery.data ?? [], [candlesQuery.data])
  // Analysis uses closed candles only; the forming candle is drawn but never analyzed.
  const { closed, forming } = useMemo(() => splitClosed(all, now), [all, now])
  const price = ticker.data ?? all[all.length - 1]?.close ?? null
  // The forming candle follows the live price (candles refresh less often than the ticker).
  const chartCandles = useMemo(() => {
    if (!forming || ticker.data === undefined || all.length === 0) return all
    const p = ticker.data
    return [...all.slice(0, -1), { ...forming, close: p, high: Math.max(forming.high, p), low: Math.min(forming.low, p) }]
  }, [all, forming, ticker.data])
  const role = TIMEFRAME_ROLE[interval]
  const viewOnly = role === 'view'

  // Liquidity from closed candles; above/below is decided by the live price.
  const liquidity = useMemo(
    () => (closed.length > 30 && price !== null ? analyzeLiquidity(closed, INTERVAL_MS[interval], price, forming) : null),
    [closed, forming, price, interval],
  )
  // Fibonacci from closed candles; liquidity levels count as confluence.
  const fib = useMemo(() => (closed.length > 30 && price !== null ? analyzeFibonacci(closed, price, liquidity, pivotStrengthFor(INTERVAL_MS[interval])) : null), [closed, price, liquidity, interval])

  // View-only timeframes get no setups; 1h setups are marked as entry timing.
  const fibSetup = useMemo(() => {
    if (!fib) return null
    if (viewOnly)
      return {
        ...fib.setup,
        status: 'no-trade' as const,
        title: `${INTERVAL_LABEL[interval]} chart is for viewing only: no trade setups`,
        entry: null,
        stopLoss: null,
        invalidation: null,
        targets: [],
        rewardRisk: null,
        conditions: [],
        reasons: [`${ROLE_HINT.view} Fibonacci levels are still drawn for reference.`],
        invalidations: [],
      }
    if (role === 'entry') return { ...fib.setup, reasons: [...fib.setup.reasons, `Entry timing only: ${ROLE_HINT.entry} Don't take a 1-hour setup on its own.`] }
    return fib.setup
  }, [fib, interval, viewOnly, role])

  // Exit monitor for open ETH: runs on this chart when it is a swing timeframe, otherwise on 4h.
  const monitorInterval: Interval = role === 'swing' ? interval : '4h'
  const monitorCandles = useCandles(PAIR.symbol, '4h')
  const { lots } = usePortfolio()
  const openLots = useMemo<OpenLot[]>(
    () =>
      lots
        .filter((l) => l.investment.coinId === 'ethereum' && l.status === 'HOLDING' && l.remainingQuantity.gt(0))
        .map((l) => ({
          id: l.investment.id,
          buyDate: l.investment.buyDate,
          quantity: l.remainingQuantity.toNumber(),
          costPerCoin: l.remainingCostBasis.dividedBy(l.remainingQuantity).toNumber(),
        })),
    [lots],
  )
  const signals = useMemo(() => {
    if (openLots.length === 0 || price === null) return null
    if (monitorInterval === interval) return closed.length > 30 ? marketSignals(closed, price, liquidity, fib?.leg ?? null, pivotStrengthFor(INTERVAL_MS[interval])) : null
    const m = splitClosed(monitorCandles.data ?? [], now)
    if (m.closed.length <= 30) return null
    const strength = pivotStrengthFor(INTERVAL_MS['4h'])
    const liq4h = analyzeLiquidity(m.closed, INTERVAL_MS['4h'], price, m.forming)
    return marketSignals(m.closed, price, liq4h, analyzeFibonacci(m.closed, price, liq4h, strength).leg, strength)
  }, [openLots, price, monitorInterval, interval, closed, liquidity, fib, monitorCandles.data, now])

  // Market structure: swing points, trend, breaks, and the fixed-interval buying plan.
  const [structureSettings, setStructureSettings] = useState<StructureSettings>({ sensitivity: 'auto', interval: String(PLAN.defaultInterval), orderUsd: String(PLAN.defaultOrderUsd) })
  const autoStrength = pivotStrengthFor(INTERVAL_MS[interval])
  const strength = structureSettings.sensitivity === 'auto' ? autoStrength : structureSettings.sensitivity
  const priceInterval = positive(structureSettings.interval, PLAN.defaultInterval)
  const orderUsd = positive(structureSettings.orderUsd, PLAN.defaultOrderUsd)
  const structure = useMemo(() => analyzeStructure(closed, strength, INTERVAL_MS[interval]), [closed, strength, interval])
  const plan = useMemo(
    () =>
      structure && price !== null
        ? intervalPlan({ price, interval: priceInterval, orderUsd, lots: openLots, bosLevel: structure.bosLevels.high, estimatedLow: structure.metrics.estimatedLow?.price ?? null })
        : null,
    [structure, price, priceInterval, orderUsd, openLots],
  )

  const [layers, setLayers] = useState({ liquidity: true, fibonacci: true, highLow: false, highLowBoth: false, swings: true, structureLabels: true, bos: true })
  const check = (key: keyof typeof layers, label: ReactNode) => (
    <label key={key} className="inline-flex cursor-pointer items-center gap-1.5 text-foreground pointer-coarse:py-1.5">
      <input type="checkbox" className="h-4 w-4 accent-primary-solid pointer-coarse:h-5 pointer-coarse:w-5" checked={layers[key]} onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))} />
      {label}
    </label>
  )
  const chartLevels = useMemo<ChartLevel[]>(() => {
    const out: ChartLevel[] = []
    if (layers.liquidity && liquidity) {
      out.push(
        ...liquidity.above.slice(0, CHART_LEVELS).map((l) => ({ id: l.id, price: l.price, title: levelLabel(l), tone: 'above' as const, major: l.strength === 'major', axisLabel: true })),
        ...liquidity.below.slice(0, CHART_LEVELS).map((l) => ({ id: l.id, price: l.price, title: levelLabel(l), tone: 'below' as const, major: l.strength === 'major', axisLabel: true })),
      )
    }
    if (layers.fibonacci && fib?.leg) {
      for (const l of fib.leg.levels) {
        if (l.kind === 'extension') continue
        out.push({ id: `fib-${l.ratio}`, price: l.price, title: fibLabel(l.ratio), tone: price !== null && l.price > price ? 'fib-above' : 'fib-below', major: l.ratio === 0.618, axisLabel: FIB_AXIS_LABELS.includes(l.ratio) })
      }
    }
    const s = fibSetup
    if (layers.fibonacci && s?.status === 'valid' && s.entry && s.stopLoss !== null) {
      out.push(
        { id: 'fib-entry', price: s.entry.to, title: 'Entry', tone: 'entry', major: true, axisLabel: true },
        { id: 'fib-stop', price: s.stopLoss, title: 'Stop-loss', tone: 'stop', major: true, axisLabel: true },
        ...s.targets.map((t, i) => ({ id: `fib-tp${i}`, price: t.price, title: `TP${i + 1}`, tone: 'target' as const, major: true, axisLabel: true })),
      )
    }
    if (layers.fibonacci && !viewOnly && fib?.limit) {
      out.push({ id: 'fib-limit', price: fib.limit.price, title: 'Buy limit', tone: 'entry', major: true, axisLabel: true })
    }
    // Exit level of open ETH positions (only when the monitor runs on this chart).
    if (signals?.exitLevel != null && monitorInterval === interval) {
      out.push({ id: 'pos-exit', price: signals.exitLevel, title: 'Exit if close below', tone: 'stop', major: true, axisLabel: true })
    }
    return out
  }, [liquidity, fib, fibSetup, layers.liquidity, layers.fibonacci, price, viewOnly, signals, monitorInterval, interval])
  const chartMarkers = useMemo<ChartMarker[]>(() => {
    const out: ChartMarker[] = (layers.liquidity ? (liquidity?.events ?? []) : [])
      .filter((e) => e.type !== 'broken' && !e.invalidated)
      .map((e) => ({ time: e.time, bias: e.bias, text: e.type === 'swept' ? 'Sweep' : 'Failed BO' }))
    if (structure && layers.swings) {
      for (const sw of structure.swings) {
        const text = (layers.structureLabels && sw.label ? sw.label : sw.type === 'high' ? 'H' : 'L') + (sw.confirmed ? '' : '?')
        const bullish = sw.label ? sw.label === 'HH' || sw.label === 'HL' : sw.type === 'low'
        out.push({ time: sw.time, bias: bullish ? 'bullish' : 'bearish', text, shape: 'dot', above: sw.type === 'high' })
      }
    }
    if (structure && layers.bos) {
      for (const b of structure.breaks.slice(-CHART_BREAKS)) out.push({ time: b.time, bias: b.bias, text: 'BOS' })
    }
    return out
  }, [liquidity, layers.liquidity, structure, layers.swings, layers.structureLabels, layers.bos])

  return (
    <>
      <PageHeader
        title="Strategy Analyzer"
        description={
          <>
            {PAIR.label} spot · rule-based analysis of Binance candles. Informational only; nothing here places trades.
          </>
        }
      />

      <SwingSummary
        role={role}
        timeframe={INTERVAL_LABEL[interval]}
        setup={fibSetup}
        fib={fib}
        liquidity={liquidity}
        positions={openLots.length > 0 ? (signals?.action ?? null) : null}
      />

      <section aria-label="Market" className="surface-card flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">Pair</span>
              <span className="flex h-9 items-center gap-2 text-sm font-semibold text-foreground">
                {PAIR.label} <Badge tone="neutral">Spot</Badge>
              </span>
            </div>
            <div className="min-w-0 flex-1 sm:w-60 sm:flex-none">
              <Select
                label="Timeframe"
                value={interval}
                onChange={(e) => setTimeframe(e.target.value as Interval)}
                options={INTERVALS.map((i) => ({ value: i, label: `${INTERVAL_LABEL[i]} · ${ROLE_LABEL[TIMEFRAME_ROLE[i]].toLowerCase()}` }))}
              />
            </div>
            <span className="flex h-9 items-center" title={ROLE_HINT[role]}>
              <Badge tone={role === 'swing' ? 'positive' : role === 'entry' ? 'warning' : 'info'}>{ROLE_LABEL[role]}</Badge>
            </span>
          </div>
          <div className="flex w-full items-end justify-between gap-3 sm:w-auto sm:justify-end">
            <div className="text-left sm:text-right">
              <div className="tabular text-xl font-semibold text-foreground" data-testid="live-price">
                {price !== null ? formatPrice(price.toFixed(2)) : '—'}
              </div>
              <div className="text-xs text-muted-foreground">
                {candlesQuery.dataUpdatedAt ? `Updated ${formatRelative(Math.max(candlesQuery.dataUpdatedAt, ticker.dataUpdatedAt), now)}` : 'Loading…'}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
              loading={candlesQuery.isFetching || ticker.isFetching}
              onClick={() => {
                void candlesQuery.refetch()
                void ticker.refetch()
              }}
            >
              Refresh
            </Button>
          </div>
        </div>

        {candlesQuery.isError && !candlesQuery.data && (
          <p role="alert" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
            {describeMarketDataError(candlesQuery.error)} Market data comes from Binance; try Refresh in a minute.
          </p>
        )}

        {candlesQuery.isLoading ? (
          <Skeleton className="-mx-4 h-[460px] rounded-none sm:mx-0 sm:rounded-xl md:h-[640px]" />
        ) : all.length > 0 ? (
          <>
            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <legend className="sr-only">Chart layers</legend>
              {check('liquidity', 'Liquidity levels')}
              {check('fibonacci', 'Fibonacci')}
              {check('highLow', 'High/Low')}
              {/* Default: green candle → high, red candle → low. */}
              {layers.highLow && check('highLowBoth', <>Both high &amp; low</>)}
              {check('swings', 'Swing points')}
              {/* Off: swing points show as plain H / L. */}
              {layers.swings && check('structureLabels', 'HH/HL/LH/LL')}
              {check('bos', 'Break of structure')}
            </fieldset>
            {/* Phones: the chart runs to the card edges for more candles and price-axis room. */}
            <div className="-mx-4 sm:mx-0">
              <CandleChart candles={chartCandles} levels={chartLevels} markers={chartMarkers} height={chartHeight} resetKey={interval} showHighLow={layers.highLow} highLowBoth={layers.highLowBoth} />
            </div>
            <p className="text-xs text-muted-foreground">Times in Pakistan time (PKT). The last candle is still forming and moves with the live price; it is not used for analysis. Liquidity: teal above the price, pink below (thicker = major). Fibonacci: orange above the price, blue below. Swing points: HH/HL green, LH/LL red, ? = provisional (may still change). BOS = a candle closed beyond the latest swing high or low.</p>
          </>
        ) : null}

      </section>

      {price !== null && all.length > 0 && (
        <StructurePanel
          analysis={structure}
          plan={plan}
          price={price}
          autoStrength={autoStrength}
          settings={structureSettings}
          onSettings={setStructureSettings}
          emptyText={`Not enough closed ${INTERVAL_LABEL[interval]} candles for a structure analysis (${closed.length} loaded).`}
        />
      )}
      <BacktestPanel symbol={PAIR.symbol} interval={interval} timeframe={INTERVAL_LABEL[interval]} priceInterval={priceInterval} orderUsd={orderUsd} strength={strength} />

      {/* Each panel follows its chart checkbox. */}
      {layers.liquidity && liquidity && <LiquidityPanel analysis={liquidity} />}
      {layers.fibonacci && fib && fibSetup && price !== null && <FibonacciPanel analysis={{ ...fib, setup: fibSetup }} price={price} pair={PAIR.label} timeframe={INTERVAL_LABEL[interval]} />}

      <SessionTimes now={now} />

      <p className="text-xs text-muted-foreground">
        Combined signals and paper trading are added in the next phases. {INTERVAL_LABEL[interval]} candles,{' '}
        {closed.length} closed candles loaded.
      </p>
    </>
  )
}
