import * as fs from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'
import { addUser, createState, installMockApi, login, type MockState } from './mock-api'

XLSX.set_fs(fs)

async function setup(page: Page): Promise<MockState> {
  const state = createState()
  addUser(state, 'alice@example.com', 'correct-pass1')
  await installMockApi(page, state)
  await login(page, 'alice@example.com', 'correct-pass1')
  return state
}

/** Navigate with the main navigation (sidebar on desktop, pills on mobile). */
async function goTo(page: Page, name: 'Overview' | 'Holdings' | 'Investments' | 'Notes') {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).locator('visible=true').first().click()
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
}

/** Open a row's "⋯" menu and choose an action. */
async function rowAction(page: Page, coin: string, action: 'Edit' | 'Edit note' | 'Sell' | 'Delete') {
  await page.getByRole('button', { name: new RegExp(`^Actions: ${coin}`) }).first().click()
  await page.getByRole('menuitem', { name: new RegExp(`^${action}: ${coin}`) }).click()
}

async function addInvestment(page: Page, symbol: string, price: string, quantity: string) {
  if (!page.url().endsWith('/investments')) await goTo(page, 'Investments')
  await page.getByRole('button', { name: /Add (your first )?investment/i }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add investment' })
  await dialog.getByRole('button', { name: symbol, exact: true }).click()
  await dialog.getByLabel('Buy price per coin').fill(price)
  await dialog.getByLabel('Quantity purchased').fill(quantity)
  await dialog.getByRole('button', { name: 'Add investment' }).click()
  await expect(dialog).toBeHidden()
}

test.describe('portfolio', () => {
  test('add, edit, sell, delete and export investments', async ({ page }) => {
    await setup(page)

    // Two purchases of the same coin + one other coin
    await addInvestment(page, 'BTC', '40000', '0.5') // cost 20,000 → value 25,000
    await addInvestment(page, 'BTC', '45000', '0.2') // cost 9,000 → value 10,000
    await addInvestment(page, 'ETH', '2000', '2') // cost 4,000 → value 6,000
    await expect(page.getByTestId('investment-row')).toHaveCount(3)
    // Column order: #, Coin, Bought, Invested, …, Profit / Loss
    await expect(page.getByRole('columnheader').nth(2)).toHaveText('Bought')

    await goTo(page, 'Overview')
    await expect(page.getByTestId('card-current-value')).toContainText('$41,000.00')
    await expect(page.getByTestId('card-total-invested')).toContainText('$33,000.00')

    // Holdings page combines the BTC lots
    await goTo(page, 'Holdings')
    await expect(page.getByRole('row', { name: /Bitcoin/ })).toContainText('0.7')

    await goTo(page, 'Investments')

    // Edit the ETH note
    await rowAction(page, 'Ethereum', 'Edit note')
    await page.getByRole('dialog', { name: 'Investment note' }).getByLabel('Note').fill('Long-term hold')
    await page.getByRole('button', { name: 'Save note' }).click()
    await expect(page.getByText('Long-term hold')).toBeVisible()

    // Sell all ETH → realized P/L, no double counting
    await rowAction(page, 'Ethereum', 'Sell')
    const sell = page.getByRole('dialog', { name: /Sell Ethereum/ })
    await sell.getByLabel('Sale price per coin').fill('2500')
    await sell.getByRole('button', { name: 'Mark as sold' }).click()
    await expect(sell).toBeHidden()
    await goTo(page, 'Overview')
    await expect(page.getByTestId('card-realized')).toContainText('+$1,000.00')
    await expect(page.getByTestId('card-current-value')).toContainText('$35,000.00')
    await goTo(page, 'Investments')

    // Filter by status
    await page.getByLabel('Status').selectOption('SOLD_PROFIT')
    await expect(page.getByTestId('investment-row')).toHaveCount(1)
    await page.getByRole('button', { name: 'Clear filters' }).first().click()
    await expect(page.getByTestId('investment-row')).toHaveCount(3)

    // Export
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export to Excel' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^crypto-portfolio-\d{4}-\d{2}-\d{2}\.xlsx$/)
    const wb = XLSX.readFile((await download.path())!)
    expect(wb.SheetNames).toEqual(['Investments', 'Portfolio Summary', 'Sales History'])
    expect(XLSX.utils.sheet_to_json(wb.Sheets.Investments!)).toHaveLength(3)
    await expect(page.getByText(/Exported 3 investments/)).toBeVisible()

    // Delete with confirmation
    await rowAction(page, 'Ethereum', 'Delete')
    await page.getByRole('dialog', { name: 'Delete this investment?' }).getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByTestId('investment-row')).toHaveCount(2)
  })

  test('portfolio note persists across reloads', async ({ page }) => {
    await setup(page)
    await goTo(page, 'Notes')
    await page.getByLabel('Portfolio note').fill('Rebalance in Q3')
    await expect(page.getByTestId('note-status')).toContainText('Saved', { timeout: 10_000 })
    await page.reload()
    await expect(page.getByLabel('Portfolio note')).toHaveValue('Rebalance in Q3')
  })

  test('marks prices unavailable instead of showing zero when CoinGecko fails', async ({ page }) => {
    const state = await setup(page)
    state.priceStatus = 429
    await addInvestment(page, 'SOL', '100', '3')
    await expect(page.getByText(/rate limit/i)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('investment-row').first()).toContainText('Unavailable')
  })
})
