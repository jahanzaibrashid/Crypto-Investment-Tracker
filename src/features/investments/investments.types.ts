/** Numeric columns are carried as decimal strings end-to-end to avoid float precision loss. */
export type DecimalString = string

export type InvestmentStatus = 'HOLDING' | 'SOLD'

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
  sales: Omit<SaleInput, 'investmentId'>[]
}
