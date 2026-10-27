import { describe, expect, it } from 'vitest'
import { monthRecap, recapOf } from './recap'
import type { Entry, MoodId } from './types'

const e = (date: string, text = '그냥 하루', mood: MoodId = 'calm'): Entry => ({ date, text, mood, writtenAt: 0 })

describe('한 달 돌아보기', () => {
  it('그달 쓴 날 수, 기분 띠, 가장 많이 나온 건물을 센다', () => {
    const list = [
      e('2026-09-01', '커피 한 잔', 'great'),
      e('2026-09-02', '라떼', 'calm'),
      e('2026-09-03', '책 읽기', 'calm'),
      e('2026-09-04', '그냥', 'blue'),
      e('2026-10-01', '커피', 'calm'),
    ]
    const r = monthRecap(list, '2026-09')
    expect(r.month).toBe('2026-09')
    expect(r.label).toBe('9월')
    expect(r.written).toBe(4)
    expect(r.moods).toEqual([
      { mood: 'calm', count: 2 },
      { mood: 'great', count: 1 },
      { mood: 'blue', count: 1 },
    ])
    expect(r.top).toEqual({ id: 'cafe', count: 2 })
  })

  it('건물 수가 같으면 그달 먼저 나온 건물, 건물이 없으면 null', () => {
    expect(monthRecap([e('2026-09-05', '책'), e('2026-09-01', '빵')], '2026-09').top).toEqual({ id: 'bakery', count: 1 })
    expect(monthRecap([e('2026-09-01')], '2026-09').top).toBeNull()
    expect(monthRecap([], '2026-09').written).toBe(0)
  })

  it('새 달 첫 7일 동안만 지난달을 돌아보고, 지난달에 쓴 날이 없으면 보이지 않는다', () => {
    const list = [e('2026-09-30', '커피')]
    expect(recapOf(list, '2026-10-01')!.month).toBe('2026-09')
    expect(recapOf(list, '2026-10-07')!.month).toBe('2026-09')
    expect(recapOf(list, '2026-10-08')).toBeNull()
    expect(recapOf(list, '2026-11-03')).toBeNull()
    expect(recapOf([e('2026-12-24')], '2027-01-02')!.label).toBe('12월')
  })
})
