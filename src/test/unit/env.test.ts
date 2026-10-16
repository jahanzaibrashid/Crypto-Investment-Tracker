import { describe, expect, it } from 'vitest'
import { parseSiteUrl } from '@/lib/env'

describe('parseSiteUrl', () => {
  it('keeps only the origin of an http(s) URL', () => {
    expect(parseSiteUrl('https://my-app.vercel.app')).toBe('https://my-app.vercel.app')
    expect(parseSiteUrl(' https://my-app.vercel.app/login/ ')).toBe('https://my-app.vercel.app')
    expect(parseSiteUrl('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('ignores empty, malformed and non-web values', () => {
    expect(parseSiteUrl(undefined)).toBeUndefined()
    expect(parseSiteUrl('  ')).toBeUndefined()
    expect(parseSiteUrl('my-app.vercel.app')).toBeUndefined()
    expect(parseSiteUrl('javascript:alert(1)')).toBeUndefined()
  })
})
