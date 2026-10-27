import { describe, expect, it } from 'vitest'
import { calendarMonth, calendarRange, shiftMonth } from './calendar'
import type { Entry } from './types'

const e = (date: string, mood: Entry['mood'] = 'calm'): Entry => ({ date, text: `${date}의 한 줄`, mood, writtenAt: 0 })

describe('달력', () => {
  it('달을 앞뒤로 옮긴다(해를 넘긴다)', () => {
    expect(shiftMonth('2026-10', -1)).toBe('2026-09')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('넘겨 볼 수 있는 달은 처음 집을 지은 달부터 이번 달까지다(지운 날 포함, 빈 마을은 이번 달만)', () => {
    expect(calendarRange([], [], '2026-10-28')).toEqual({ first: '2026-10', last: '2026-10' })
    expect(calendarRange([e('2026-09-03'), e('2026-07-20')], [], '2026-10-28')).toEqual({ first: '2026-07', last: '2026-10' })
    expect(calendarRange([e('2026-09-03')], ['2026-05-02'], '2026-10-28')).toEqual({ first: '2026-05', last: '2026-10' })
  })

  it('일요일부터 주 단위로 칸을 채우고, 달 앞뒤 빈칸은 null 이다', () => {
    const m = calendarMonth([], [], '2026-10', '2026-10-28')
    expect(m.title).toBe('2026년 10월')
    // 2026-10-01 은 목요일
    expect(m.weeks[0].slice(0, 4)).toEqual([null, null, null, null])
    expect(m.weeks[0][4]!.date).toBe('2026-10-01')
    expect(m.weeks.flat().filter(Boolean)).toHaveLength(31)
    expect(m.weeks.every((w) => w.length === 7)).toBe(true)
    expect(m.weeks).toHaveLength(5)
  })

  it('쓴 날은 기분, 지운 날·오늘·아직 안 온 날을 표시하고 쓴 날 수를 센다', () => {
    const m = calendarMonth([e('2026-10-03', 'great'), e('2026-10-27', 'blue'), e('2026-09-30')], ['2026-10-10'], '2026-10', '2026-10-28')
    const day = (d: number) => m.weeks.flat().find((c) => c?.day === d)!
    expect(day(3)).toMatchObject({ date: '2026-10-03', state: 'written', mood: 'great' })
    expect(day(27)).toMatchObject({ state: 'written', mood: 'blue' })
    expect(day(10)).toMatchObject({ state: 'erased' })
    expect(day(10).mood).toBeUndefined()
    expect(day(5)).toMatchObject({ state: 'empty', today: false })
    expect(day(28)).toMatchObject({ state: 'empty', today: true })
    expect(day(29)).toMatchObject({ state: 'future' })
    expect(m.written).toBe(2)
  })

  it('기분마다 쓴 날을 센다(기분 색 띠에 쓴다). 많이 쓴 기분이 먼저다', () => {
    const m = calendarMonth([e('2026-10-01', 'blue'), e('2026-10-02', 'great'), e('2026-10-03', 'great')], [], '2026-10', '2026-10-28')
    expect(m.moods).toEqual([
      { mood: 'great', count: 2 },
      { mood: 'blue', count: 1 },
    ])
  })
})
