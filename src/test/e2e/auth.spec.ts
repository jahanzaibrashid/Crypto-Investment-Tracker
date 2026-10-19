import { expect, test } from '@playwright/test'
import { addUser, createState, installMockApi, login } from './mock-api'

test.describe('authentication', () => {
  test('redirects unauthenticated visitors to the login page', async ({ page }) => {
    await installMockApi(page, createState())
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('shows a friendly error for wrong credentials', async ({ page }) => {
    const state = createState()
    addUser(state, 'alice@example.com', 'correct-pass1')
    await installMockApi(page, state)
    await page.goto('/login')
    await page.getByLabel('Email').fill('alice@example.com')
    await page.getByLabel('Password', { exact: true }).fill('wrong-pass1')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password')
  })

  test('registers, lands on the dashboard, keeps the session on reload and logs out', async ({ page }) => {
    await installMockApi(page, createState())
    await page.goto('/register')
    await page.getByLabel('Email').fill('new@example.com')
    await page.getByLabel('Password', { exact: true }).fill('abcdefg1')
    await page.getByLabel('Confirm password').fill('abcdefg1')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByText('No investments yet')).toBeVisible()
    await page.reload()
    await expect(page.getByText('No investments yet')).toBeVisible()

    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('login works on a phone-sized screen @mobile', async ({ page }) => {
    const state = createState()
    addUser(state, 'alice@example.com', 'correct-pass1')
    await installMockApi(page, state)
    await login(page, 'alice@example.com', 'correct-pass1')
    await expect(page.getByRole('link', { name: 'Add your first investment' })).toBeVisible()
    // Phones: pages and portfolio actions are in the drawer behind the menu button.
    await page.getByRole('button', { name: 'Open menu' }).click()
    const menu = page.getByRole('dialog', { name: 'Menu' })
    await expect(menu.getByRole('button', { name: 'Export to Excel' })).toBeVisible()
    await menu.getByRole('link', { name: 'Investments' }).click()
    await expect(menu).toBeHidden()
    await expect(page.getByRole('heading', { level: 2, name: 'Investments' })).toBeVisible()
  })
})
