import { describe, expect, it } from 'vitest'
import { festivalCard, festivalLine, festivalOn } from './festival'

const d = (...dates: string[]) => dates.map((date) => ({ date }))

describe('마을 잔치', () => {
  it('날짜로 돌아오는 잔치: 새해, 호박 축제, 성탄(이틀)', () => {
    expect(festivalOn([], '2027-01-01')!.id).toBe('newYear')
    expect(festivalOn([], '2026-10-31')!.id).toBe('pumpkin')
    expect(festivalOn([], '2026-12-24')!.id).toBe('christmas')
    expect(festivalOn([], '2026-12-25')!.id).toBe('christmas')
    expect(festivalOn([], '2026-12-26')).toBeNull()
    expect(festivalOn([], '2026-10-28')).toBeNull()
  })

  it('마을 생일은 처음 집을 지은 날과 같은 달·날, 첫해 당일은 아니다', () => {
    const days = d('2026-03-10', '2025-10-28', '2026-10-27')
    expect(festivalOn(days, '2025-10-28')).toBeNull()
    expect(festivalOn(days, '2026-10-28')).toEqual({ id: 'birthday', name: '마을 생일', icon: '🎂', years: 1 })
    expect(festivalOn(days, '2028-10-28')!.years).toBe(3)
    expect(festivalOn(days, '2026-10-27')).toBeNull()
  })

  it('지운 날도 처음 지은 날로 센다(날짜만 보고, 쓴 날 수·기분은 보지 않는다)', () => {
    // 지운 날은 { date } 만 남는다
    expect(festivalOn(d('2025-05-05'), '2026-05-05')!.id).toBe('birthday')
    expect(festivalOn(d('2025-05-05', '2025-05-06', '2025-05-07'), '2026-05-05')!.years).toBe(1)
  })

  it('2월 29일에 시작한 마을은 평년엔 2월 28일에 생일을 연다', () => {
    const days = d('2028-02-29')
    expect(festivalOn(days, '2029-02-28')!.id).toBe('birthday')
    expect(festivalOn(days, '2029-03-01')).toBeNull()
    expect(festivalOn(days, '2032-02-29')!.years).toBe(4)
    expect(festivalOn(days, '2032-02-28')).toBeNull()
  })

  it('잔치가 겹치면 마을 생일이 먼저다', () => {
    expect(festivalOn(d('2025-12-25'), '2026-12-25')!.id).toBe('birthday')
    expect(festivalOn(d('2025-12-25'), '2026-12-24')!.id).toBe('christmas')
    expect(festivalOn(d('2025-01-01'), '2026-01-01')!.id).toBe('birthday')
  })
})

describe('잔치 카드와 주민 한마디', () => {
  it('잔치 카드: 잔치 그림·이름, 마을 생일은 몇 해째인지 말한다', () => {
    const b = festivalCard(festivalOn(d('2025-10-28'), '2026-10-28')!)
    expect(b.title).toBe('🎂 오늘은 마을 생일이에요')
    expect(b.body).toContain('첫 집을 지은 지 1년')
    expect(b.icons[0]).toBe('🎂')
    expect(b.visit).toBeNull()
    expect(festivalCard(festivalOn(d('2023-10-28'), '2026-10-28')!).body).toContain('3년')
    for (const day of ['2027-01-01', '2026-10-31', '2026-12-25']) {
      const f = festivalOn([], day)!
      const c = festivalCard(f)
      expect(c.title.startsWith(f.icon)).toBe(true)
      expect(c.title).toContain(f.name)
      expect(c.body.length).toBeGreaterThan(0)
      expect(c.next).toContain('광장')
    }
  })

  it('잔치 카드는 쓴 날 수·기분과 상관없이 같은 말이다(쓰라고 재촉하지 않는다)', () => {
    const f = festivalOn([], '2026-12-24')!
    expect(JSON.stringify(festivalCard(f))).not.toMatch(/연속|끊|써야|안 썼/)
    expect(festivalCard(festivalOn([], '2026-12-25')!)).toEqual(festivalCard(f))
  })

  it('주민 잔치 한마디: 잔치마다 다르고, 같은 주민은 늘 같은 말, 짧다', () => {
    const ids = ['kong', 'momo', 'bori', 'dubu']
    const fs = [festivalOn(d('2025-10-28'), '2026-10-28')!, festivalOn([], '2027-01-01')!, festivalOn([], '2026-10-31')!, festivalOn([], '2026-12-24')!]
    for (const f of fs) {
      const lines = new Set(ids.map((id) => festivalLine(f, id)))
      expect(lines.size).toBeGreaterThanOrEqual(2)
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(20)
    }
    expect(festivalLine(fs[0], 'kong')).toBe(festivalLine(fs[0], 'kong'))
    expect(ids.map((id) => festivalLine(fs[0], id)).join(' ')).toMatch(/생일/)
  })
})
