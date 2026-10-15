import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { THEME_STORAGE_KEY, resolveTheme, setThemePreference } from '@/lib/theme'

let systemDark = false
const mqListeners = new Set<() => void>()

beforeEach(() => {
  systemDark = false
  localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query.includes('dark') ? systemDark : false
    },
    media: query,
    addEventListener: (_: string, l: () => void) => mqListeners.add(l),
    removeEventListener: (_: string, l: () => void) => mqListeners.delete(l),
  }))
  setThemePreference('system')
})

afterEach(() => {
  vi.unstubAllGlobals()
  mqListeners.clear()
})

const html = () => document.documentElement

describe('theme preference', () => {
  it('resolves system preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('switches theme from the toggle and persists the choice', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    expect(screen.getByRole('radio', { name: 'System theme' })).toHaveAttribute('aria-checked', 'true')
    expect(html().dataset.theme).toBe('light')

    await user.click(screen.getByRole('radio', { name: 'Dark theme' }))
    expect(html().dataset.theme).toBe('dark')
    expect(html().style.colorScheme).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(screen.getByRole('radio', { name: 'Dark theme' })).toHaveAttribute('aria-checked', 'true')

    await user.click(screen.getByRole('radio', { name: 'Light theme' }))
    expect(html().dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('follows the operating system while in System mode', async () => {
    render(<ThemeToggle />)
    systemDark = true
    mqListeners.forEach((l) => l())
    expect(html().dataset.theme).toBe('dark')

    // An explicit choice is not overridden by later OS changes.
    setThemePreference('light')
    systemDark = true
    mqListeners.forEach((l) => l())
    expect(html().dataset.theme).toBe('light')
  })
})
