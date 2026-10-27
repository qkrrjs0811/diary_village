import { describe, expect, it } from 'vitest'
import { memoryOf, memoryDates } from './memory'
import type { Entry } from './types'

const e = (date: string, text = `${date}의 한 줄`): Entry => ({ date, text, mood: 'calm', writtenAt: 0 })

describe('N일 전 오늘', () => {
  it('한 달 전·100일 전·작년 오늘의 날짜를 센다', () => {
    expect(memoryDates('2026-10-28')).toEqual([
      { kind: 'year', label: '작년 오늘', date: '2025-10-28' },
      { kind: 'hundred', label: '100일 전 오늘', date: '2026-07-20' },
      { kind: 'month', label: '한 달 전 오늘', date: '2026-09-28' },
    ])
  })

  it('1월의 한 달 전은 지난해 12월이다', () => {
    expect(memoryDates('2027-01-15').find((m) => m.kind === 'month')!.date).toBe('2026-12-15')
  })

  it('지난달·작년에 없는 날(31일, 2월 29일)은 건너뛴다', () => {
    expect(memoryDates('2026-10-31').map((m) => m.kind)).toEqual(['year', 'hundred'])
    expect(memoryDates('2028-02-29').map((m) => m.kind)).toEqual(['hundred', 'month'])
  })

  it('그날 쓴 글이 있을 때만 보여 주고, 드문 것(작년 → 100일 → 한 달)을 먼저 고른다', () => {
    const today = '2026-10-28'
    expect(memoryOf([e('2026-10-27')], today)).toBeNull()
    expect(memoryOf([e('2026-09-28')], today)).toEqual({ kind: 'month', label: '한 달 전 오늘', entry: e('2026-09-28') })
    expect(memoryOf([e('2026-09-28'), e('2026-07-20')], today)!.kind).toBe('hundred')
    expect(memoryOf([e('2026-09-28'), e('2026-07-20'), e('2025-10-28')], today)!.kind).toBe('year')
  })

  it('빈 기록이면 없다', () => {
    expect(memoryOf([], '2026-10-28')).toBeNull()
  })
})
