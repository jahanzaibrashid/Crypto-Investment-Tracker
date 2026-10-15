/**
 * Pure portfolio math. No I/O, no React. All arithmetic uses decimal.js.
 *
 * Definitions (all USD):
 *   Gross purchase cost  = Q × B
 *   Total cost basis     = Q × B + F_buy                        (buy fee included once, here)
 *   Cost allocated to a sale of S units = cost basis × S / Q     (proportional / average cost within the lot)
 *   Remaining cost basis = cost basis − Σ allocated cost of sales
 *   Net sale proceeds    = S × P_sell − F_sell
 *   Realized P/L         = Σ net sale proceeds − Σ allocated cost
 *   Current value        = remaining quantity × current price    (only when a price is known)
 *   Unrealized P/L       = current value − remaining cost basis
 *   Unrealized ROI       = unrealized P/L ÷ remaining cost basis × 100
 *   Realized ROI         = realized P/L ÷ allocated cost of sold units × 100
 *
 * Portfolio:
 *   Total P/L            = realized P/L + unrealized P/L
 *   Overall ROI          = total P/L ÷ (sold cost basis + remaining cost basis of priced holdings) × 100
 * Holdings without a known price contribute neither value nor unrealized P/L, and
 * their cost basis is excluded from the ROI denominator; the summary reports
 * them so the UI can flag the totals as incomplete. A missing price is never zero.
 */
import { D, HUNDRED, ZERO, dec, sum, type Dec } from '@/lib/decimal'
import type { PriceLookup, PriceStatus } from '@/features/prices/prices.types'
import type { Investment, InvestmentStatus, Sale } from './investments.types'

export function grossPurchaseCost(quantity: Dec, buyPrice: Dec): Dec {
  return quantity.times(buyPrice)
}

export function totalCostBasis(quantity: Dec, buyPrice: Dec, buyFee: Dec): Dec {
  return grossPurchaseCost(quantity, buyPrice).plus(buyFee)
}

export function currentValue(quantity: Dec, price: Dec): Dec {
  return quantity.times(price)
}

export function netSaleProceeds(soldQuantity: Dec, salePrice: Dec, saleFee: Dec): Dec {
  return soldQuantity.times(salePrice).minus(saleFee)
}

/** Cost basis allocated to `part` units out of a lot of `whole` units. */
export function allocateCostBasis(costBasis: Dec, part: Dec, whole: Dec): Dec {
  if (whole.isZero()) return ZERO
  return costBasis.times(part).dividedBy(whole)
}

/** ROI in percent, or null when the cost basis is zero/negative (undefined ROI). */
export function roiPercent(pl: Dec, costBasis: Dec): Dec | null {
  if (costBasis.lte(0)) return null
  return pl.dividedBy(costBasis).times(HUNDRED)
}

export interface SaleMetrics {
  sale: Sale
  quantity: Dec
  grossProceeds: Dec
  fee: Dec
  netProceeds: Dec
  allocatedCostBasis: Dec
  realizedPL: Dec
  realizedROI: Dec | null
}

export interface LotMetrics {
  investment: Investment
  quantity: Dec
  buyPrice: Dec
  buyFee: Dec
  grossPurchaseCost: Dec
  totalCostBasis: Dec

  sales: SaleMetrics[]
  soldQuantity: Dec
  remainingQuantity: Dec
  soldCostBasis: Dec
  remainingCostBasis: Dec
  netSaleProceeds: Dec
  realizedPL: Dec
  realizedROI: Dec | null

  status: InvestmentStatus
  isPartiallySold: boolean

  priceStatus: PriceStatus
  currentPrice: Dec | null
  /** null when the position is open and no price is known */
  currentValue: Dec | null
  unrealizedPL: Dec | null
  unrealizedROI: Dec | null
  /** realized + unrealized; null if unrealized is unknown for an open position */
  totalPL: Dec | null
}

export function computeSale(sale: Sale, lotCostBasis: Dec, lotQuantity: Dec): SaleMetrics {
  const quantity = dec(sale.quantity)
  const price = dec(sale.price)
  const fee = dec(sale.fee)
  const grossProceeds = quantity.times(price)
  const netProceeds = netSaleProceeds(quantity, price, fee)
  const allocatedCostBasis = allocateCostBasis(lotCostBasis, quantity, lotQuantity)
  const realizedPL = netProceeds.minus(allocatedCostBasis)
  return {
    sale,
    quantity,
    grossProceeds,
    fee,
    netProceeds,
    allocatedCostBasis,
    realizedPL,
    realizedROI: roiPercent(realizedPL, allocatedCostBasis),
  }
}

export function computeLot(investment: Investment, getPrice: PriceLookup): LotMetrics {
  const quantity = dec(investment.quantity)
  const buyPrice = dec(investment.buyPrice)
  const buyFee = dec(investment.buyFee)
  const gross = grossPurchaseCost(quantity, buyPrice)
  const costBasis = gross.plus(buyFee)

  const sales = [...investment.sales]
    .sort((a, b) => a.soldDate.localeCompare(b.soldDate) || a.createdAt.localeCompare(b.createdAt))
    .map((s) => computeSale(s, costBasis, quantity))

  const soldQuantity = sum(sales.map((s) => s.quantity))
  const remainingQuantity = D.max(quantity.minus(soldQuantity), ZERO)
  // Allocate the sold share in one step so sold + remaining always equals the total exactly.
  const soldCostBasis = allocateCostBasis(costBasis, D.min(soldQuantity, quantity), quantity)
  const remainingCostBasis = costBasis.minus(soldCostBasis)
  const netProceeds = sum(sales.map((s) => s.netProceeds))
  const realizedPL = netProceeds.minus(soldCostBasis)

  const isOpen = remainingQuantity.gt(0)
  const status: InvestmentStatus = isOpen ? 'HOLDING' : 'SOLD'

  const quote = getPrice(investment.coinId)
  let currentVal: Dec | null = null
  let unrealizedPL: Dec | null = null
  let unrealizedROI: Dec | null = null
  if (!isOpen) {
    currentVal = ZERO
    unrealizedPL = ZERO
  } else if (quote.price !== null) {
    currentVal = currentValue(remainingQuantity, quote.price)
    unrealizedPL = currentVal.minus(remainingCostBasis)
    unrealizedROI = roiPercent(unrealizedPL, remainingCostBasis)
  }

  return {
    investment,
    quantity,
    buyPrice,
    buyFee,
    grossPurchaseCost: gross,
    totalCostBasis: costBasis,
    sales,
    soldQuantity,
    remainingQuantity,
    soldCostBasis,
    remainingCostBasis,
    netSaleProceeds: netProceeds,
    realizedPL,
    realizedROI: sales.length ? roiPercent(realizedPL, soldCostBasis) : null,
    status,
    isPartiallySold: isOpen && soldQuantity.gt(0),
    priceStatus: quote.status,
    currentPrice: quote.price,
    currentValue: currentVal,
    unrealizedPL,
    unrealizedROI,
    totalPL: unrealizedPL === null ? null : realizedPL.plus(unrealizedPL),
  }
}

export interface PortfolioSummary {
  /** Σ total cost basis of every lot ever bought (incl. buy fees) */
  totalPurchaseCost: Dec
  totalBuyFees: Dec
  /** Σ remaining cost basis of open lots */
  remainingCostBasis: Dec
  /** Σ cost basis allocated to sold units */
  soldCostBasis: Dec
  netSaleProceeds: Dec
  /** Σ current value of open lots WITH a known price */
  currentValue: Dec
  unrealizedPL: Dec
  realizedPL: Dec
  totalPL: Dec
  /** Denominator for overall ROI */
  applicableCostBasis: Dec
  overallROI: Dec | null
  unrealizedROI: Dec | null
  realizedROI: Dec | null

  lotCount: number
  openLotCount: number
  longTermLotCount: number
  soldLotCount: number
  partiallySoldLotCount: number
  coinsHeld: number

  /** Open lots whose coin has no price at all — totals exclude them. */
  missingPriceCoinIds: string[]
  /** Open lots priced from a stale quote. */
  stalePriceCoinIds: string[]
  /** Remaining cost basis of open lots excluded because of a missing price. */
  unpricedCostBasis: Dec
  isComplete: boolean
}

export function summarizePortfolio(lots: LotMetrics[]): PortfolioSummary {
  let totalPurchaseCost = ZERO
  let totalBuyFees = ZERO
  let remainingCostBasis = ZERO
  let soldCostBasis = ZERO
  let netProceeds = ZERO
  let value = ZERO
  let unrealized = ZERO
  let pricedRemainingCost = ZERO
  let unpricedCostBasis = ZERO
  let realized = ZERO
  const missing = new Set<string>()
  const stale = new Set<string>()
  const held = new Set<string>()
  let openLotCount = 0
  let longTermLotCount = 0
  let partiallySold = 0

  for (const lot of lots) {
    totalPurchaseCost = totalPurchaseCost.plus(lot.totalCostBasis)
    totalBuyFees = totalBuyFees.plus(lot.buyFee)
    soldCostBasis = soldCostBasis.plus(lot.soldCostBasis)
    netProceeds = netProceeds.plus(lot.netSaleProceeds)
    realized = realized.plus(lot.realizedPL)
    if (lot.isPartiallySold) partiallySold++

    if (lot.status === 'HOLDING') {
      openLotCount++
      if (lot.investment.longTerm) longTermLotCount++
      held.add(lot.investment.coinId)
      remainingCostBasis = remainingCostBasis.plus(lot.remainingCostBasis)
      if (lot.currentValue !== null && lot.unrealizedPL !== null) {
        value = value.plus(lot.currentValue)
        unrealized = unrealized.plus(lot.unrealizedPL)
        pricedRemainingCost = pricedRemainingCost.plus(lot.remainingCostBasis)
        if (lot.priceStatus === 'stale') stale.add(lot.investment.coinId)
      } else {
        missing.add(lot.investment.coinId)
        unpricedCostBasis = unpricedCostBasis.plus(lot.remainingCostBasis)
      }
    }
  }

  const totalPL = realized.plus(unrealized)
  const applicableCostBasis = soldCostBasis.plus(pricedRemainingCost)

  return {
    totalPurchaseCost,
    totalBuyFees,
    remainingCostBasis,
    soldCostBasis,
    netSaleProceeds: netProceeds,
    currentValue: value,
    unrealizedPL: unrealized,
    realizedPL: realized,
    totalPL,
    applicableCostBasis,
    overallROI: roiPercent(totalPL, applicableCostBasis),
    unrealizedROI: roiPercent(unrealized, pricedRemainingCost),
    realizedROI: roiPercent(realized, soldCostBasis),
    lotCount: lots.length,
    openLotCount,
    longTermLotCount,
    soldLotCount: lots.length - openLotCount,
    partiallySoldLotCount: partiallySold,
    coinsHeld: held.size,
    missingPriceCoinIds: [...missing].sort(),
    stalePriceCoinIds: [...stale].sort(),
    unpricedCostBasis,
    isComplete: missing.size === 0,
  }
}

export interface CoinPosition {
  coinId: string
  coinName: string
  symbol: string
  lots: number
  remainingQuantity: Dec
  remainingCostBasis: Dec
  /** remaining cost basis ÷ remaining quantity (fees included) */
  averageCost: Dec | null
  currentPrice: Dec | null
  priceStatus: PriceStatus
  currentValue: Dec | null
  unrealizedPL: Dec | null
  unrealizedROI: Dec | null
  realizedPL: Dec
  /** share of priced portfolio value, 0–100 */
  allocation: Dec | null
}

/** Aggregate multiple purchase lots of the same coin. */
export function aggregateByCoin(lots: LotMetrics[], totalValue: Dec): CoinPosition[] {
  const map = new Map<string, LotMetrics[]>()
  for (const lot of lots) {
    const arr = map.get(lot.investment.coinId) ?? []
    arr.push(lot)
    map.set(lot.investment.coinId, arr)
  }

  const positions: CoinPosition[] = []
  for (const [coinId, group] of map) {
    const first = group[0]!
    const open = group.filter((l) => l.status === 'HOLDING')
    const remainingQuantity = sum(open.map((l) => l.remainingQuantity))
    const remainingCostBasis = sum(open.map((l) => l.remainingCostBasis))
    const priced = open.length > 0 && open.every((l) => l.currentValue !== null)
    const value = priced ? sum(open.map((l) => l.currentValue!)) : null
    const unrealized = value !== null ? value.minus(remainingCostBasis) : null
    positions.push({
      coinId,
      coinName: first.investment.coinName,
      symbol: first.investment.symbol,
      lots: group.length,
      remainingQuantity,
      remainingCostBasis,
      averageCost: remainingQuantity.gt(0) ? remainingCostBasis.dividedBy(remainingQuantity) : null,
      currentPrice: first.currentPrice,
      priceStatus: first.priceStatus,
      currentValue: open.length ? value : ZERO,
      unrealizedPL: open.length ? unrealized : ZERO,
      unrealizedROI: unrealized !== null ? roiPercent(unrealized, remainingCostBasis) : null,
      realizedPL: sum(group.map((l) => l.realizedPL)),
      allocation: value !== null && totalValue.gt(0) ? value.dividedBy(totalValue).times(HUNDRED) : null,
    })
  }

  return positions.sort((a, b) => {
    const av = a.currentValue ?? a.remainingCostBasis
    const bv = b.currentValue ?? b.remainingCostBasis
    return bv.comparedTo(av) || a.coinName.localeCompare(b.coinName)
  })
}

/**
 * The four display statuses (each has its own color):
 *   HOLDING      open position
 *   LONG_TERM    open position the user marked as a long-term holding
 *   SOLD_PROFIT  fully sold with realized P/L ≥ 0 (break-even counts as profit)
 *   SOLD_LOSS    fully sold with realized P/L < 0
 */
export type PositionKind = 'HOLDING' | 'LONG_TERM' | 'SOLD_PROFIT' | 'SOLD_LOSS'

export function positionKind(lot: LotMetrics): PositionKind {
  if (lot.status === 'SOLD') return lot.realizedPL.gte(0) ? 'SOLD_PROFIT' : 'SOLD_LOSS'
  return lot.investment.longTerm ? 'LONG_TERM' : 'HOLDING'
}

export const POSITION_KIND_LABEL: Record<PositionKind, string> = {
  HOLDING: 'Holding',
  LONG_TERM: 'Long-term',
  SOLD_PROFIT: 'Sold · Profit',
  SOLD_LOSS: 'Sold · Loss',
}

export interface SaleSummary {
  /** Quantity-weighted average sale price per coin. */
  averagePrice: Dec
  grossProceeds: Dec
  fees: Dec
  /** What actually came back: gross proceeds − sale fees. */
  netProceeds: Dec
  lastSoldDate: string
  count: number
}

/** Combined view of all sales of a lot, or null if nothing was sold. */
export function saleSummary(lot: LotMetrics): SaleSummary | null {
  if (lot.sales.length === 0 || lot.soldQuantity.isZero()) return null
  const gross = sum(lot.sales.map((s) => s.grossProceeds))
  const fees = sum(lot.sales.map((s) => s.fee))
  return {
    averagePrice: gross.dividedBy(lot.soldQuantity),
    grossProceeds: gross,
    fees,
    netProceeds: lot.netSaleProceeds,
    lastSoldDate: lot.sales[lot.sales.length - 1]!.sale.soldDate,
    count: lot.sales.length,
  }
}

/** Value used for sorting the "P/L" column: unrealized for open lots, realized for closed ones. */
export function displayPL(lot: LotMetrics): Dec | null {
  return lot.status === 'SOLD' ? lot.realizedPL : lot.unrealizedPL
}

export function displayROI(lot: LotMetrics): Dec | null {
  return lot.status === 'SOLD' ? lot.realizedROI : lot.unrealizedROI
}
