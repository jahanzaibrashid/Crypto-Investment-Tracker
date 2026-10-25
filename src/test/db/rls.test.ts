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

  it('owner can set and clear the exchange; it is limited to 40 characters', async () => {
    const set = await asUser(db, ALICE, (tx) =>
      tx.query<{ exchange: string | null }>("update public.investments set exchange = 'Binance' where id = $1 returning exchange", [aliceLot]),
    )
    expect(set.rows[0]!.exchange).toBe('Binance')
    const other = await asUser(db, ALICE, (tx) => tx.query("update public.investments set exchange = 'Binance' where id = $1", [bobLot]))
    expect(other.affectedRows).toBe(0)
    await asUser(db, ALICE, (tx) => tx.query('update public.investments set exchange = null where id = $1', [aliceLot]))
    // insertLot doesn't send exchange, so insert directly (the column grant allows it).
    const insertOn = (exchange: string) =>
      asUser(db, ALICE, (tx) =>
        tx.query(
          `insert into public.investments (coin_id, coin_name, symbol, buy_date, buy_price, quantity, exchange)
           values ('bitcoin', 'Bitcoin', 'BTC', '2024-01-01', '1', '1', $1) returning id`,
          [exchange],
        ),
      )
    await expect(insertOn('x'.repeat(41))).rejects.toThrow(/check constraint/)
    await expect(insertOn('   ')).rejects.toThrow(/check constraint/)
    expect((await insertOn('MetaMask')).rows).toHaveLength(1)
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

describe('import_investments (bulk import)', () => {
  const lot = (coin: string, overrides: Record<string, unknown> = {}) => ({
    coin_id: coin,
    coin_name: coin,
    symbol: coin.slice(0, 3),
    buy_date: '2024-01-01',
    buy_price: '10',
    quantity: '2',
    buy_fee: '0',
    long_term: false,
    note: null,
    sales: [],
    ...overrides,
  })
  const runImport = (userId: string | null, lots: unknown[]) =>
    asUser(db, userId, (tx) => tx.query<{ n: number }>('select public.import_investments($1::jsonb) as n', [JSON.stringify(lots)]))
  const countCoin = (userId: string, coin: string) =>
    asUser(db, userId, (tx) => tx.query<{ c: number }>('select count(*)::int as c from public.investments where coin_id = $1', [coin])).then(
      (r) => r.rows[0]!.c,
    )

  it("assigns every imported lot and sale to the caller, whatever the file contained", async () => {
    // A user_id smuggled into the payload is ignored: the function never reads it.
    const res = await runImport(ALICE, [
      lot('cardano', { user_id: BOB, long_term: true }),
      lot('polkadot', { sales: [{ sold_date: '2024-02-01', quantity: '2', price: '12', fee: '1', note: 'all' }] }),
    ])
    expect(res.rows[0]!.n).toBe(2)

    const rows = await db.query<{ user_id: string; coin_id: string; status: string; long_term: boolean }>(
      `select user_id, coin_id, status, long_term from public.investments where coin_id in ('cardano', 'polkadot') order by coin_id`,
    )
    expect(rows.rows).toEqual([
      { user_id: ALICE, coin_id: 'cardano', status: 'HOLDING', long_term: true },
      { user_id: ALICE, coin_id: 'polkadot', status: 'SOLD', long_term: false },
    ])
    const sales = await db.query<{ user_id: string }>(
      `select s.user_id from public.investment_sales s join public.investments i on i.id = s.investment_id where i.coin_id = 'polkadot'`,
    )
    expect(sales.rows).toEqual([{ user_id: ALICE }])
  })

  it("imported lots are invisible to other users", async () => {
    expect(await countCoin(BOB, 'cardano')).toBe(0)
    expect(await countCoin(ALICE, 'cardano')).toBe(1)
  })

  it('saves the exchange of each imported lot (blank = not set)', async () => {
    await runImport(ALICE, [lot('tron', { exchange: 'Uniswap' }), lot('stellar', { exchange: '  ' })])
    const rows = await db.query<{ coin_id: string; exchange: string | null }>(
      `select coin_id, exchange from public.investments where coin_id in ('tron', 'stellar') order by coin_id`,
    )
    expect(rows.rows).toEqual([
      { coin_id: 'stellar', exchange: null },
      { coin_id: 'tron', exchange: 'Uniswap' },
    ])
  })

  it('is all-or-nothing: one invalid sale rolls back the whole import', async () => {
    await expect(
      runImport(ALICE, [lot('chainlink'), lot('litecoin', { sales: [{ sold_date: '2024-02-01', quantity: '5', price: '1', fee: '0' }] })]),
    ).rejects.toThrow(/exceeds the remaining quantity/)
    expect(await countCoin(ALICE, 'chainlink')).toBe(0)
    expect(await countCoin(ALICE, 'litecoin')).toBe(0)
  })

  it('applies the table constraints to imported rows', async () => {
    await expect(runImport(ALICE, [lot('stellar', { buy_price: '-1' })])).rejects.toThrow(/check constraint/)
    await expect(runImport(ALICE, [lot('Not Valid!')])).rejects.toThrow(/check constraint/)
  })

  it('never changes existing investments', async () => {
    const before = await db.query('select id, quantity::text, buy_price::text from public.investments where id = $1', [aliceLot])
    await runImport(ALICE, [lot('bitcoin', { buy_price: '40000', quantity: '2', buy_fee: '10' })]) // same as the existing lot
    const after = await db.query('select id, quantity::text, buy_price::text from public.investments where id = $1', [aliceLot])
    expect(after.rows).toEqual(before.rows)
  })

  it('cannot be called without signing in', async () => {
    await expect(runImport(null, [lot('monero')])).rejects.toThrow(/permission denied/)
  })
})

describe('investment order (sort_order)', () => {
  const order = (userId: string, ids: string[]) =>
    asUser(db, userId, (tx) =>
      tx.query<{ id: string; sort_order: string }>('select id, sort_order::text from public.investments where id = any($1) order by sort_order desc', [ids]),
    ).then((r) => r.rows.map((x) => x.id))
  const reorder = (userId: string | null, ids: string[]) =>
    asUser(db, userId, (tx) => tx.query('select public.reorder_open_investments($1::uuid[])', [ids]))
  const openIds = (userId: string) =>
    asUser(db, userId, (tx) =>
      tx.query<{ id: string }>(`select id from public.investments where status = 'HOLDING' order by sort_order desc, created_at desc, id`),
    ).then((r) => r.rows.map((x) => x.id))

  it('gives a new investment the highest position (newest on top)', async () => {
    const older = (await insertLot(ALICE, { coin_id: 'tron', coin_name: 'Tron', symbol: 'TRX' })).id
    const newer = (await insertLot(ALICE, { coin_id: 'tezos', coin_name: 'Tezos', symbol: 'XTZ' })).id
    expect(await order(ALICE, [older, newer])).toEqual([newer, older])
  })

  it('saves a dragged order of all open lots, and it persists', async () => {
    const before = await openIds(ALICE)
    const moved = [...before.slice(1), before[0]!] // drag the top lot to the bottom
    await reorder(ALICE, moved)
    expect(await openIds(ALICE)).toEqual(moved)
  })

  it('refuses an out-of-date list (a lot missing, a sold or foreign lot included) and saves nothing', async () => {
    const current = await openIds(ALICE)
    const sold = (await insertLot(ALICE, { coin_id: 'near', coin_name: 'Near', symbol: 'NEAR' })).id
    await asUser(db, ALICE, (tx) =>
      tx.query(`insert into public.investment_sales (investment_id, sold_date, quantity, price) values ($1, '2024-02-01', 2, 1)`, [sold]),
    )
    await expect(reorder(ALICE, current.slice(1))).rejects.toThrow(/list changed/)
    await expect(reorder(ALICE, [...current, sold])).rejects.toThrow(/list changed/)
    await expect(reorder(ALICE, [...current.slice(1), bobLot])).rejects.toThrow(/list changed/)
    expect(await openIds(ALICE)).toEqual(current)
  })

  it('reorders lots that share a sort_order (e.g. created by one import)', async () => {
    // As the table owner, make every open lot of Alice's tie — the state that made drag-and-drop a no-op.
    await db.query(`update public.investments set sort_order = 42 where user_id = $1`, [ALICE])
    const tied = await openIds(ALICE)
    const moved = [tied[tied.length - 1]!, ...tied.slice(0, -1)] // drag the last lot to the top
    await reorder(ALICE, moved)
    expect(await openIds(ALICE)).toEqual(moved)
    const values = await db.query<{ n: number }>(
      `select count(distinct sort_order)::int as n from public.investments where user_id = $1 and status = 'HOLDING'`,
      [ALICE],
    )
    expect(values.rows[0]!.n).toBe(moved.length) // positions are now unique
  })

  it("never touches another user's order, and needs a signed-in user", async () => {
    const bobBefore = await openIds(BOB)
    await reorder(ALICE, [...(await openIds(ALICE))].reverse())
    expect(await openIds(BOB)).toEqual(bobBefore)
    await expect(reorder(null, [aliceLot])).rejects.toThrow(/permission denied/)
  })
})

describe('trading cycles', () => {
  const start = (userId: string | null, date: string, length = 30) =>
    asUser(db, userId, async (tx) => {
      const res = await tx.query<{ id: string }>(`select public.start_trading_cycle($1, $2, 1000, 30, 0.1) as id`, [date, length])
      return res.rows[0]!.id
    })
  const cycles = (userId: string) =>
    asUser(db, userId, async (tx) =>
      (await tx.query<{ start_date: string; closed_on: string | null; user_id: string }>(
        `select to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(closed_on, 'YYYY-MM-DD') as closed_on, user_id
           from public.trading_cycles order by start_date`,
      )).rows,
    )

  it('starts a cycle owned by the caller and hides it from other users', async () => {
    await start(ALICE, '2026-10-01')
    expect(await cycles(ALICE)).toEqual([{ start_date: '2026-10-01', closed_on: null, user_id: ALICE }])
    expect(await cycles(BOB)).toEqual([])
  })

  it('starting a new cycle closes the running one the day before and keeps it', async () => {
    await start(ALICE, '2026-10-11')
    expect(await cycles(ALICE)).toEqual([
      { start_date: '2026-10-01', closed_on: '2026-10-10', user_id: ALICE },
      { start_date: '2026-10-11', closed_on: null, user_id: ALICE },
    ])
  })

  it('refuses a cycle that starts on or before the latest start date', async () => {
    await expect(start(ALICE, '2026-10-11')).rejects.toThrow(/must start after/)
    await expect(start(ALICE, '2026-09-01')).rejects.toThrow(/must start after/)
  })

  it("other users' cycles don't block or get closed", async () => {
    await start(BOB, '2026-10-05')
    expect((await cycles(ALICE)).map((c) => c.closed_on)).toEqual(['2026-10-10', null])
    expect(await cycles(BOB)).toHaveLength(1)
  })

  it('lets the owner edit settings but not the start date, and never delete', async () => {
    await asUser(db, ALICE, (tx) => tx.query(`update public.trading_cycles set daily_target = 40, length_days = 20 where start_date = '2026-10-11'`))
    const row = await asUser(db, ALICE, async (tx) =>
      (await tx.query<{ daily_target: string; length_days: number }>(`select daily_target::text, length_days from public.trading_cycles where start_date = '2026-10-11'`)).rows[0],
    )
    expect(row).toEqual({ daily_target: '40.000000000000', length_days: 20 })
    await expect(asUser(db, ALICE, (tx) => tx.query(`update public.trading_cycles set start_date = '2026-12-01'`))).rejects.toThrow(/permission denied/)
    await expect(asUser(db, ALICE, (tx) => tx.query(`delete from public.trading_cycles`))).rejects.toThrow(/permission denied/)
  })

  it("can't edit another user's cycle, and needs a signed-in user", async () => {
    const res = await asUser(db, ALICE, (tx) => tx.query(`update public.trading_cycles set daily_target = 1 where user_id = $1 returning id`, [BOB]))
    expect(res.rows).toEqual([])
    await expect(start(null, '2027-01-01')).rejects.toThrow(/permission denied/)
  })
})
