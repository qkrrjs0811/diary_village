import { describe, expect, it } from 'vitest'
import { festivalOn } from './festival'

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
