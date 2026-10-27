import { describe, expect, it } from 'vitest'
import { monthRecap, recapOf, yearRecap, yearRecapOf } from './recap'
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

describe('한 해 돌아보기', () => {
  const list = [
    e('2025-12-31', '커피', 'great'),
    e('2026-01-03', '책 한 권', 'calm'),
    e('2026-01-04', '커피 한 잔', 'blue'),
    e('2026-01-05', '그냥', 'blue'),
    e('2026-03-10', '빵 굽기', 'great'),
    e('2026-03-11', '빵', 'tired'),
    e('2026-12-31', '라떼', 'meh'),
    e('2027-01-01', '고양이', 'calm'),
  ]

  it('그해 쓴 날 수, 열두 달마다 쓴 날 수와 가장 많은 기분, 첫 한 줄 날짜', () => {
    const r = yearRecap(list, 2026)
    expect(r.year).toBe(2026)
    expect(r.label).toBe('2026년')
    expect(r.written).toBe(6)
    expect(r.firstDate).toBe('2026-01-03')
    expect(r.months).toHaveLength(12)
    expect(r.months.map((m) => m.month)).toEqual(Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`))
    expect(r.months[0]).toEqual({ month: '2026-01', label: '1월', written: 3, mood: 'blue' })
    expect(r.months[1]).toEqual({ month: '2026-02', label: '2월', written: 0, mood: null })
    expect(r.months[11]).toEqual({ month: '2026-12', label: '12월', written: 1, mood: 'meh' })
  })

  it('기분 수가 같으면 기분 목록 순서로 정한다(좋고 나쁨 없이 늘 같은 규칙)', () => {
    expect(yearRecap(list, 2026).months[2].mood).toBe('great')
    expect(yearRecap([e('2026-05-01', '', 'tired'), e('2026-05-02', '', 'great')], 2026).months[4].mood).toBe('great')
  })

  it('가장 많이 지은 건물(같으면 그해 먼저 나온 것)과 그해 처음 만난 건물', () => {
    const r = yearRecap(list, 2026)
    // 카페 2(1/4, 12/31), 빵집 2(3/10, 3/11) → 카페가 먼저
    expect(r.top).toEqual({ id: 'cafe', count: 2 })
    // 카페는 2025년에 이미 만났다. 책방·빵집은 2026년에 처음
    expect(r.firstFound).toEqual(['bookstore', 'bakery'])
    expect(yearRecap(list, 2027).firstFound).toEqual(['catHouse'])
    expect(yearRecap([e('2026-01-01')], 2026).top).toBeNull()
    expect(yearRecap([], 2026)).toMatchObject({ written: 0, top: null, firstFound: [], firstDate: null })
  })

  it('글 길이는 아무것도 바꾸지 않는다', () => {
    const short = yearRecap([e('2026-02-01', '커피'), e('2026-02-02', '책')], 2026)
    const long = yearRecap([e('2026-02-01', '커피를 마시며 오래오래 창밖을 보았다'.repeat(5)), e('2026-02-02', '책')], 2026)
    expect(long).toEqual(short)
  })

  it('새해 1~7일에만 지난해를 돌아보고, 지난해에 쓴 날이 없으면 null', () => {
    expect(yearRecapOf(list, '2027-01-01')!.year).toBe(2026)
    expect(yearRecapOf(list, '2027-01-07')!.year).toBe(2026)
    expect(yearRecapOf(list, '2027-01-08')).toBeNull()
    expect(yearRecapOf(list, '2026-12-31')).toBeNull()
    expect(yearRecapOf(list, '2027-02-03')).toBeNull()
    expect(yearRecapOf(list, '2029-01-02')).toBeNull()
  })
})
