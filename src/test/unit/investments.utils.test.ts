import { describe, expect, it } from 'vitest'
import { D } from '@/lib/decimal'
import {
  positionKind,
  saleSummary,
  aggregateByCoin,
  allocateCostBasis,
  computeLot,
  currentValue,
  grossPurchaseCost,
  netSaleProceeds,
  permanentOrder,
  reorderedOpenIds,
  roiPercent,
  summarizePortfolio,
  totalCostBasis,
} from '@/features/investments/investments.utils'
import { makeInvestment, makeSale, priceLookup } from '../fixtures'

const d = (v: string | number) => new D(v)

describe('primitive calculations', () => {
  it('gross purchase cost = Q × B', () => {
    expect(grossPurchaseCost(d('0.5'), d('42000')).toString()).toBe('21000')
  })

  it('cost basis includes the buy fee once', () => {
    expect(totalCostBasis(d('0.5'), d('42000'), d('12.5')).toString()).toBe('21012.5')
  })

  it('current value = Q × P', () => {
    expect(currentValue(d('2'), d('1234.56')).toString()).toBe('2469.12')
  })

  it('net sale proceeds = S × P − F', () => {
    expect(netSaleProceeds(d('3'), d('10'), d('1.5')).toString()).toBe('28.5')
  })

  it('allocates cost basis proportionally', () => {
    expect(allocateCostBasis(d('300'), d('1'), d('3')).toString()).toBe('100')
    expect(allocateCostBasis(d('300'), d('1'), d('0')).toString()).toBe('0')
  })

  it('ROI is P/L ÷ cost × 100', () => {
    expect(roiPercent(d('25'), d('100'))!.toString()).toBe('25')
    expect(roiPercent(d('-50'), d('200'))!.toString()).toBe('-25')
  })

  it('ROI is null (not Infinity/NaN) for zero cost basis', () => {
    expect(roiPercent(d('10'), d('0'))).toBeNull()
  })
})

describe('decimal precision', () => {
  it('avoids floating-point drift (0.1 + 0.2 style errors)', () => {
    const lot = computeLot(
      makeInvestment({ quantity: '0.1', buyPrice: '0.2', buyFee: '0.01' }),
      priceLookup({ bitcoin: '0.3' }),
    )
    expect(lot.grossPurchaseCost.toString()).toBe('0.02')
    expect(lot.totalCostBasis.toString()).toBe('0.03')
    expect(lot.currentValue!.toString()).toBe('0.03')
    expect(lot.unrealizedPL!.isZero()).toBe(true)
  })

  it('handles tiny prices and huge quantities exactly', () => {
    const lot = computeLot(
      makeInvestment({ coinId: 'pepe', quantity: '123456789012.123456789012345678', buyPrice: '0.000001234567' }),
      priceLookup({ pepe: '0.000002' }),
    )
    expect(lot.grossPurchaseCost.toFixed(12)).toBe('152415.677640330220')
    expect(lot.currentValue!.toFixed(6)).toBe('246913.578024')
  })

  it('remaining + sold cost basis always equals total cost basis', () => {
    const lot = computeLot(
      makeInvestment({
        quantity: '3',
        buyPrice: '10',
        buyFee: '1',
        sales: [makeSale({ quantity: '1' }), makeSale({ quantity: '1', soldDate: '2024-07-01' })],
      }),
      priceLookup({ bitcoin: '20' }),
    )
    expect(lot.soldCostBasis.plus(lot.remainingCostBasis).toString()).toBe(lot.totalCostBasis.toString())
  })
})

describe('computeLot — open position', () => {
  it('computes value, unrealized P/L and ROI against remaining cost basis incl. fees', () => {
    const lot = computeLot(
      makeInvestment({ quantity: '2', buyPrice: '100', buyFee: '10' }),
      priceLookup({ bitcoin: '150' }),
    )
    expect(lot.totalCostBasis.toString()).toBe('210')
    expect(lot.currentValue!.toString()).toBe('300')
    expect(lot.unrealizedPL!.toString()).toBe('90')
    expect(lot.unrealizedROI!.toFixed(4)).toBe('42.8571')
    expect(lot.realizedPL.toString()).toBe('0')
    expect(lot.status).toBe('HOLDING')
  })

  it('reports missing prices as null, never zero', () => {
    const lot = computeLot(makeInvestment({ coinId: 'obscure' }), priceLookup({}))
    expect(lot.priceStatus).toBe('unavailable')
    expect(lot.currentPrice).toBeNull()
    expect(lot.currentValue).toBeNull()
    expect(lot.unrealizedPL).toBeNull()
    expect(lot.unrealizedROI).toBeNull()
    expect(lot.totalPL).toBeNull()
  })

  it('passes stale status through so the UI can label it', () => {
    const lot = computeLot(makeInvestment(), priceLookup({ bitcoin: '110' }, 'stale'))
    expect(lot.priceStatus).toBe('stale')
    expect(lot.currentValue!.toString()).toBe('110')
  })
})

describe('computeLot — sold positions', () => {
  it('fully sold: realized P/L = net proceeds − full cost basis; buy fee not double-counted', () => {
    const lot = computeLot(
      makeInvestment({
        quantity: '2',
        buyPrice: '100',
        buyFee: '10',
        status: 'SOLD',
        sales: [makeSale({ quantity: '2', price: '150', fee: '5' })],
      }),
      priceLookup({ bitcoin: '999' }), // current price must not matter for a closed lot
    )
    // proceeds 300 − 5 = 295; cost 200 + 10 = 210
    expect(lot.netSaleProceeds.toString()).toBe('295')
    expect(lot.realizedPL.toString()).toBe('85')
    expect(lot.realizedROI!.toFixed(4)).toBe('40.4762')
    expect(lot.status).toBe('SOLD')
    expect(lot.remainingQuantity.isZero()).toBe(true)
    expect(lot.currentValue!.isZero()).toBe(true)
    expect(lot.unrealizedPL!.isZero()).toBe(true)
    expect(lot.totalPL!.toString()).toBe('85')
  })

  it('a sold lot needs no market price', () => {
    const lot = computeLot(
      makeInvestment({ coinId: 'delisted', sales: [makeSale({ quantity: '1', price: '50' })] }),
      priceLookup({}),
    )
    expect(lot.status).toBe('SOLD')
    expect(lot.realizedPL.toString()).toBe('-50')
    expect(lot.totalPL!.toString()).toBe('-50')
  })

  it('selling at zero (write-off) gives −100% ROI', () => {
    const lot = computeLot(makeInvestment({ sales: [makeSale({ quantity: '1', price: '0' })] }), priceLookup({}))
    expect(lot.realizedROI!.toString()).toBe('-100')
  })
})

describe('computeLot — partial sales', () => {
  it('allocates cost proportionally and splits realized/unrealized', () => {
    const lot = computeLot(
      makeInvestment({
        quantity: '4',
        buyPrice: '100',
        buyFee: '20', // cost basis 420, i.e. 105 per unit
        sales: [makeSale({ quantity: '1', price: '200', fee: '2' })],
      }),
      priceLookup({ bitcoin: '150' }),
    )
    expect(lot.isPartiallySold).toBe(true)
    expect(lot.status).toBe('HOLDING')
    expect(lot.soldQuantity.toString()).toBe('1')
    expect(lot.remainingQuantity.toString()).toBe('3')
    expect(lot.soldCostBasis.toString()).toBe('105')
    expect(lot.remainingCostBasis.toString()).toBe('315')
    // realized: (200 − 2) − 105 = 93
    expect(lot.realizedPL.toString()).toBe('93')
    // unrealized: 3 × 150 − 315 = 135
    expect(lot.currentValue!.toString()).toBe('450')
    expect(lot.unrealizedPL!.toString()).toBe('135')
    expect(lot.totalPL!.toString()).toBe('228')
    expect(lot.sales[0]!.allocatedCostBasis.toString()).toBe('105')
  })

  it('keeps every sale in history', () => {
    const lot = computeLot(
      makeInvestment({
        quantity: '3',
        sales: [
          makeSale({ quantity: '1', soldDate: '2024-03-01', price: '120' }),
          makeSale({ quantity: '2', soldDate: '2024-02-01', price: '90' }),
        ],
      }),
      priceLookup({}),
    )
    expect(lot.sales.map((s) => s.sale.soldDate)).toEqual(['2024-02-01', '2024-03-01'])
    expect(lot.status).toBe('SOLD')
  })
})

describe('summarizePortfolio', () => {
  const lots = () => [
    // open: cost 210, value 300 → +90
    computeLot(makeInvestment({ quantity: '2', buyPrice: '100', buyFee: '10' }), priceLookup({ bitcoin: '150', ethereum: '1000' })),
    // second purchase of the same coin at a different price: cost 120, value 150 → +30
    computeLot(makeInvestment({ quantity: '1', buyPrice: '120', buyDate: '2024-02-01' }), priceLookup({ bitcoin: '150' })),
    // sold: cost 500, net proceeds 595 → +95
    computeLot(
      makeInvestment({ coinId: 'ethereum', coinName: 'Ethereum', symbol: 'ETH', quantity: '1', buyPrice: '500', sales: [makeSale({ quantity: '1', price: '600', fee: '5' })] }),
      priceLookup({ ethereum: '1000' }),
    ),
  ]

  it('does not double count sale proceeds or sold positions', () => {
    const s = summarizePortfolio(lots())
    expect(s.totalPurchaseCost.toString()).toBe('830')
    expect(s.remainingCostBasis.toString()).toBe('330')
    expect(s.soldCostBasis.toString()).toBe('500')
    expect(s.currentValue.toString()).toBe('450') // only open lots; ETH sold → excluded
    expect(s.unrealizedPL.toString()).toBe('120')
    expect(s.realizedPL.toString()).toBe('95')
    expect(s.totalPL.toString()).toBe('215')
    expect(s.applicableCostBasis.toString()).toBe('830')
    expect(s.overallROI!.toFixed(4)).toBe('25.9036')
    expect(s.openLotCount).toBe(2)
    expect(s.soldLotCount).toBe(1)
    expect(s.coinsHeld).toBe(1)
    expect(s.isComplete).toBe(true)
  })

  it('excludes unpriced holdings from value and ROI and flags the totals incomplete', () => {
    const s = summarizePortfolio([
      computeLot(makeInvestment({ quantity: '1', buyPrice: '100' }), priceLookup({ bitcoin: '200' })),
      computeLot(makeInvestment({ coinId: 'mystery', quantity: '1', buyPrice: '1000' }), priceLookup({})),
    ])
    expect(s.isComplete).toBe(false)
    expect(s.missingPriceCoinIds).toEqual(['mystery'])
    expect(s.currentValue.toString()).toBe('200')
    expect(s.unrealizedPL.toString()).toBe('100')
    expect(s.unpricedCostBasis.toString()).toBe('1000')
    expect(s.applicableCostBasis.toString()).toBe('100')
    expect(s.overallROI!.toString()).toBe('100')
    expect(s.remainingCostBasis.toString()).toBe('1100')
  })

  it('returns null ROI for an empty portfolio', () => {
    const s = summarizePortfolio([])
    expect(s.overallROI).toBeNull()
    expect(s.totalPL.isZero()).toBe(true)
  })

  it('reports stale-priced coins', () => {
    const s = summarizePortfolio([computeLot(makeInvestment(), priceLookup({ bitcoin: '1' }, 'stale'))])
    expect(s.stalePriceCoinIds).toEqual(['bitcoin'])
    expect(s.isComplete).toBe(true)
  })
})

describe('aggregateByCoin', () => {
  it('combines multiple purchases of the same coin with a fee-inclusive average cost', () => {
    const l = [
      computeLot(makeInvestment({ quantity: '1', buyPrice: '100', buyFee: '2' }), priceLookup({ bitcoin: '200' })),
      computeLot(makeInvestment({ quantity: '3', buyPrice: '200', buyFee: '6' }), priceLookup({ bitcoin: '200' })),
    ]
    const [btc] = aggregateByCoin(l, new D(800))
    expect(btc!.lots).toBe(2)
    expect(btc!.remainingQuantity.toString()).toBe('4')
    expect(btc!.remainingCostBasis.toString()).toBe('708')
    expect(btc!.averageCost!.toString()).toBe('177')
    expect(btc!.currentValue!.toString()).toBe('800')
    expect(btc!.unrealizedPL!.toString()).toBe('92')
    expect(btc!.allocation!.toString()).toBe('100')
  })
})

describe('positionKind', () => {
  const p = priceLookup({ bitcoin: '100' })
  it('classifies holding, long-term, sold in profit and sold in loss', () => {
    expect(positionKind(computeLot(makeInvestment(), p))).toBe('HOLDING')
    expect(positionKind(computeLot(makeInvestment({ longTerm: true }), p))).toBe('LONG_TERM')
    expect(positionKind(computeLot(makeInvestment({ sales: [makeSale({ quantity: '1', price: '150' })] }), p))).toBe('SOLD_PROFIT')
    expect(positionKind(computeLot(makeInvestment({ sales: [makeSale({ quantity: '1', price: '50' })] }), p))).toBe('SOLD_LOSS')
  })
  it('treats break-even sales as profit and partial sales as still held', () => {
    expect(positionKind(computeLot(makeInvestment({ sales: [makeSale({ quantity: '1', price: '100' })] }), p))).toBe('SOLD_PROFIT')
    expect(positionKind(computeLot(makeInvestment({ quantity: '2', longTerm: true, sales: [makeSale({ quantity: '1' })] }), p))).toBe('LONG_TERM')
  })
})

describe('saleSummary', () => {
  it('returns null for a lot with no sales', () => {
    expect(saleSummary(computeLot(makeInvestment(), priceLookup({})))).toBeNull()
  })
  it('gives sold price, net amount back and sold date (0.1 ETH bought at 2400, sold at 2500)', () => {
    const lot = computeLot(
      makeInvestment({ quantity: '0.1', buyPrice: '2400', sales: [makeSale({ quantity: '0.1', price: '2500', soldDate: '2026-09-18' })] }),
      priceLookup({}),
    )
    const s = saleSummary(lot)!
    expect(lot.grossPurchaseCost.toString()).toBe('240')
    expect(s.averagePrice.toString()).toBe('2500')
    expect(s.netProceeds.toString()).toBe('250')
    expect(s.lastSoldDate).toBe('2026-09-18')
  })
  it('averages price, totals the amount and takes the latest date across partial sales', () => {
    const lot = computeLot(
      makeInvestment({
        quantity: '3',
        sales: [
          makeSale({ quantity: '1', price: '100', fee: '1', soldDate: '2024-03-01' }),
          makeSale({ quantity: '2', price: '130', fee: '2', soldDate: '2024-04-01' }),
        ],
      }),
      priceLookup({}),
    )
    const s = saleSummary(lot)!
    expect(s.averagePrice.toString()).toBe('120') // (100 + 260) / 3
    expect(s.grossProceeds.toString()).toBe('360')
    expect(s.fees.toString()).toBe('3')
    expect(s.netProceeds.toString()).toBe('357')
    expect(s.lastSoldDate).toBe('2024-04-01')
    expect(s.count).toBe(2)
  })
})

describe('permanentOrder', () => {
  const ids = (lots: ReturnType<typeof computeLot>[]) => permanentOrder(lots).map((l) => l.investment.id)
  const lot = (inv: Parameters<typeof makeInvestment>[0]) => computeLot(makeInvestment(inv), priceLookup({ bitcoin: '100' }))

  it('lists open lots by saved order (highest first), then sold lots by most recent sale', () => {
    const lots = [
      lot({ id: 'open-low', sortOrder: 1 }),
      lot({ id: 'sold-old', sortOrder: 99, quantity: '1', sales: [makeSale({ quantity: '1', soldDate: '2024-02-01' })] }),
      lot({ id: 'open-high', sortOrder: 5 }),
      lot({ id: 'sold-new', sortOrder: 0, quantity: '1', sales: [makeSale({ quantity: '1', soldDate: '2024-06-01' })] }),
      // Partially sold is still open, so it keeps its saved position.
      lot({ id: 'partial', sortOrder: 3, quantity: '2', sales: [makeSale({ quantity: '1', soldDate: '2024-09-01' })] }),
    ]
    expect(ids(lots)).toEqual(['open-high', 'partial', 'open-low', 'sold-new', 'sold-old'])
  })

  it('uses the latest of several sales for a sold lot', () => {
    const lots = [
      lot({ id: 'a', quantity: '2', sales: [makeSale({ quantity: '1', soldDate: '2024-01-10' }), makeSale({ quantity: '1', soldDate: '2024-08-01' })] }),
      lot({ id: 'b', quantity: '1', sales: [makeSale({ quantity: '1', soldDate: '2024-05-01' })] }),
    ]
    expect(ids(lots)).toEqual(['a', 'b'])
  })
})

describe('reorderedOpenIds', () => {
  const lots = ['a', 'b', 'c', 'd'].map((id, i) => computeLot(makeInvestment({ id, sortOrder: 10 - i }), priceLookup({})))
  const sold = computeLot(makeInvestment({ id: 's', quantity: '1', sales: [makeSale({ quantity: '1' })] }), priceLookup({}))

  it('moves the dragged lot to the drop target\'s place, in either direction', () => {
    expect(reorderedOpenIds(lots, 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    expect(reorderedOpenIds(lots, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('returns null when nothing changes or a sold lot is involved', () => {
    expect(reorderedOpenIds(lots, 'b', 'b')).toBeNull()
    expect(reorderedOpenIds([...lots, sold], 's', 'a')).toBeNull()
  })
})
