/**
 * Theme preference: 'light' | 'dark' | 'system', persisted in localStorage.
 * The resolved theme is written to <html data-theme> (tokens in src/styles/theme.css).
 * index.html runs an equivalent inline snippet before first paint to prevent a flash.
 * Theme is per-device and independent of the signed-in account, so it survives
 * logout/login and page refresh.
 */
import { useSyncExternalStore } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'cit-theme'
const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#f8fafc', dark: '#0b1120' }

const listeners = new Set<() => void>()
const darkQuery = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null)

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
  } catch {
    return 'system'
  }
}

let preference: ThemePreference = typeof window === 'undefined' ? 'system' : readPreference()

export function resolveTheme(pref: ThemePreference, systemDark = darkQuery()?.matches ?? false): ResolvedTheme {
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
}

export function applyTheme(pref: ThemePreference = preference) {
  const resolved = resolveTheme(pref)
  const root = document.documentElement
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolved])
}

function emit() {
  applyTheme()
  listeners.forEach((l) => l())
}

export function setThemePreference(next: ThemePreference) {
  preference = next
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // storage unavailable (private mode) — the choice still applies for this session
  }
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const mq = darkQuery()
  const onSystemChange = () => preference === 'system' && emit()
  // Keep tabs in sync when the preference changes in another tab.
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) {
      preference = readPreference()
      emit()
    }
  }
  mq?.addEventListener('change', onSystemChange)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    mq?.removeEventListener('change', onSystemChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => preference, () => 'system')
}
