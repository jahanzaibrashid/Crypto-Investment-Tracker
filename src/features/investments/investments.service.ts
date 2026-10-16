/**
 * Investment persistence (Supabase/PostgREST).
 *
 * - Numeric columns are selected as text (`::text`) so precision survives JSON.
 * - user_id is never sent: the column defaults to auth.uid() and clients have
 *   no privilege to write it. RLS limits every query to the caller's rows.
 */
import { getSupabase } from '@/lib/supabase'
import { mapDbError } from '@/lib/errors'
import type { ImportLotInput, Investment, InvestmentInput, Sale, SaleInput } from './investments.types'

const PAGE = 1000 // PostgREST default max-rows

const INVESTMENT_COLUMNS =
  'id, coin_id, coin_name, symbol, buy_date, buy_price::text, quantity::text, buy_fee::text, status, long_term, sort_order, note, created_at, updated_at'
const SALE_COLUMNS = 'id, investment_id, sold_date, quantity::text, price::text, fee::text, note, created_at'

interface InvestmentRow {
  id: string
  coin_id: string
  coin_name: string
  symbol: string
  buy_date: string
  buy_price: string
  quantity: string
  buy_fee: string
  status: 'HOLDING' | 'SOLD'
  long_term: boolean
  sort_order: number | string
  note: string | null
  created_at: string
  updated_at: string
}

interface SaleRow {
  id: string
  investment_id: string
  sold_date: string
  quantity: string
  price: string
  fee: string
  note: string | null
  created_at: string
}

export function mapSale(r: SaleRow): Sale {
  return {
    id: r.id,
    investmentId: r.investment_id,
    soldDate: r.sold_date,
    quantity: String(r.quantity),
    price: String(r.price),
    fee: String(r.fee),
    note: r.note,
    createdAt: r.created_at,
  }
}

export function mapInvestment(r: InvestmentRow, sales: Sale[]): Investment {
  return {
    id: r.id,
    coinId: r.coin_id,
    coinName: r.coin_name,
    symbol: r.symbol,
    buyDate: r.buy_date,
    buyPrice: String(r.buy_price),
    quantity: String(r.quantity),
    buyFee: String(r.buy_fee),
    status: r.status,
    longTerm: Boolean(r.long_term),
    sortOrder: Number(r.sort_order),
    note: r.note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sales,
  }
}

async function fetchAllRows<T>(table: string, columns: string, order: { column: string; ascending: boolean }[]): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    let q = getSupabase().from(table).select(columns)
    for (const o of order) q = q.order(o.column, { ascending: o.ascending })
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) throw mapDbError(error, 'Could not load your investments.')
    const page = (data ?? []) as unknown as T[]
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

/** Load the complete dataset for the signed-in user (RLS-scoped). */
export async function fetchInvestments(): Promise<Investment[]> {
  const [invRows, saleRows] = await Promise.all([
    fetchAllRows<InvestmentRow>('investments', INVESTMENT_COLUMNS, [
      { column: 'buy_date', ascending: false },
      { column: 'created_at', ascending: false },
      { column: 'id', ascending: true },
    ]),
    fetchAllRows<SaleRow>('investment_sales', SALE_COLUMNS, [
      { column: 'sold_date', ascending: true },
      { column: 'created_at', ascending: true },
      { column: 'id', ascending: true },
    ]),
  ])
  const byInvestment = new Map<string, Sale[]>()
  for (const s of saleRows) {
    const list = byInvestment.get(s.investment_id) ?? []
    list.push(mapSale(s))
    byInvestment.set(s.investment_id, list)
  }
  return invRows.map((r) => mapInvestment(r, byInvestment.get(r.id) ?? []))
}

function toInvestmentPayload(input: InvestmentInput) {
  return {
    coin_id: input.coinId,
    coin_name: input.coinName,
    symbol: input.symbol.toUpperCase(),
    buy_date: input.buyDate,
    buy_price: input.buyPrice,
    quantity: input.quantity,
    buy_fee: input.buyFee || '0',
    long_term: input.longTerm,
    note: input.note?.trim() ? input.note.trim() : null,
  }
}

export async function createInvestment(input: InvestmentInput): Promise<string> {
  const { data, error } = await getSupabase().from('investments').insert(toInvestmentPayload(input)).select('id').single()
  if (error) throw mapDbError(error, 'Could not save the investment.')
  return (data as { id: string }).id
}

export async function updateInvestment(id: string, input: InvestmentInput): Promise<void> {
  const { data, error } = await getSupabase().from('investments').update(toInvestmentPayload(input)).eq('id', id).select('id')
  if (error) throw mapDbError(error, 'Could not update the investment.')
  if (!data || data.length === 0) throw mapDbError({ code: 'PGRST116' })
}

export async function updateInvestmentNote(id: string, note: string | null): Promise<void> {
  const clean = note?.trim() ? note.trim() : null
  const { data, error } = await getSupabase().from('investments').update({ note: clean }).eq('id', id).select('id')
  if (error) throw mapDbError(error, 'Could not save the note.')
  if (!data || data.length === 0) throw mapDbError({ code: 'PGRST116' })
}

export async function deleteInvestment(id: string): Promise<void> {
  const { error } = await getSupabase().from('investments').delete().eq('id', id)
  if (error) throw mapDbError(error, 'Could not delete the investment.')
}

export async function createSale(input: SaleInput): Promise<void> {
  const { error } = await getSupabase()
    .from('investment_sales')
    .insert({
      investment_id: input.investmentId,
      sold_date: input.soldDate,
      quantity: input.quantity,
      price: input.price,
      fee: input.fee || '0',
      note: input.note?.trim() ? input.note.trim() : null,
    })
  if (error) throw mapDbError(error, 'Could not record the sale.')
}

/**
 * Insert many lots and their sales in one database transaction (all or nothing).
 * Ownership comes from the session (auth.uid()) inside the database function;
 * nothing in the payload identifies a user. Returns the number of lots inserted.
 */
export async function importInvestments(lots: ImportLotInput[]): Promise<number> {
  const payload = lots.map((lot) => ({
    ...toInvestmentPayload(lot),
    sales: lot.sales.map((s) => ({
      sold_date: s.soldDate,
      quantity: s.quantity,
      price: s.price,
      fee: s.fee || '0',
      note: s.note?.trim() ? s.note.trim() : null,
    })),
  }))
  const { data, error } = await getSupabase().rpc('import_investments', { p_lots: payload })
  if (error) throw mapDbError(error, 'Could not import the investments.')
  return Number(data ?? 0)
}

/** Save the order of all open lots (ids top to bottom), atomically in the database. */
export async function reorderOpenInvestments(ids: string[]): Promise<void> {
  const { error } = await getSupabase().rpc('reorder_open_investments', { p_ids: ids })
  if (error) throw mapDbError(error, 'Could not save the new order.')
}

export async function deleteSale(id: string): Promise<void> {
  const { error } = await getSupabase().from('investment_sales').delete().eq('id', id)
  if (error) throw mapDbError(error, 'Could not delete the sale.')
}
