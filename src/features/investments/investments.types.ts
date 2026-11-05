import type { PROFIT_STATUSES } from '@/lib/constants'

/** Numeric columns are carried as decimal strings end-to-end to avoid float precision loss. */
export type DecimalString = string

export type InvestmentStatus = 'HOLDING' | 'SOLD'

export type ProfitStatus = Exclude<(typeof PROFIT_STATUSES)[number]['value'], ''>

export interface Sale {
  id: string
  investmentId: string
  soldDate: string
  quantity: DecimalString
  price: DecimalString
  fee: DecimalString
  note: string | null
  createdAt: string
}

/** One purchase lot. */
export interface Investment {
  id: string
  coinId: string
  coinName: string
  symbol: string
  buyDate: string
  buyPrice: DecimalString
  quantity: DecimalString
  buyFee: DecimalString
  /** Derived in the database from `sales`. */
  status: InvestmentStatus
  /** User-chosen: an open position intended to be held long-term. */
  longTerm: boolean
  /** Exchange or wallet the coins were bought on ("Binance", "MetaMask", …); null = not set. */
  exchange: string | null
  /** Price the user plans to sell this lot at; shows value and profit at that price. null = not set. */
  targetPrice: DecimalString | null
  /** Target in use: the table shows value and profit at the target instead of the live price. */
  targetEnabled: boolean
  /** What happened to the profit: spent, or the wallet or Binance account it is kept in. null = not selected. */
  profitStatus: ProfitStatus | null
  /** Saved position among open lots: higher = nearer the top. New lots get the highest value. */
  sortOrder: number
  note: string | null
  createdAt: string
  updatedAt: string
  sales: Sale[]
}

export interface CoinRef {
  id: string
  name: string
  symbol: string
}

export interface InvestmentInput {
  coinId: string
  coinName: string
  symbol: string
  buyDate: string
  buyPrice: DecimalString
  quantity: DecimalString
  buyFee: DecimalString
  longTerm: boolean
  exchange: string | null
  note: string | null
}

export interface SaleInput {
  investmentId: string
  soldDate: string
  quantity: DecimalString
  price: DecimalString
  fee: DecimalString
  note: string | null
}

/** A purchase lot to import, with its sales (the lot doesn't exist yet, so sales carry no investmentId). */
export interface ImportLotInput extends InvestmentInput {
  profitStatus: ProfitStatus | null
  sales: Omit<SaleInput, 'investmentId'>[]
}
