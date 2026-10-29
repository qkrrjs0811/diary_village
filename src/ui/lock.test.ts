import { describe, expect, it } from 'vitest'
import { leftLabel } from './lock'

describe('leftLabel', () => {
  it('남은 시간을 시간·분으로, 1분 아래는 1분으로 보인다', () => {
    expect(leftLabel(24 * 3600_000)).toBe('24시간')
    expect(leftLabel(22 * 3600_000 + 5 * 60_000)).toBe('22시간 5분')
    expect(leftLabel(59 * 60_000)).toBe('59분')
    expect(leftLabel(10_000)).toBe('1분')
    expect(leftLabel(0)).toBe('1분')
  })
})
