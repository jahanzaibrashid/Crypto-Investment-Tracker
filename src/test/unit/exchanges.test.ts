import { describe, expect, it } from 'vitest'
import { exchangeColor, exchangeOptions, normalizeExchange, usedExchanges } from '@/features/investments/exchanges'
import { EXCHANGE_PRESETS } from '@/lib/constants'

const inv = (exchange: string | null) => ({ exchange })

describe('usedExchanges', () => {
  it('lists each used name once (ignoring case), sorted', () => {
    expect(usedExchanges([inv('MyWallet'), inv(null), inv('Binance'), inv('mywallet'), inv('  ')])).toEqual(['Binance', 'MyWallet'])
  })
})

describe('exchangeOptions', () => {
  it('offers the presets plus names the user has added, without duplicates', () => {
    const options = exchangeOptions([inv('binance'), inv('Cold Storage')])
    expect(options).toContain('Cold Storage')
    expect(options.filter((o) => o.toLowerCase() === 'binance')).toEqual(['Binance']) // preset spelling wins
    expect(options).toHaveLength(EXCHANGE_PRESETS.length + 1)
  })
  it('keeps the preset order, then lists added names A–Z', () => {
    const options = exchangeOptions([inv('Zeta Wallet'), inv('Alpha Wallet')])
    expect(options).toEqual([...EXCHANGE_PRESETS, 'Alpha Wallet', 'Zeta Wallet'])
  })
})

describe('normalizeExchange', () => {
  const known = ['Binance', 'MetaMask']
  it('reuses the known spelling when the name matches ignoring case', () => {
    expect(normalizeExchange('  metamask ', known)).toBe('MetaMask')
  })
  it('keeps new names, tidied up', () => {
    expect(normalizeExchange('  My   Ledger  ', known)).toBe('My Ledger')
  })
  it('turns an empty value into null and caps the length', () => {
    expect(normalizeExchange('   ', known)).toBeNull()
    expect(normalizeExchange(null, known)).toBeNull()
    expect(normalizeExchange('x'.repeat(60), known)).toHaveLength(40)
  })
})

describe('exchangeColor', () => {
  it('gives each main place its own color, matching its Profit status color', () => {
    const tones = ['Binance', 'MetaMask ETH', 'MetaMask BSC', 'MetaMask Matic'].map((n) => exchangeColor(n).badge)
    expect(tones).toEqual(['info', 'warning', 'teal', 'violet'])
    expect(new Set(tones).size).toBe(tones.length)
  })

  it('ignores case and spaces, and shows grey when not set', () => {
    expect(exchangeColor('  metamask eth ')).toEqual(exchangeColor('MetaMask ETH'))
    expect(exchangeColor(null).badge).toBe('neutral')
    expect(exchangeColor('').badge).toBe('neutral')
  })

  it('gives any other name a stable color that is never green, red or grey', () => {
    for (const name of [...EXCHANGE_PRESETS, 'My Wallet', 'Ledger']) {
      expect(['positive', 'negative', 'neutral']).not.toContain(exchangeColor(name).badge)
      expect(exchangeColor(name)).toEqual(exchangeColor(name.toUpperCase()))
    }
  })
})
