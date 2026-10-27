import { describe, expect, it } from 'vitest'
import { WEATHER_OF, skyBits, weatherOf, type WeatherKind } from './weather'
import type { Entry, MoodId } from './types'

const e = (date: string, mood: MoodId, text = '그냥 하루'): Entry => ({ date, text, mood, writtenAt: 0 })
const kinds: WeatherKind[] = ['sunny', 'partly', 'cloudy', 'rain', 'starry']
const count = (kind: WeatherKind, bit: string) => skyBits(kind).filter((b) => b.kind === bit).length

describe('날씨', () => {
  it('기분마다 날씨가 하나씩 다르다', () => {
    expect(WEATHER_OF).toEqual({ great: 'sunny', calm: 'partly', meh: 'cloudy', blue: 'rain', tired: 'starry' })
  })

  it('오늘 쓴 기분이 날씨를 정하고, 안 썼으면 구름 조금 낀 날이다', () => {
    expect(weatherOf([], '2026-10-27')).toBe('partly')
    // 어제 울적했어도 오늘 자리가 비었으면 비를 내리지 않는다
    expect(weatherOf([e('2026-10-26', 'blue')], '2026-10-27')).toBe('partly')
    expect(weatherOf([e('2026-10-26', 'great'), e('2026-10-27', 'blue')], '2026-10-27')).toBe('rain')
    expect(weatherOf([e('2026-10-27', 'tired', '아주 긴 글'.repeat(20))], '2026-10-27')).toBe('starry')
  })

  it('맑은 날은 해와 햇살, 비 오는 날은 먹구름과 빗방울, 별밤은 달과 별이다', () => {
    expect(count('sunny', 'sun')).toBe(1)
    expect(count('sunny', 'drop')).toBe(0)
    expect(count('rain', 'drop')).toBeGreaterThanOrEqual(20)
    expect(count('rain', 'cloud')).toBeGreaterThanOrEqual(3)
    expect(count('rain', 'sun')).toBe(0)
    expect(count('starry', 'moon')).toBe(1)
    expect(count('starry', 'star')).toBeGreaterThanOrEqual(10)
    expect(count('starry', 'sun')).toBe(0)
    expect(count('cloudy', 'cloud')).toBeGreaterThan(count('partly', 'cloud'))
    for (const k of kinds.filter((k) => k !== 'rain')) expect(count(k, 'drop')).toBe(0)
  })

  it('하늘 그림은 화면 안 위쪽에 두고(빗방울만 화면 전체), 늘 같은 자리다', () => {
    for (const k of kinds) {
      const bits = skyBits(k)
      expect(bits).toEqual(skyBits(k))
      for (const b of bits) {
        expect(b.x).toBeGreaterThanOrEqual(0)
        expect(b.x).toBeLessThanOrEqual(100)
        expect(b.size).toBeGreaterThan(0)
        if (b.kind === 'drop') continue
        expect(b.y).toBeGreaterThanOrEqual(0)
        expect(b.y).toBeLessThanOrEqual(40)
      }
      // 오른쪽 위 날씨 이름표 자리(x 60% 넘고 y 8% 안)는 비워 둔다
      expect(bits.filter((b) => b.kind !== 'drop' && b.x > 60 && b.y < 8)).toEqual([])
    }
  })
})
