import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import * as XLSX from 'xlsx'
import { MarketDataError } from '@/features/prices/coingecko.service'
import { DashboardLayout } from '@/features/dashboard/DashboardLayout'
import { HoldingsPage } from '@/features/dashboard/HoldingsPage'
import { OverviewPage } from '@/features/dashboard/OverviewPage'
import { InvestmentsPage } from '@/features/investments/InvestmentsPage'
import { NotesPage } from '@/features/notes/NotesPage'
import { backend, fetchPricesMock, investmentsServiceMock, notesServiceMock, resetBackend, seedInvestment } from '../fake-backend'
import { renderWithProviders } from '../render'

vi.mock('@/features/investments/investments.service', async () => (await import('../fake-backend')).investmentsServiceMock)
vi.mock('@/features/notes/notes.service', async () => (await import('../fake-backend')).notesServiceMock)
vi.mock('@/lib/supabase', async () => {
  const { fakeSupabase } = await import('../fake-backend')
  return { getSupabase: () => fakeSupabase, isSupabaseConfigured: () => true }
})
vi.mock('@/features/prices/coingecko.service', async (importOriginal) => {
  const fb = await import('../fake-backend')
  return { ...(await importOriginal<object>()), fetchPrices: fb.fetchPricesMock, searchCoins: fb.searchCoinsMock }
})
vi.mock('xlsx', async (importOriginal) => ({ ...(await importOriginal<typeof import('xlsx')>()), writeFile: vi.fn() }))

const rows = () => screen.queryAllByTestId('investment-row')

async function renderDashboard(route = '/investments') {
  const user = userEvent.setup()
  const utils = renderWithProviders(
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/holdings" element={<HoldingsPage />} />
        <Route path="/investments" element={<InvestmentsPage />} />
        <Route path="/notes" element={<NotesPage />} />
      </Route>
    </Routes>,
    { route },
  )
  return { user, ...utils }
}

/** Open a row's "⋯" menu and choose an action. */
async function rowAction(user: UserEvent, coin: string, action: 'Edit' | 'Edit note' | 'Sell' | 'Delete') {
  await user.click(await screen.findByRole('button', { name: new RegExp(`^Actions: ${coin}`) }))
  await user.click(await screen.findByRole('menuitem', { name: new RegExp(`^${action}: ${coin}`) }))
}

/** Navigate with the sidebar (the mobile drawer has the same links, but only while it is open). */
async function goTo(user: UserEvent, page: 'Overview' | 'Holdings' | 'Investments' | 'Notes') {
  await user.click(screen.getAllByRole('link', { name: page })[0]!)
  await screen.findByRole('heading', { level: 2, name: page })
}

type StatusLabel = 'Holding' | 'Long-term holding' | 'Sold in profit' | 'Sold in loss'

/** Tick or untick one status in the multi-select Status filter (opens it if needed). */
async function toggleStatus(user: UserEvent, label: StatusLabel) {
  const trigger = screen.getByLabelText('Status')
  if (trigger.getAttribute('aria-expanded') !== 'true') await user.click(trigger)
  await user.click(screen.getByRole('checkbox', { name: label }))
}

beforeEach(() => {
  resetBackend()
})

describe('Dashboard', () => {
  it('shows an empty state with an Add Investment action', async () => {
    await renderDashboard()
    expect(await screen.findByText('No investments yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add your first investment' })).toBeInTheDocument()
  })

  it('adds an investment and shows calculated values from mocked prices', async () => {
    const { user } = await renderDashboard()
    await user.click(await screen.findByRole('button', { name: 'Add your first investment' }))

    const dialog = await screen.findByRole('dialog', { name: 'Add investment' })
    await user.click(within(dialog).getByRole('button', { name: 'BTC' }))
    await user.type(within(dialog).getByLabelText('Buy price per coin'), '40000')
    await user.type(within(dialog).getByLabelText('Quantity purchased'), '0.5')

    // invested amount updates live
    expect(within(dialog).getByTestId('invested-preview')).toHaveTextContent('$20,000')
    // Fees are hidden for now
    expect(within(dialog).queryByLabelText(/fee/i)).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Add investment' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(investmentsServiceMock.createInvestment).toHaveBeenCalledWith(
      expect.objectContaining({ coinId: 'bitcoin', symbol: 'BTC', buyPrice: '40000', quantity: '0.5', buyFee: '0' }),
    )
    // The form never sends a user id — ownership is set by the database.
    expect(investmentsServiceMock.createInvestment.mock.calls[0]![0]).not.toHaveProperty('userId')

    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(await screen.findByText(/Added Bitcoin purchase/)).toBeInTheDocument()
    // value 0.5 × 50,000 = 25,000; P/L = 25,000 − 20,000 = 5,000
    await goTo(user, 'Overview')
    await waitFor(() => expect(screen.getByTestId('card-current-value')).toHaveTextContent('$25,000.00'))
    expect(screen.getByTestId('card-unrealized')).toHaveTextContent('+$5,000.00')
  })

  it('records where a coin was bought: preset, newly added name, badge and filter', async () => {
    const { user } = await renderDashboard()
    const add = async (symbol: string, exchangeText: string, pick: string) => {
      await user.click(await screen.findByRole('button', { name: 'Add Investment' })) // page header button
      const dialog = await screen.findByRole('dialog', { name: 'Add investment' })
      await user.click(within(dialog).getByRole('button', { name: symbol }))
      await user.type(within(dialog).getByLabelText('Buy price per coin'), '100')
      await user.type(within(dialog).getByLabelText('Quantity purchased'), '1')
      await user.type(within(dialog).getByRole('combobox', { name: 'Bought on (optional)' }), exchangeText)
      await user.click(within(dialog).getByRole('option', { name: pick }))
      await user.click(within(dialog).getByRole('button', { name: 'Add investment' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    }

    await add('BTC', 'binance', 'Binance') // typed in lower case → the preset spelling
    await add('ETH', 'My Wallet', 'Add “My Wallet”') // a platform the app doesn't list
    expect(investmentsServiceMock.createInvestment).toHaveBeenCalledWith(expect.objectContaining({ coinId: 'bitcoin', exchange: 'Binance' }))
    expect(investmentsServiceMock.createInvestment).toHaveBeenCalledWith(expect.objectContaining({ coinId: 'ethereum', exchange: 'My Wallet' }))

    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(within(rows().find((r) => within(r).queryByText('BTC'))!).getByText('Binance')).toBeInTheDocument()

    // The new name is now suggested like a preset.
    await user.click(screen.getByRole('button', { name: 'Add Investment' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add investment' })
    await user.click(within(dialog).getByRole('combobox', { name: 'Bought on (optional)' }))
    expect(within(dialog).getByRole('option', { name: 'My Wallet' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await user.selectOptions(screen.getByLabelText('Bought on'), 'My Wallet')
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(within(rows()[0]!).getByText('ETH')).toBeInTheDocument()
  })

  it('opens the navigation drawer from the menu button and closes it after choosing a page', async () => {
    const { user } = await renderDashboard()
    const menuButton = screen.getByRole('button', { name: 'Open menu' })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    await user.click(menuButton)
    const drawer = await screen.findByRole('dialog', { name: 'Menu' })
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    expect(within(drawer).getByRole('button', { name: 'Close menu' })).toHaveFocus()
    expect(within(drawer).getByRole('button', { name: 'Export to Excel' })).toBeInTheDocument()

    await user.click(within(drawer).getByRole('link', { name: 'Holdings' }))
    await screen.findByRole('heading', { level: 2, name: 'Holdings' })
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()

    await user.click(menuButton)
    await screen.findByRole('dialog', { name: 'Menu' })
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
    expect(menuButton).toHaveFocus()
  })

  it('orders the add/edit form fields: coin, quantity, price, date', async () => {
    const { user } = await renderDashboard()
    await user.click(await screen.findByRole('button', { name: 'Add your first investment' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add investment' })
    const labels = within(dialog)
      .getAllByRole('textbox')
      .map((el) => ({ el, label: el.getAttribute('aria-label') ?? dialog.querySelector(`label[for="${el.id}"]`)?.textContent ?? '' }))
      .sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map((x) => x.label)
      .filter((l) => /Quantity|Buy price|Buy date/.test(l))
    expect(labels).toEqual(['Quantity purchased', 'Buy price per coin', 'Buy date'])
  })

  it('shows and accepts the buy date in the short 1-Sep-26 format', async () => {
    const { user } = await renderDashboard()
    await user.click(await screen.findByRole('button', { name: 'Add your first investment' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add investment' })
    const date = within(dialog).getByLabelText('Buy date')
    expect((date as HTMLInputElement).value).toMatch(/^\d{1,2}-[A-Z][a-z]{2}-\d{2}$/) // today, e.g. 16-Oct-26

    await user.click(within(dialog).getByRole('button', { name: 'BTC' }))
    await user.type(within(dialog).getByLabelText('Quantity purchased'), '0.1')
    await user.type(within(dialog).getByLabelText('Buy price per coin'), '2400')
    await user.clear(date)
    await user.type(date, '1-sep-2026')
    await user.click(within(dialog).getByLabelText('Quantity purchased')) // leave the field
    expect(date).toHaveValue('1-Sep-26')
    await user.click(within(dialog).getByRole('button', { name: 'Add investment' }))
    await waitFor(() => expect(investmentsServiceMock.createInvestment).toHaveBeenCalledWith(expect.objectContaining({ buyDate: '2026-09-01' })))
  })

  it('rejects a buy date it cannot read', async () => {
    const { user } = await renderDashboard()
    await user.click(await screen.findByRole('button', { name: 'Add your first investment' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add investment' })
    const date = within(dialog).getByLabelText('Buy date')
    await user.clear(date)
    await user.type(date, '31-Feb-26')
    await user.click(within(dialog).getByLabelText('Quantity purchased')) // leave the field
    expect(await within(dialog).findByText('Buy date must be a valid date')).toBeInTheDocument()
  })

  it('does not allow a buy date after the first sale when editing', async () => {
    seedInvestment({
      coinId: 'ethereum', coinName: 'Ethereum', symbol: 'ETH', buyDate: '2026-09-01', quantity: '1',
      sales: [{ id: 's', investmentId: 'x', soldDate: '2026-09-18', quantity: '1', price: '2500', fee: '0', note: null, createdAt: '' }],
    })
    const { user } = await renderDashboard()
    await rowAction(user, 'Ethereum', 'Edit')
    const dialog = await screen.findByRole('dialog', { name: 'Edit investment' })
    const date = within(dialog).getByLabelText('Buy date')
    await user.clear(date)
    await user.type(date, '20-Sep-26')
    await user.click(within(dialog).getByLabelText('Quantity purchased'))
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(await within(dialog).findByText("Buy date can't be after the first sale (18-Sep-26)")).toBeInTheDocument()
    expect(investmentsServiceMock.updateInvestment).not.toHaveBeenCalled()
  })

  it('validates required fields and positive numbers', async () => {
    const { user } = await renderDashboard()
    await user.click(await screen.findByRole('button', { name: 'Add your first investment' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add investment' })
    await user.type(within(dialog).getByLabelText('Buy price per coin'), '0')
    await user.click(within(dialog).getByRole('button', { name: 'Add investment' }))
    expect(await within(dialog).findByText('Select a cryptocurrency')).toBeInTheDocument()
    expect(within(dialog).getByText('Buy price must be greater than zero')).toBeInTheDocument()
    expect(within(dialog).getByText('Quantity is required')).toBeInTheDocument()
    expect(investmentsServiceMock.createInvestment).not.toHaveBeenCalled()
  })

  it('edits an investment', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC', buyPrice: '30000', quantity: '1' })
    const { user } = await renderDashboard()
    await rowAction(user, 'Bitcoin', 'Edit')
    const dialog = await screen.findByRole('dialog', { name: 'Edit investment' })
    const qty = within(dialog).getByLabelText('Quantity purchased')
    expect(qty).toHaveValue('1')
    await user.clear(qty)
    await user.type(qty, '2')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(investmentsServiceMock.updateInvestment).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ quantity: '2' }))
    await goTo(user, 'Overview')
    await waitFor(() => expect(screen.getByTestId('card-total-invested')).toHaveTextContent('$60,000.00'))
  })

  it('deletes an investment only after confirmation', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC' })
    seedInvestment({ coinId: 'ethereum', coinName: 'Ethereum', symbol: 'ETH' })
    const { user } = await renderDashboard()
    await waitFor(() => expect(rows()).toHaveLength(2))

    await rowAction(user, 'Ethereum', 'Delete')
    const confirm = await screen.findByRole('dialog', { name: 'Delete this investment?' })
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(investmentsServiceMock.deleteInvestment).not.toHaveBeenCalled()

    await rowAction(user, 'Ethereum', 'Delete')
    await user.click(within(await screen.findByRole('dialog', { name: 'Delete this investment?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(investmentsServiceMock.deleteInvestment).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Ethereum')).not.toBeInTheDocument()
  })

  it('marks a position as sold and shows realized P/L without double counting', async () => {
    seedInvestment({ coinId: 'ethereum', coinName: 'Ethereum', symbol: 'ETH', buyPrice: '2000', quantity: '2', buyFee: '4' })
    const { user } = await renderDashboard()
    await rowAction(user, 'Ethereum', 'Sell')
    const dialog = await screen.findByRole('dialog', { name: /Sell Ethereum/ })
    expect(within(dialog).getByLabelText('Quantity sold')).toHaveValue('2') // defaults to full remaining
    await user.type(within(dialog).getByLabelText('Sale price per coin'), '2500')
    expect(within(dialog).queryByLabelText(/fee/i)).not.toBeInTheDocument() // fees hidden for now
    // proceeds 5000; cost 4004 (seeded buy fee 4 still counts) → +996
    expect(within(dialog).getByTestId('realized-preview')).toHaveTextContent('+$996.00')
    await user.click(within(dialog).getByRole('button', { name: 'Mark as sold' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const row = (await screen.findAllByTestId('investment-row'))[0]!
    await waitFor(() => expect(within(row).getByText('Sold · Profit')).toBeInTheDocument())
    expect(row).toHaveAttribute('data-row-tone', 'SOLD_PROFIT')
    // Realized result shown in the Profit / Loss column (amount + %).
    expect(within(row).getByText('+$996')).toBeInTheDocument()
    await goTo(user, 'Overview')
    expect(screen.getByTestId('card-realized')).toHaveTextContent('+$996.00')
    expect(screen.getByTestId('card-current-value')).toHaveTextContent('$0.00')
    expect(screen.getByTestId('card-total-return')).toHaveTextContent('+$996.00')
  })

  it('records a partial sale and keeps the rest as holding', async () => {
    seedInvestment({ coinId: 'solana', coinName: 'Solana', symbol: 'SOL', buyPrice: '100', quantity: '10' })
    const { user } = await renderDashboard()
    await rowAction(user, 'Solana', 'Sell')
    const dialog = await screen.findByRole('dialog', { name: /Sell Solana/ })
    const qty = within(dialog).getByLabelText('Quantity sold')
    expect(qty).toHaveAttribute('readonly') // sell-all by default: quantity locked
    await user.click(within(dialog).getByRole('button', { name: 'Sell part' }))
    expect(qty).not.toHaveAttribute('readonly')
    await user.clear(qty)
    await user.type(qty, '4')
    await user.type(within(dialog).getByLabelText('Sale price per coin'), '120')
    await user.click(within(dialog).getByRole('button', { name: 'Record partial sale' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Partial sale')).toBeInTheDocument()
    expect(screen.getByText('6 left')).toBeInTheDocument()
    await goTo(user, 'Overview')
    // realized (4×120 − 400) = 80; unrealized 6×150 − 600 = 300
    expect(screen.getByTestId('card-realized')).toHaveTextContent('+$80.00')
    expect(screen.getByTestId('card-unrealized')).toHaveTextContent('+$300.00')
  })

  it('filters by sale period and status and sorts by profit/loss', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC', buyPrice: '25000', buyDate: '2024-01-01' }) // +100%
    seedInvestment({ coinId: 'ethereum', coinName: 'Ethereum', symbol: 'ETH', buyPrice: '6000', buyDate: '2024-02-01' }) // −50%
    seedInvestment({
      coinId: 'solana',
      coinName: 'Solana',
      symbol: 'SOL',
      buyPrice: '100',
      buyDate: '2024-03-01',
      sales: [{ id: 's1', investmentId: 'x', soldDate: '2024-04-01', quantity: '1', price: '110', fee: '0', note: null, createdAt: '' }],
    }) // sold +10%
    const { user } = await renderDashboard()
    await waitFor(() => expect(rows()).toHaveLength(3))

    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument() // search filter removed for now
    await user.selectOptions(screen.getByLabelText('Sold in'), '2024-04')
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(within(rows()[0]!).getByText('Solana')).toBeInTheDocument()
    expect(screen.getByText('Showing 1 of 3 investments', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Sold from 1-Apr-24 to 30-Apr-24', { exact: false })).toBeInTheDocument()
    // Phones: the collapsed "Filters" button counts applied filters, and each shows as a removable chip.
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveTextContent('1')
    await user.click(screen.getByRole('button', { name: 'Remove filter: Sold: April 2024' }))
    await waitFor(() => expect(rows()).toHaveLength(3))

    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!)
    await toggleStatus(user, 'Sold in profit')
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(within(rows()[0]!).getByText('Solana')).toBeInTheDocument()
    // Several statuses at once.
    await toggleStatus(user, 'Holding')
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(screen.getByLabelText('Status')).toHaveTextContent('2 selected')

    await user.click(screen.getByRole('button', { name: 'Show all' }))
    expect(screen.getByLabelText('Status')).toHaveTextContent('All statuses')
    // Numeric columns sort highest-first on the first click (BTC +$25,000, SOL +$10, ETH −$3,000).
    await user.click(screen.getByRole('button', { name: 'Sort by profit/loss' }))
    await waitFor(() => expect(within(rows()[0]!).getByText('Bitcoin')).toBeInTheDocument())
    expect(screen.getByRole('columnheader', { name: /Profit \/ Loss/ })).toHaveAttribute('aria-sort', 'descending')
    expect(rows().map((r) => within(r).getByText(/^(BTC|SOL|ETH)$/).textContent)).toEqual(['BTC', 'SOL', 'ETH'])
    await user.click(screen.getByRole('button', { name: 'Sort by profit/loss' }))
    await waitFor(() => expect(within(rows()[0]!).getByText('Ethereum')).toBeInTheDocument())
    expect(screen.getByRole('columnheader', { name: /Profit \/ Loss/ })).toHaveAttribute('aria-sort', 'ascending')

    // Filters only affect the table; the Overview totals cover every investment.
    await goTo(user, 'Overview')
    expect(screen.getByTestId('card-holdings')).toHaveTextContent('2')
  })

  it('shows what came back from a sale: sold price, sold amount and sold date', async () => {
    // Bought 0.1 ETH at $2,400 ($240 invested) and sold it at $2,500 ($250 back).
    seedInvestment({
      coinId: 'ethereum', coinName: 'Ethereum', symbol: 'ETH', quantity: '0.1', buyPrice: '2400', buyDate: '2026-09-01',
      sales: [{ id: 's', investmentId: 'x', soldDate: '2026-09-18', quantity: '0.1', price: '2500', fee: '0', note: null, createdAt: '' }],
    })
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC', buyDate: '2026-09-02' })
    await renderDashboard()
    await waitFor(() => expect(rows()).toHaveLength(2))
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim())
    const cellOf = (coin: string, header: string) => {
      const row = rows().find((r) => within(r).queryByText(coin))!
      return within(row).getAllByRole('cell')[headers.indexOf(header)]!
    }
    expect(cellOf('Ethereum', 'Bought')).toHaveTextContent(/^0\.11-Sep-26$/) // two lines: qty / date
    // Profit / Loss shows the amount and the % together: $250 − $240 = +$10 (+4.17%)
    expect(cellOf('Ethereum', 'Profit / Loss')).toHaveTextContent('+$10')
    expect(cellOf('Ethereum', 'Profit / Loss')).toHaveTextContent('+4.17%')
    expect(cellOf('Ethereum', 'Invested')).toHaveTextContent(/^@ \$2,400\$240$/) // @ buy price / amount
    expect(cellOf('Ethereum', 'Sold amount')).toHaveTextContent('$250.00')
    expect(cellOf('Ethereum', 'Sold amount')).toHaveTextContent('@ $2,500')
    expect(cellOf('Ethereum', 'Sold amount')).toHaveTextContent('18-Sep-26')
    expect(cellOf('Ethereum', 'Current value')).toHaveTextContent('—')
    // Positions still held show no sale values; current value shows "amount @ live price".
    expect(cellOf('Bitcoin', 'Sold amount')).toHaveTextContent('—')
    await waitFor(() => expect(cellOf('Bitcoin', 'Current value')).toHaveTextContent('$50,000.00'))
    expect(cellOf('Bitcoin', 'Current value')).toHaveTextContent('@ $50,000')
  })

  it('shows columns in the order Coin, Bought, Invested, Current value, Sold amount, Profit / Loss', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC' })
    await renderDashboard()
    await waitFor(() => expect(rows()).toHaveLength(1))
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim())
    expect(headers.slice(0, 9)).toEqual(['#', 'Coin', 'Bought', 'Invested', 'Current value', 'Sold amount', 'Profit / Loss', 'Status', 'Note'])
  })

  it('has separate Overview, Holdings, Investments and Notes pages with the active page highlighted', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC', quantity: '2' })
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC', quantity: '1' })
    const { user } = await renderDashboard('/overview')
    expect(await screen.findByTestId('card-total-invested')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Investments' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Overview' })[0]).toHaveAttribute('aria-current', 'page')

    await goTo(user, 'Holdings')
    expect(await screen.findByText('Holdings by coin')).toBeInTheDocument()
    expect(screen.queryByTestId('card-total-invested')).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Holdings' })[0]).toHaveAttribute('aria-current', 'page')

    await goTo(user, 'Investments')
    await waitFor(() => expect(rows()).toHaveLength(2))

    await goTo(user, 'Notes')
    expect(await screen.findByLabelText('Portfolio note')).toBeInTheDocument()
    expect(rows()).toHaveLength(0)
  })

  it('colors rows by status: holding, long-term, sold in profit, sold in loss', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC', buyDate: '2024-01-04' })
    seedInvestment({ coinId: 'ethereum', coinName: 'Ethereum', symbol: 'ETH', longTerm: true, buyDate: '2024-01-03' })
    seedInvestment({
      coinId: 'solana', coinName: 'Solana', symbol: 'SOL', buyPrice: '100', buyDate: '2024-01-02',
      sales: [{ id: 'a', investmentId: 'x', soldDate: '2024-02-01', quantity: '1', price: '120', fee: '0', note: null, createdAt: '' }],
    })
    seedInvestment({
      coinId: 'dogecoin', coinName: 'Dogecoin', symbol: 'DOGE', buyPrice: '100', buyDate: '2024-01-01',
      sales: [{ id: 'b', investmentId: 'y', soldDate: '2024-02-01', quantity: '1', price: '80', fee: '0', note: null, createdAt: '' }],
    })
    const { user } = await renderDashboard()
    await waitFor(() => expect(rows()).toHaveLength(4))
    const byCoin = (name: string) => rows().find((r) => within(r).queryByText(name))!
    expect(byCoin('Bitcoin')).toHaveAttribute('data-row-tone', 'HOLDING')
    expect(within(byCoin('Bitcoin')).getByText('Holding')).toBeInTheDocument()
    expect(byCoin('Ethereum')).toHaveAttribute('data-row-tone', 'LONG_TERM')
    expect(within(byCoin('Ethereum')).getByText('Long-term')).toBeInTheDocument()
    expect(byCoin('Solana')).toHaveAttribute('data-row-tone', 'SOLD_PROFIT')
    expect(within(byCoin('Solana')).getByText('Sold · Profit')).toBeInTheDocument()
    expect(byCoin('Dogecoin')).toHaveAttribute('data-row-tone', 'SOLD_LOSS')
    expect(within(byCoin('Dogecoin')).getByText('Sold · Loss')).toBeInTheDocument()

    await toggleStatus(user, 'Sold in loss')
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(within(rows()[0]!).getByText('Dogecoin')).toBeInTheDocument()
    await toggleStatus(user, 'Long-term holding')
    await waitFor(() => expect(rows()).toHaveLength(2))
    await toggleStatus(user, 'Sold in loss')
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(within(rows()[0]!).getByText('Ethereum')).toBeInTheDocument()
  })

  it('marks a purchase as long-term from the form', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC' })
    const { user } = await renderDashboard()
    await rowAction(user, 'Bitcoin', 'Edit')
    const dialog = await screen.findByRole('dialog', { name: 'Edit investment' })
    await user.click(within(dialog).getByRole('checkbox', { name: /Long-term holding/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(investmentsServiceMock.updateInvestment).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ longTerm: true }))
    await waitFor(() => expect(rows()[0]).toHaveAttribute('data-row-tone', 'LONG_TERM'))
  })

  it('opens position details by clicking anywhere on a row (no separate view button)', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC', buyPrice: '30000' })
    const { user } = await renderDashboard()
    const row = (await screen.findAllByTestId('investment-row'))[0]!
    expect(within(row).queryByRole('button', { name: /View details/ })).not.toBeInTheDocument()

    await user.click(within(row).getByText('Bitcoin'))
    expect(await screen.findByRole('dialog', { name: /Bitcoin \(BTC\) — position details/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))

    // Keyboard: focus the row and press Enter.
    row.focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('dialog', { name: /position details/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))

    // Action buttons open their own dialog only.
    await rowAction(user, 'Bitcoin', 'Edit')
    expect(await screen.findByRole('dialog', { name: 'Edit investment' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /position details/ })).not.toBeInTheDocument()
  })

  it('shows a color legend with counts that filters the table when clicked', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC' })
    seedInvestment({ coinId: 'ethereum', coinName: 'Ethereum', symbol: 'ETH', longTerm: true })
    seedInvestment({
      coinId: 'solana', coinName: 'Solana', symbol: 'SOL', buyPrice: '100',
      sales: [{ id: 'a', investmentId: 'x', soldDate: '2024-02-01', quantity: '1', price: '120', fee: '0', note: null, createdAt: '' }],
    })
    const { user } = await renderDashboard()
    await waitFor(() => expect(rows()).toHaveLength(3))
    const legend = screen.getByRole('group', { name: /Row colors/ })
    expect(within(legend).getByRole('button', { name: 'Holding: 1 investment' })).toBeInTheDocument()
    expect(within(legend).getByRole('button', { name: 'Long-term: 1 investment' })).toBeInTheDocument()
    expect(within(legend).getByRole('button', { name: 'Sold · Profit: 1 investment' })).toBeInTheDocument()
    expect(within(legend).getByRole('button', { name: 'Sold · Loss: 0 investments' })).toBeInTheDocument()

    const longTerm = within(legend).getByRole('button', { name: /Long-term/ })
    await user.click(longTerm)
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(longTerm).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Status')).toHaveTextContent('Long-term holding')
    // A second chip adds its status; the dropdown follows.
    const profit = within(legend).getByRole('button', { name: /Sold · Profit/ })
    await user.click(profit)
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(screen.getByLabelText('Status')).toHaveTextContent('2 selected')
    await user.click(profit)
    await user.click(longTerm) // both off again → all rows
    await waitFor(() => expect(rows()).toHaveLength(3))
  })

  it('shows a totals row for the rows in the table (respecting filters)', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC', buyPrice: '30000' }) // value 50,000 → +20,000
    seedInvestment({
      coinId: 'solana', coinName: 'Solana', symbol: 'SOL', buyPrice: '100',
      sales: [{ id: 'a', investmentId: 'x', soldDate: '2024-02-01', quantity: '1', price: '120', fee: '0', note: null, createdAt: '' }],
    }) // sold 120 → +20
    const { user } = await renderDashboard()
    await waitFor(() => expect(rows()).toHaveLength(2))
    const totals = screen.getByTestId('totals-row')
    const cell = (id: string) => totals.querySelector(`[data-column="${id}"]`)!
    expect(cell('coin')).toHaveTextContent('Total2 rows')
    expect(cell('invested')).toHaveTextContent('$30,100')
    await waitFor(() => expect(cell('currentValue')).toHaveTextContent('$50,000.00'))
    expect(cell('soldAmount')).toHaveTextContent('$120.00')
    expect(cell('pl')).toHaveTextContent('+$20,020')
    expect(cell('pl')).toHaveTextContent('+66.51%')

    await toggleStatus(user, 'Sold in profit')
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(cell('coin')).toHaveTextContent('Total1 row')
    expect(cell('invested')).toHaveTextContent('$100')
    expect(cell('pl')).toHaveTextContent('+$20')
  })

  it('keeps the column headers compact: no ⓘ buttons', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC' })
    await renderDashboard()
    await waitFor(() => expect(rows()).toHaveLength(1))
    const table = screen.getByRole('table', { name: 'Investments' })
    expect(within(table).queryByRole('button', { name: /^About / })).not.toBeInTheDocument()
  })

  it('colors current value green above the invested amount and red below it', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC', buyPrice: '30000' }) // worth 50,000 > 30,000
    seedInvestment({ coinId: 'ethereum', coinName: 'Ethereum', symbol: 'ETH', buyPrice: '6000' }) // worth 3,000 < 6,000
    await renderDashboard()
    await waitFor(() => expect(rows()).toHaveLength(2))
    const value = (coin: string) => within(rows().find((r) => within(r).queryByText(coin))!).getByTitle(/invested/)
    await waitFor(() => expect(value('BTC')).toHaveClass('text-success-text'))
    expect(value('BTC')).toHaveAttribute('title', '$20,000.00 more than invested')
    expect(value('ETH')).toHaveClass('text-destructive-text')
    expect(value('ETH')).toHaveAttribute('title', '$3,000.00 less than invested')
    // The "@ price" line under the value follows the same color.
    const row = (coin: string) => within(rows().find((r) => within(r).queryByText(coin))!)
    expect(row('BTC').getByText('@ $50,000')).toHaveClass('text-success-text') // live price (bought @ $30,000)
    expect(row('ETH').getByText('@ $3,000')).toHaveClass('text-destructive-text') // live price (bought @ $6,000)
    expect(row('BTC').getByText('@ $30,000')).not.toHaveClass('text-success-text') // buy price stays neutral
    // Totals: 53,000 vs 36,000 invested → green
    expect(within(screen.getByTestId('totals-row')).getByTitle(/invested/)).toHaveClass('text-success-text')
  })

  it('shows the coin as text only (no icon), plus the profit/loss pill and ROI', async () => {
    seedInvestment({
      coinId: 'ethereum', coinName: 'Ethereum', symbol: 'ETH', quantity: '0.1', buyPrice: '2400',
      sales: [{ id: 's', investmentId: 'x', soldDate: '2026-09-18', quantity: '0.1', price: '2500', fee: '0', note: null, createdAt: '' }],
    })
    await renderDashboard()
    const row = (await screen.findAllByTestId('investment-row'))[0]!
    expect(within(row).queryByTestId('coin-avatar')).not.toBeInTheDocument()
    expect(within(row).getByText('ETH')).toBeInTheDocument()
    expect(within(row).getByText('+$10')).toBeInTheDocument()
    expect(within(row).getByText('+4.17%')).toBeInTheDocument()
  })

  it('paginates with page-number buttons', async () => {
    for (let i = 0; i < 15; i++) {
      seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC', buyDate: `2024-01-${String(i + 1).padStart(2, '0')}` })
    }
    const { user } = await renderDashboard()
    await waitFor(() => expect(rows()).toHaveLength(10))
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('button', { name: 'Page 2' }))
    await waitFor(() => expect(rows()).toHaveLength(5))
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('11–15 of 15')).toBeInTheDocument()
    // Totals still cover all 15 rows, not just this page.
    expect(within(screen.getByTestId('totals-row')).getByText('15 rows')).toBeInTheDocument()
  })

  it('shows holdings as cards instead of a table on phone-sized screens', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    try {
      seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC', quantity: '2' })
      seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC', quantity: '1' })
      await renderDashboard('/holdings')
      const list = await screen.findByRole('list', { name: 'Holdings by coin' })
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(within(list).getAllByRole('listitem')).toHaveLength(1)
      expect(within(list).getByText('Bitcoin · 2 lots')).toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps the one-row-per-investment table on phone-sized screens', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    try {
      seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC', buyPrice: '30000', buyDate: '2024-01-02' })
      seedInvestment({ coinId: 'ethereum', coinName: 'Ethereum', symbol: 'ETH', buyPrice: '6000', buyDate: '2024-01-01' })
      const { user } = await renderDashboard()
      await waitFor(() => expect(rows()).toHaveLength(2))
      expect(screen.getByRole('table', { name: 'Investments' })).toBeInTheDocument()
      expect(screen.getByTestId('totals-row')).toHaveTextContent('2 rows')

      // Tapping a row opens its details; the ⋯ menu still works.
      await user.click(within(rows().find((r) => within(r).queryByText('BTC'))!).getByText('BTC'))
      expect(await screen.findByRole('dialog', { name: /Bitcoin \(BTC\) — position details/ })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Close dialog' }))
      await rowAction(user, 'Ethereum', 'Edit')
      expect(await screen.findByRole('dialog', { name: 'Edit investment' })).toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('on phones, reorders with Move up / Move down in the row menu instead of the drag grip', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    try {
      const btc = seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC' })
      const eth = seedInvestment({ coinId: 'ethereum', coinName: 'Ethereum', symbol: 'ETH' }) // newest: on top
      const { user } = await renderDashboard()
      await waitFor(() => expect(rows()).toHaveLength(2))

      await user.click(await screen.findByRole('button', { name: /^Actions: Ethereum/ }))
      expect(await screen.findByRole('menuitem', { name: /^Move up: Ethereum/ })).toHaveAttribute('aria-disabled', 'true') // already first
      await user.click(screen.getByRole('menuitem', { name: /^Move down: Ethereum/ }))
      await waitFor(() => expect(investmentsServiceMock.reorderOpenInvestments).toHaveBeenCalledWith([btc.id, eth.id]))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('offers no Move up / Move down on larger screens (rows are dragged there)', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC' })
    const { user } = await renderDashboard()
    await user.click(await screen.findByRole('button', { name: /^Actions: Bitcoin/ }))
    await screen.findByRole('menuitem', { name: /^Edit: Bitcoin/ })
    expect(screen.queryByRole('menuitem', { name: /^Move up/ })).not.toBeInTheDocument()
  })

  it('groups row actions in a "⋯" menu that works with the keyboard', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC', buyDate: '2024-01-02' })
    seedInvestment({
      coinId: 'solana', coinName: 'Solana', symbol: 'SOL', buyDate: '2024-01-01',
      sales: [{ id: 's', investmentId: 'x', soldDate: '2024-02-01', quantity: '1', price: '120', fee: '0', note: null, createdAt: '' }],
    })
    const { user } = await renderDashboard()
    await waitFor(() => expect(rows()).toHaveLength(2))
    // One trigger per row, no separate icon buttons.
    expect(screen.queryByRole('button', { name: /^Edit: / })).not.toBeInTheDocument()

    const trigger = screen.getByRole('button', { name: /^Actions: Bitcoin/ })
    await user.click(trigger)
    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Edit', 'Edit note', 'Sell', 'Delete'])
    expect(within(menu).getByRole('menuitem', { name: /^Edit: Bitcoin/ })).toHaveFocus()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(within(menu).getByRole('menuitem', { name: /^Sell: Bitcoin/ })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // opening the menu did not open details

    // Sell is disabled for a fully sold position.
    await user.click(screen.getByRole('button', { name: /^Actions: Solana/ }))
    const sell = await screen.findByRole('menuitem', { name: /^Sell: Solana/ })
    expect(sell).toHaveAttribute('aria-disabled', 'true')
    await user.click(sell)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the Add dialog from the empty Overview "Add your first investment" link', async () => {
    const { user } = await renderDashboard('/overview')
    await user.click(await screen.findByRole('link', { name: 'Add your first investment' }))
    expect(await screen.findByRole('dialog', { name: 'Add investment' })).toBeInTheDocument()
  })

  it('has no Add Investment button on the Overview once there are investments', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC' })
    await renderDashboard('/overview')
    await screen.findByTestId('card-current-value')
    expect(screen.queryByRole('link', { name: /Add (your first )?investment/i })).not.toBeInTheDocument()
  })

  it('shows a clear error and unavailable values when the price API fails', async () => {
    backend.priceError = new MarketDataError('rate_limited', 'Rate limited', { status: 429, retryAfterSeconds: 60 })
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC' })
    const { user } = await renderDashboard()
    expect(await screen.findByText(/CoinGecko rate limit reached/)).toBeInTheDocument()
    const row = (await screen.findAllByTestId('investment-row'))[0]!
    expect(within(row).getByText('Unavailable')).toBeInTheDocument()
    expect(within(row).getByText('No price')).toBeInTheDocument()
    await goTo(user, 'Overview')
    expect(screen.getByText(/No current price for: bitcoin/)).toBeInTheDocument()
  })

  it('labels last-known prices as stale after a failed refresh', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC' })
    const { user } = await renderDashboard('/overview')
    await waitFor(() => expect(screen.getByTestId('card-current-value')).toHaveTextContent('$50,000.00'))
    // Rate-limit errors are not retried, so the failure surfaces immediately.
    backend.priceError = new MarketDataError('rate_limited', 'Rate limited', { status: 429 })
    await user.click(screen.getByRole('button', { name: 'Refresh prices' }))
    expect(await screen.findByText('Stale prices')).toBeInTheDocument()
    // last good price kept, but marked stale
    expect(screen.getByTestId('card-current-value')).toHaveTextContent('$50,000.00')
    await goTo(user, 'Investments')
    expect(within((await screen.findAllByTestId('investment-row'))[0]!).getByText('Stale')).toBeInTheDocument()
    expect(fetchPricesMock).toHaveBeenCalledTimes(2)
  })

  it('exports the full dataset, not just the visible page', async () => {
    for (let i = 0; i < 15; i++) {
      seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC', buyDate: `2024-01-${String(i + 1).padStart(2, '0')}` })
    }
    const { user } = await renderDashboard()
    await waitFor(() => expect(rows()).toHaveLength(10)) // first page only
    await user.click(screen.getByRole('button', { name: 'Export to Excel' }))
    await waitFor(() => expect(XLSX.writeFile).toHaveBeenCalledTimes(1))
    const wb = vi.mocked(XLSX.writeFile).mock.calls[0]![0]
    const exported = XLSX.utils.sheet_to_json(wb.Sheets.Investments!)
    expect(exported).toHaveLength(15)
    expect(await screen.findByText(/Exported 15 investments/)).toBeInTheDocument()
  })

  it('reports an export failure', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC' })
    vi.mocked(XLSX.writeFile).mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    const { user } = await renderDashboard()
    await waitFor(() => expect(rows()).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: 'Export to Excel' }))
    expect(await screen.findByText('Export failed: disk full')).toBeInTheDocument()
  })

  it('imports a workbook: previews new, duplicate and invalid rows, then adds only the new ones', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC', buyDate: '2024-01-15', buyPrice: '100', quantity: '1' })
    const wb = XLSX.utils.book_new()
    const header = ['Coin', 'Symbol', 'CoinGecko ID', 'Buy Date', 'Buy Price (USD)', 'Original Quantity', 'Purchase Fees (USD)', 'Note', 'Long-term', 'Lot ID']
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        header,
        ['Bitcoin', 'BTC', 'bitcoin', '2024-01-15', 100, 1, 0, '', 'No', 'L1'], // already in the portfolio
        ['Ethereum', 'ETH', 'ethereum', '2024-02-01', 2000, 2, 5, 'from exchange', 'Yes', 'L2'],
        ['Broken', 'BRK', 'broken', '2024-02-01', 0, 1, 0, '', 'No', 'L3'], // price must be > 0
      ]),
      'Investments',
    )
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['CoinGecko ID', 'Buy Date', 'Sale Date', 'Quantity Sold', 'Sale Price (USD)', 'Sale Fee (USD)', 'Lot ID'],
        ['ethereum', '2024-02-01', '2024-03-01', 0.5, 2500, 0, 'L2'],
      ]),
      'Sales History',
    )
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const file = new File([bytes], 'portfolio.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

    const { user } = await renderDashboard()
    await waitFor(() => expect(rows()).toHaveLength(1))
    await user.upload(screen.getByTestId('import-file-input'), file)

    const dialog = await screen.findByRole('dialog', { name: 'Import investments' })
    expect(await within(dialog).findByText('1 new investment (with 1 sale) will be added')).toBeInTheDocument()
    expect(within(dialog).getByText('1 investment already in your portfolio will be skipped')).toBeInTheDocument()
    expect(within(dialog).getByText("1 row can't be imported")).toBeInTheDocument()
    expect(within(dialog).getByText(/Investments row 4: Buy price must be greater than zero/)).toBeInTheDocument()
    expect(investmentsServiceMock.importInvestments).not.toHaveBeenCalled() // nothing saved before confirming

    await user.click(within(dialog).getByRole('button', { name: 'Import 1 investment' }))
    expect(await screen.findByText('Imported 1 investment; 2 skipped.')).toBeInTheDocument()
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(screen.queryByRole('dialog', { name: 'Import investments' })).not.toBeInTheDocument()

    // Only purchase data is sent; ownership is left to the database (auth.uid()).
    const sent = vi.mocked(investmentsServiceMock.importInvestments).mock.calls[0]![0]
    expect(sent).toEqual([
      {
        coinId: 'ethereum',
        coinName: 'Ethereum',
        symbol: 'ETH',
        buyDate: '2024-02-01',
        buyPrice: '2000',
        quantity: '2',
        buyFee: '5',
        longTerm: true,
        exchange: null, // the workbook has no Exchange column
        note: 'from exchange',
        sales: [{ soldDate: '2024-03-01', quantity: '0.5', price: '2500', fee: '0', note: null }],
      },
    ])
  })

  it('lists new investments first, reorders by dragging the grip, and keeps sold ones by sale date', async () => {
    seedInvestment({ coinId: 'bitcoin', coinName: 'Bitcoin', symbol: 'BTC', buyDate: '2024-03-01' })
    seedInvestment({ coinId: 'ethereum', coinName: 'Ethereum', symbol: 'ETH', buyDate: '2024-01-01' })
    seedInvestment({ coinId: 'cardano', coinName: 'Cardano', symbol: 'ADA', buyDate: '2024-02-01' })
    seedInvestment({
      coinId: 'solana', coinName: 'Solana', symbol: 'SOL', quantity: '1', buyDate: '2024-01-01',
      sales: [{ id: 's1', investmentId: 'x', soldDate: '2024-04-01', quantity: '1', price: '200', fee: '0', note: null, createdAt: '' }],
    })
    // jsdom has no layout: give each row a 40px-high box in document order so dragging has positions to work with.
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const row = this.closest('[data-testid="investment-row"]')
      const top = row ? rows().indexOf(row as HTMLElement) * 40 : 0
      return { top, bottom: top + 40, left: 0, right: 800, width: 800, height: 40, x: 0, y: top, toJSON: () => ({}) } as DOMRect
    })
    try {
      const order = () => rows().map((r) => within(r).getByText(/^(BTC|ETH|ADA|SOL)$/).textContent)
      const { user } = await renderDashboard()
      await waitFor(() => expect(rows()).toHaveLength(4))
      // Newest added on top, regardless of buy date; the sold lot comes last and can't be dragged.
      expect(order()).toEqual(['ADA', 'ETH', 'BTC', 'SOL'])
      expect(screen.getByRole('button', { name: /^Drag to reorder SOL/ })).toBeDisabled()

      // Keyboard drag: Space picks up, ↓ ↓ moves two places, Space drops.
      screen.getByRole('button', { name: /^Drag to reorder ADA/ }).focus()
      await user.keyboard(' ')
      await user.keyboard('{ArrowDown}')
      await user.keyboard('{ArrowDown}')
      await user.keyboard(' ')
      await waitFor(() => expect(order()).toEqual(['ETH', 'BTC', 'ADA', 'SOL']))
      expect(investmentsServiceMock.reorderOpenInvestments).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // dragging didn't open the row

      // A column sort is temporary and pauses dragging; clearing it restores the saved order.
      await user.click(screen.getByRole('button', { name: 'Sort by coin' })) // by ticker
      await waitFor(() => expect(order()).toEqual(['ADA', 'BTC', 'ETH', 'SOL']))
      expect(screen.getByRole('button', { name: /^Drag to reorder BTC/ })).toBeDisabled()
      await user.click(screen.getByRole('button', { name: 'Back to saved order' }))
      expect(order()).toEqual(['ETH', 'BTC', 'ADA', 'SOL'])
      expect(screen.getByRole('button', { name: /^Drag to reorder BTC/ })).toBeEnabled()
    } finally {
      rect.mockRestore()
    }
  })

  it('explains why a file cannot be imported', async () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Name', 'Amount'], ['x', 1]]), 'Sheet1')
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const { user } = await renderDashboard()
    await user.upload(screen.getByTestId('import-file-input'), new File([bytes], 'other.xlsx'))
    const dialog = await screen.findByRole('dialog', { name: 'Import investments' })
    expect(await within(dialog).findByText(/doesn't look like an export from this app/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Nothing to import' })).toBeDisabled()
  })

  it('autosaves the portfolio note with optimistic concurrency', async () => {
    const { user } = await renderDashboard('/notes')
    const textarea = await screen.findByLabelText('Portfolio note')
    await user.type(textarea, 'Buy the dip')
    await waitFor(() => expect(notesServiceMock.savePortfolioNote).toHaveBeenCalledWith('Buy the dip', 1), { timeout: 4000 })
    await waitFor(() => expect(screen.getByTestId('note-status')).toHaveTextContent(/Saved/))
    expect(backend.note).toMatchObject({ note: 'Buy the dip', version: 2 })
  })

  it('detects a conflicting edit from another device', async () => {
    const { user } = await renderDashboard('/notes')
    const textarea = await screen.findByLabelText('Portfolio note')
    await waitFor(() => expect(screen.getByTestId('note-status')).toHaveTextContent(/Saved/))
    // Another device saves first.
    backend.note = { note: 'from phone', version: 5, updatedAt: new Date().toISOString() }
    await user.type(textarea, 'from laptop')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/updated on another device/)).toBeInTheDocument()
    expect(backend.note.note).toBe('from phone')

    await user.click(screen.getByRole('button', { name: 'Keep mine (overwrite)' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(backend.note).toMatchObject({ note: 'from laptop', version: 6 }))
  })
})
