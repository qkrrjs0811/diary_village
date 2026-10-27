import { describe, expect, it } from 'vitest'
import { DRIFT_OF, driftBits, seasonOf, type Season } from './season'
import { skyBits } from './weather'
import type { DayPart } from './weather'

const parts: DayPart[] = ['day', 'evening', 'night']

describe('계절', () => {
  it('3~5월 봄, 6~8월 여름, 9~11월 가을, 12~2월 겨울이다(달·날짜 모두 받는다)', () => {
    const want: Season[] = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter']
    want.forEach((s, i) => {
      const m = String(i + 1).padStart(2, '0')
      expect(seasonOf(`2026-${m}`)).toBe(s)
      expect(seasonOf(`2026-${m}-15`)).toBe(s)
    })
  })
})

describe('계절 흩날림', () => {
  it('봄 꽃잎, 가을 낙엽, 겨울 눈은 하루 내내, 여름 반딧불은 저녁·밤에만 흩날린다', () => {
    expect(DRIFT_OF).toEqual({ spring: 'petal', summer: 'firefly', autumn: 'leaf', winter: 'snow' })
    for (const part of parts) {
      expect(new Set(driftBits('2026-04-10', part).map((b) => b.kind))).toEqual(new Set(['petal']))
      expect(new Set(driftBits('2026-10-28', part).map((b) => b.kind))).toEqual(new Set(['leaf']))
      expect(new Set(driftBits('2026-01-05', part).map((b) => b.kind))).toEqual(new Set(['snow']))
    }
    expect(driftBits('2026-07-20', 'day')).toEqual([])
    expect(new Set(driftBits('2026-07-20', 'night').map((b) => b.kind))).toEqual(new Set(['firefly']))
    expect(driftBits('2026-07-20', 'evening').length).toBeGreaterThan(0)
  })

  it('옅게 얹는다: 8~14개, 크기는 작고 자리는 화면 안이다', () => {
    for (let d = 0; d < 400; d += 7) {
      const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10)
      const bits = driftBits(date, 'night')
      expect(bits.length).toBeGreaterThanOrEqual(8)
      expect(bits.length).toBeLessThanOrEqual(14)
      for (const b of bits) {
        expect(b.x).toBeGreaterThanOrEqual(0)
        expect(b.x).toBeLessThanOrEqual(100)
        expect(b.y).toBeGreaterThanOrEqual(0)
        expect(b.y).toBeLessThanOrEqual(100)
        expect(b.size).toBeGreaterThanOrEqual(4)
        expect(b.size).toBeLessThanOrEqual(14)
        expect(b.delay).toBeGreaterThanOrEqual(0)
        expect(b.delay).toBeLessThanOrEqual(1)
      }
    }
  })

  it('같은 날은 늘 같고, 날이 바뀌면 자리가 조금 달라진다', () => {
    expect(driftBits('2026-10-28', 'day')).toEqual(driftBits('2026-10-28', 'day'))
    expect(driftBits('2026-10-29', 'day')).not.toEqual(driftBits('2026-10-28', 'day'))
  })

  it('비 오는 날은 빗방울과 어수선하지 않게 반만 흩날린다', () => {
    const plain = driftBits('2026-10-28', 'day')
    const rainy = driftBits('2026-10-28', 'day', 'rain')
    expect(rainy.length).toBe(Math.ceil(plain.length / 2))
    expect(rainy.every((b) => plain.some((p) => p.x === b.x && p.y === b.y))).toBe(true)
    // 다른 날씨는 그대로
    expect(driftBits('2026-10-28', 'day', 'sunny')).toEqual(plain)
    expect(driftBits('2026-10-28', 'day', 'starry')).toEqual(plain)
  })

  it('기분·쓴 날 수와 무관하다(날짜와 때만 받는다), 날씨 하늘(skyBits)은 그대로다', () => {
    expect(driftBits.length).toBeLessThanOrEqual(3)
    expect(skyBits('rain').some((b) => (b.kind as string) === 'leaf')).toBe(false)
  })
})
