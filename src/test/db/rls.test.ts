// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, createTestDatabase, createUser } from './supabase-shim'

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'

let db: PGlite
let aliceLot: string
let bobLot: string

async function insertLot(userId: string, overrides: Record<string, unknown> = {}) {
  const lot = {
    coin_id: 'bitcoin',
    coin_name: 'Bitcoin',
    symbol: 'BTC',
    buy_date: '2024-01-01',
    buy_price: '40000',
    quantity: '2',
    buy_fee: '10',
    ...overrides,
  }
  return asUser(db, userId, async (tx) => {
    const res = await tx.query<{ id: string; user_id: string }>(
      `insert into public.investments (coin_id, coin_name, symbol, buy_date, buy_price, quantity, buy_fee)
       values ($1, $2, $3, $4, $5, $6, $7) returning id, user_id`,
      [lot.coin_id, lot.coin_name, lot.symbol, lot.buy_date, lot.buy_price, lot.quantity, lot.buy_fee],
    )
    return res.rows[0]!
  })
}

beforeAll(async () => {
  db = await createTestDatabase()
  await createUser(db, ALICE, 'alice@example.com', 'Alice')
  await createUser(db, BOB, 'bob@example.com')
  aliceLot = (await insertLot(ALICE)).id
  bobLot = (await insertLot(BOB, { coin_id: 'ethereum', coin_name: 'Ethereum', symbol: 'ETH' })).id
})

describe('new user bootstrap trigger', () => {
  it('creates a profile and an empty portfolio note for each user', async () => {
    const profiles = await db.query<{ id: string; display_name: string | null }>(
      'select id, display_name from public.profiles order by id',
    )
    expect(profiles.rows).toEqual([
      { id: ALICE, display_name: 'Alice' },
      { id: BOB, display_name: null },
    ])
    const notes = await db.query('select user_id, note, version from public.portfolio_notes order by user_id')
    expect(notes.rows).toEqual([
      { user_id: ALICE, note: '', version: 1 },
      { user_id: BOB, note: '', version: 1 },
    ])
  })
})

describe('investments RLS', () => {
  it('sets user_id from auth.uid() on insert', async () => {
    const row = await insertLot(ALICE, { coin_id: 'solana', coin_name: 'Solana', symbol: 'SOL' })
    expect(row.user_id).toBe(ALICE)
  })

  it('does not let a client supply user_id (column privilege)', async () => {
    await expect(
      asUser(db, ALICE, (tx) =>
        tx.query(
          `insert into public.investments (user_id, coin_id, coin_name, symbol, buy_date, buy_price, quantity)
           values ($1, 'bitcoin', 'Bitcoin', 'BTC', '2024-01-01', 1, 1)`,
          [BOB],
        ),
      ),
    ).rejects.toThrow(/permission denied/)
  })

  it('User A sees only their own records', async () => {
    const rows = await asUser(db, ALICE, (tx) => tx.query<{ user_id: string }>('select user_id from public.investments'))
    expect(rows.rows.length).toBeGreaterThan(0)
    expect(rows.rows.every((r) => r.user_id === ALICE)).toBe(true)
  })

  it("User A cannot read User B's record by id", async () => {
    const rows = await asUser(db, ALICE, (tx) => tx.query('select * from public.investments where id = $1', [bobLot]))
    expect(rows.rows).toHaveLength(0)
  })

  it("User A cannot update User B's record", async () => {
    const res = await asUser(db, ALICE, (tx) =>
      tx.query(`update public.investments set note = 'hacked' where id = $1`, [bobLot]),
    )
    expect(res.affectedRows).toBe(0)
    const check = await db.query<{ note: string | null }>('select note from public.investments where id = $1', [bobLot])
    expect(check.rows[0]!.note).toBeNull()
  })

  it("User A cannot delete User B's record", async () => {
    const res = await asUser(db, ALICE, (tx) => tx.query('delete from public.investments where id = $1', [bobLot]))
    expect(res.affectedRows).toBe(0)
    const check = await db.query('select 1 from public.investments where id = $1', [bobLot])
    expect(check.rows).toHaveLength(1)
  })

  it('a user cannot transfer ownership by updating user_id', async () => {
    await expect(
      asUser(db, ALICE, (tx) => tx.query('update public.investments set user_id = $1 where id = $2', [BOB, aliceLot])),
    ).rejects.toThrow(/permission denied/)
  })

  it('clients cannot write derived sale columns directly', async () => {
    await expect(
      asUser(db, ALICE, (tx) => tx.query(`update public.investments set status = 'SOLD' where id = $1`, [aliceLot])),
    ).rejects.toThrow(/permission denied/)
  })

  it('anonymous users can read nothing', async () => {
    await expect(asUser(db, null, (tx) => tx.query('select * from public.investments'))).rejects.toThrow(
      /permission denied/,
    )
  })

  it('owner can mark a lot as long-term; other users cannot', async () => {
    const own = await asUser(db, ALICE, (tx) =>
      tx.query<{ long_term: boolean }>('update public.investments set long_term = true where id = $1 returning long_term', [aliceLot]),
    )
    expect(own.rows[0]!.long_term).toBe(true)
    const other = await asUser(db, ALICE, (tx) => tx.query('update public.investments set long_term = true where id = $1', [bobLot]))
    expect(other.affectedRows).toBe(0)
    const fresh = await insertLot(BOB)
    const def = await db.query<{ long_term: boolean }>('select long_term from public.investments where id = $1', [fresh.id])
    expect(def.rows[0]!.long_term).toBe(false)
  })

  it('enforces CHECK constraints for price, quantity and fees', async () => {
    await expect(insertLot(ALICE, { buy_price: '0' })).rejects.toThrow(/check constraint/)
    await expect(insertLot(ALICE, { quantity: '-1' })).rejects.toThrow(/check constraint/)
    await expect(insertLot(ALICE, { buy_fee: '-0.01' })).rejects.toThrow(/check constraint/)
  })
})

describe('investment_sales: partial sales, history and authorization', () => {
  it('records partial then full sales and derives status/summary', async () => {
    const lot = (await insertLot(ALICE, { quantity: '3', buy_price: '100', buy_fee: '3' })).id

    await asUser(db, ALICE, (tx) =>
      tx.query(
        `insert into public.investment_sales (investment_id, sold_date, quantity, price, fee) values ($1, '2024-02-01', 1, 150, 1)`,
        [lot],
      ),
    )
    let inv = await db.query<{ status: string; sold_quantity: string; sell_fee: string }>(
      'select status, sold_quantity::text, sell_fee::text from public.investments where id = $1',
      [lot],
    )
    expect(inv.rows[0]).toMatchObject({ status: 'HOLDING', sold_quantity: '1.000000000000000000' })

    await asUser(db, ALICE, (tx) =>
      tx.query(
        `insert into public.investment_sales (investment_id, sold_date, quantity, price, fee) values ($1, '2024-03-01', 2, 200, 2)`,
        [lot],
      ),
    )
    inv = await db.query('select status, sold_quantity::text, sell_fee::text from public.investments where id = $1', [lot])
    expect(inv.rows[0]).toMatchObject({ status: 'SOLD', sold_quantity: '3.000000000000000000', sell_fee: '3.000000000000' })

    const history = await asUser(db, ALICE, (tx) =>
      tx.query('select quantity::text from public.investment_sales where investment_id = $1 order by sold_date', [lot]),
    )
    expect(history.rows).toHaveLength(2)

    // Deleting a sale re-opens the position.
    await asUser(db, ALICE, (tx) =>
      tx.query(`delete from public.investment_sales where investment_id = $1 and sold_date = '2024-03-01'`, [lot]),
    )
    inv = await db.query('select status from public.investments where id = $1', [lot])
    expect(inv.rows[0]).toMatchObject({ status: 'HOLDING' })
  })

  it('rejects selling more than the remaining quantity', async () => {
    const lot = (await insertLot(ALICE, { quantity: '1' })).id
    await expect(
      asUser(db, ALICE, (tx) =>
        tx.query(
          `insert into public.investment_sales (investment_id, sold_date, quantity, price) values ($1, '2024-02-01', 1.5, 100)`,
          [lot],
        ),
      ),
    ).rejects.toThrow(/exceeds the remaining quantity/)
  })

  it('rejects a sale dated before the buy date', async () => {
    await expect(
      asUser(db, ALICE, (tx) =>
        tx.query(
          `insert into public.investment_sales (investment_id, sold_date, quantity, price) values ($1, '2023-12-31', 0.1, 100)`,
          [aliceLot],
        ),
      ),
    ).rejects.toThrow(/before the buy date/)
  })

  it('rejects reducing purchased quantity below the sold quantity', async () => {
    const lot = (await insertLot(ALICE, { quantity: '2' })).id
    await asUser(db, ALICE, (tx) =>
      tx.query(
        `insert into public.investment_sales (investment_id, sold_date, quantity, price) values ($1, '2024-02-01', 1.5, 100)`,
        [lot],
      ),
    )
    await expect(
      asUser(db, ALICE, (tx) => tx.query('update public.investments set quantity = 1 where id = $1', [lot])),
    ).rejects.toThrow(/check constraint/)
    // Reducing to exactly the sold quantity closes the position.
    await asUser(db, ALICE, (tx) => tx.query('update public.investments set quantity = 1.5 where id = $1', [lot]))
    const inv = await db.query('select status from public.investments where id = $1', [lot])
    expect(inv.rows[0]).toMatchObject({ status: 'SOLD' })
  })

  it("User A cannot record a sale against User B's investment", async () => {
    await expect(
      asUser(db, ALICE, (tx) =>
        tx.query(
          `insert into public.investment_sales (investment_id, sold_date, quantity, price) values ($1, '2024-02-01', 0.1, 100)`,
          [bobLot],
        ),
      ),
    ).rejects.toThrow(/Investment not found/)
  })

  it("User A cannot read, update or delete User B's sales", async () => {
    await asUser(db, BOB, (tx) =>
      tx.query(
        `insert into public.investment_sales (investment_id, sold_date, quantity, price) values ($1, '2024-02-01', 0.5, 3000)`,
        [bobLot],
      ),
    )
    const read = await asUser(db, ALICE, (tx) =>
      tx.query('select * from public.investment_sales where investment_id = $1', [bobLot]),
    )
    expect(read.rows).toHaveLength(0)
    const upd = await asUser(db, ALICE, (tx) =>
      tx.query('update public.investment_sales set price = 1 where investment_id = $1', [bobLot]),
    )
    expect(upd.affectedRows).toBe(0)
    const del = await asUser(db, ALICE, (tx) =>
      tx.query('delete from public.investment_sales where investment_id = $1', [bobLot]),
    )
    expect(del.affectedRows).toBe(0)
    const still = await db.query('select 1 from public.investment_sales where investment_id = $1', [bobLot])
    expect(still.rows).toHaveLength(1)
  })

  it('deleting an investment cascades to its sales', async () => {
    const lot = (await insertLot(ALICE, { quantity: '1' })).id
    await asUser(db, ALICE, (tx) =>
      tx.query(
        `insert into public.investment_sales (investment_id, sold_date, quantity, price) values ($1, '2024-02-01', 1, 1)`,
        [lot],
      ),
    )
    await asUser(db, ALICE, (tx) => tx.query('delete from public.investments where id = $1', [lot]))
    const sales = await db.query('select 1 from public.investment_sales where investment_id = $1', [lot])
    expect(sales.rows).toHaveLength(0)
  })
})

describe('portfolio_notes', () => {
  it('owner can update; version increments for optimistic concurrency', async () => {
    const res = await asUser(db, ALICE, (tx) =>
      tx.query<{ version: number }>(
        `update public.portfolio_notes set note = 'hello' where user_id = $1 and version = 1 returning version`,
        [ALICE],
      ),
    )
    expect(res.rows[0]!.version).toBe(2)
    // A stale writer (still on version 1) updates nothing.
    const stale = await asUser(db, ALICE, (tx) =>
      tx.query(`update public.portfolio_notes set note = 'stale' where user_id = $1 and version = 1`, [ALICE]),
    )
    expect(stale.affectedRows).toBe(0)
  })

  it("User A cannot read or modify User B's note", async () => {
    const read = await asUser(db, ALICE, (tx) =>
      tx.query('select * from public.portfolio_notes where user_id = $1', [BOB]),
    )
    expect(read.rows).toHaveLength(0)
    const upd = await asUser(db, ALICE, (tx) =>
      tx.query(`update public.portfolio_notes set note = 'x' where user_id = $1`, [BOB]),
    )
    expect(upd.affectedRows).toBe(0)
  })

  it('a second note row per user is rejected', async () => {
    await expect(
      asUser(db, ALICE, (tx) => tx.query(`insert into public.portfolio_notes (note) values ('dup')`)),
    ).rejects.toThrow(/duplicate key/)
  })

  it('profiles are private to their owner', async () => {
    const rows = await asUser(db, ALICE, (tx) => tx.query<{ id: string }>('select id from public.profiles'))
    expect(rows.rows).toEqual([{ id: ALICE }])
  })
})
