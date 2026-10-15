import { describe, expect, it } from 'vitest'
import { pageWindow } from '@/lib/pagination'

describe('pageWindow', () => {
  it('shows every page when there are few', () => {
    expect(pageWindow(0, 1)).toEqual([0])
    expect(pageWindow(1, 3)).toEqual([0, 1, 2])
  })
  it('keeps first/last, a window around the current page, and gaps', () => {
    expect(pageWindow(5, 12)).toEqual([0, null, 4, 5, 6, null, 11])
    expect(pageWindow(0, 12)).toEqual([0, 1, null, 11])
    expect(pageWindow(11, 12)).toEqual([0, null, 10, 11])
  })
})
