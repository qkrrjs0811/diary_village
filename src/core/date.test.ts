import { describe, expect, it } from 'vitest'
import { addDays, dayKey, isDate, monthKey, weekday } from './date'

describe('날짜', () => {
  it('한국 시간 자정을 기준으로 날짜를 나눈다', () => {
    expect(dayKey(Date.parse('2026-10-27T23:59:00+09:00'))).toBe('2026-10-27')
    expect(dayKey(Date.parse('2026-10-28T00:01:00+09:00'))).toBe('2026-10-28')
  })

  it('달과 해를 넘겨 날짜를 더하고 뺀다', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('요일과 달', () => {
    expect(weekday('2026-10-27')).toBe(2) // 화요일
    expect(monthKey('2026-10-27')).toBe('2026-10')
  })

  it('없는 날짜는 날짜가 아니다', () => {
    expect(isDate('2026-10-27')).toBe(true)
    expect(isDate('2026-02-30')).toBe(false)
    expect(isDate('2026-1-5')).toBe(false)
    expect(isDate(20261027)).toBe(false)
  })
})
