import { describe, expect, it } from 'vitest'
import { dateLabel, fullDateLabel } from './format'

describe('날짜 글자', () => {
  it('월·일·요일', () => {
    expect(dateLabel('2026-10-27')).toBe('10월 27일 화요일')
    expect(fullDateLabel('2026-01-04')).toBe('2026년 1월 4일 일요일')
  })
})
