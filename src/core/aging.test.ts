import { describe, expect, it } from 'vitest'
import { AGING_STEPS, agingLine, agingOf, agingTurnedToday, houseAge } from './aging'
import { houseLook } from './village'
import type { Entry } from './types'

const e = (date: string, extra: Partial<Entry> = {}): Entry => ({ date, text: `${date}의 한 줄`, mood: 'calm', writtenAt: 0, ...extra })

describe('집 나이', () => {
  it('지은 날과 오늘 사이 날 수를 센다', () => {
    expect(houseAge('2026-10-28', '2026-10-28')).toBe(0)
    expect(houseAge('2026-10-27', '2026-10-28')).toBe(1)
    expect(houseAge('2025-10-28', '2026-10-28')).toBe(365)
    expect(houseAge('2024-02-28', '2024-03-01')).toBe(2)
  })

  it('미래 날짜나 이상한 값은 0이다', () => {
    expect(houseAge('2026-10-29', '2026-10-28')).toBe(0)
    expect(houseAge('오늘', '2026-10-28')).toBe(0)
  })

  it('나이는 늘기만 한다', () => {
    let prev = -1
    for (let i = 0; i < 400; i++) {
      const today = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
      const age = houseAge('2026-01-01', today)
      expect(age).toBeGreaterThan(prev)
      prev = age
    }
  })
})

describe('세월 단계', () => {
  it('30일 덩굴, 100일 담쟁이, 365일 둥지', () => {
    expect(AGING_STEPS.map((s) => [s.stage, s.days])).toEqual([
      ['vine', 30],
      ['ivy', 100],
      ['nest', 365],
    ])
    const today = '2026-10-28'
    expect(agingOf('2026-10-28', today)).toBe('none')
    expect(agingOf('2026-09-29', today)).toBe('none') // 29일
    expect(agingOf('2026-09-28', today)).toBe('vine') // 30일
    expect(agingOf('2026-07-21', today)).toBe('vine') // 99일
    expect(agingOf('2026-07-20', today)).toBe('ivy') // 100일
    expect(agingOf('2025-10-29', today)).toBe('ivy') // 364일
    expect(agingOf('2025-10-28', today)).toBe('nest') // 365일
    expect(agingOf('2020-01-01', today)).toBe('nest')
  })

  it('단계는 한 번 오르면 내려가지 않는다', () => {
    const order = ['none', 'vine', 'ivy', 'nest']
    let prev = 0
    for (let i = 0; i < 800; i++) {
      const today = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
      const rank = order.indexOf(agingOf('2026-01-01', today))
      expect(rank).toBeGreaterThanOrEqual(prev)
      prev = rank
    }
    expect(prev).toBe(3)
  })

  it('단계를 넘는 날에만 그 단계를 알려 준다', () => {
    expect(agingTurnedToday('2026-09-28', '2026-10-28')).toBe('vine')
    expect(agingTurnedToday('2026-07-20', '2026-10-28')).toBe('ivy')
    expect(agingTurnedToday('2025-10-28', '2026-10-28')).toBe('nest')
    expect(agingTurnedToday('2026-09-27', '2026-10-28')).toBeNull() // 31일
    expect(agingTurnedToday('2026-10-28', '2026-10-28')).toBeNull()
    expect(agingTurnedToday('2026-10-30', '2026-10-28')).toBeNull()
  })

  it('세월은 날짜로만 정해진다 — 기분·글 길이·고친 시각·소중한 날과 무관하다', () => {
    const today = '2026-10-28'
    const date = '2026-07-20'
    const variants = [
      e(date),
      e(date, { mood: 'blue', text: '.' }),
      e(date, { mood: 'great', text: '아주 긴 글'.repeat(100), editedAt: 99, treasured: true }),
    ]
    for (const v of variants) {
      expect(agingOf(v.date, today)).toBe('ivy')
      expect(houseAge(v.date, today)).toBe(100)
    }
  })

  it('세월은 집 모양(houseLook)을 바꾸지 않는다', () => {
    const entry = e('2025-03-14')
    const before = JSON.stringify(houseLook(entry))
    agingOf(entry.date, '2026-10-28')
    agingTurnedToday(entry.date, '2026-10-28')
    expect(JSON.stringify(houseLook(entry))).toBe(before)
    expect(Object.keys(houseLook(entry))).not.toContain('aging')
  })
})

describe('집 나이 한 줄', () => {
  it('30일 전에는 말하지 않는다(새 집이 덜해 보이지 않게)', () => {
    expect(agingLine('2026-10-28', '2026-10-28')).toBeNull()
    expect(agingLine('2026-09-29', '2026-10-28')).toBeNull()
    expect(agingLine('2026-11-01', '2026-10-28')).toBeNull()
    expect(agingLine('엉뚱한 값', '2026-10-28')).toBeNull()
  })
  it('30일부터 집 나이를 다정하게 말한다', () => {
    expect(agingLine('2026-09-27', '2026-10-28')).toBe('🌿 지은 지 31일 된 집이에요')
    expect(agingLine('2026-07-19', '2026-10-28')).toBe('🍃 지은 지 101일 된 집이에요')
    expect(agingLine('2025-10-27', '2026-10-28')).toBe('🪺 지은 지 366일 된 집이에요')
  })
  it('단계를 넘는 날에는 오늘 생긴 세월을 알려 준다', () => {
    expect(agingLine('2026-09-28', '2026-10-28')).toBe('🌿 지은 지 30일, 오늘 벽에 덩굴이 돋았어요')
    expect(agingLine('2026-07-20', '2026-10-28')).toBe('🍃 지은 지 100일, 오늘 담쟁이가 올랐어요')
    expect(agingLine('2025-10-28', '2026-10-28')).toBe('🪺 지은 지 1년, 오늘 처마에 새 둥지가 생겼어요')
  })
})
