import { describe, expect, it } from 'vitest'
import { WEATHER_OF, dayPart, skyBits, skyColors, weatherOf, windowsLit, type DayPart, type WeatherKind } from './weather'
import { MOODS } from './mood'
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

/** 사용자 기준 시간대의 그 시각(dayKey와 같은 기준) */
const at = (time: string) => {
  const [h, m] = time.split(':').map(Number)
  return new Date(2026, 9, 27, h, m).getTime()
}
const sky = (kind: WeatherKind, part: DayPart, bit: string) => skyBits(kind, part).filter((b) => b.kind === bit).length

describe('낮·저녁·밤', () => {
  it('지금 시각으로 낮(6~17시)·저녁(17~20시)·밤(20~6시)을 정한다', () => {
    expect(dayPart(at('05:59:00'))).toBe('night')
    expect(dayPart(at('06:00:00'))).toBe('day')
    expect(dayPart(at('13:00:00'))).toBe('day')
    expect(dayPart(at('16:59:00'))).toBe('day')
    expect(dayPart(at('17:00:00'))).toBe('evening')
    expect(dayPart(at('19:59:00'))).toBe('evening')
    expect(dayPart(at('20:00:00'))).toBe('night')
    expect(dayPart(at('23:59:00'))).toBe('night')
    expect(dayPart(at('00:40:00'))).toBe('night')
  })

  it('낮 하늘은 기분 하늘 그대로, 저녁·밤은 같은 기분 하늘을 노을·밤빛으로 물들인다', () => {
    for (const m of MOODS) {
      expect(skyColors(m.id, 'day')).toEqual(m.sky)
      const evening = skyColors(m.id, 'evening')
      const night = skyColors(m.id, 'night')
      for (const c of [...evening, ...night]) expect(c).toMatch(/^#[0-9a-f]{6}$/)
      expect(evening).not.toEqual(m.sky)
      // 밤 하늘 위쪽은 낮·저녁보다 어둡다
      expect(light(night[0])).toBeLessThan(light(m.sky[0]))
      expect(light(night[0])).toBeLessThan(light(evening[0]))
    }
    // 기분마다 밤 하늘도 서로 다르다(기분은 색깔이다)
    expect(new Set(MOODS.map((m) => skyColors(m.id, 'night')[0])).size).toBe(MOODS.length)
  })

  it('밤에는 해 대신 달이 뜨고 맑은 밤에는 별도 보인다. 비는 밤에도 내린다', () => {
    for (const k of kinds) {
      expect(sky(k, 'night', 'sun')).toBe(0)
      expect(skyBits(k)).toEqual(skyBits(k, 'day'))
    }
    expect(sky('sunny', 'night', 'moon')).toBe(1)
    expect(sky('sunny', 'night', 'star')).toBeGreaterThanOrEqual(8)
    expect(sky('partly', 'night', 'moon')).toBe(1)
    expect(sky('partly', 'night', 'star')).toBeGreaterThan(0)
    expect(sky('rain', 'night', 'drop')).toBe(sky('rain', 'day', 'drop'))
    expect(sky('starry', 'night', 'moon')).toBe(1)
    // 저녁 해는 낮게 뜬 노을빛 해
    const sun = skyBits('sunny', 'evening').find((b) => b.kind === 'sun')!
    const noon = skyBits('sunny', 'day').find((b) => b.kind === 'sun')!
    expect(sun.y).toBeGreaterThan(noon.y)
    expect(sun.tone).toBe('dusk')
  })

  it('저녁·밤 하늘 그림도 화면 위쪽에 두고 날씨 이름표 자리를 비운다', () => {
    for (const k of kinds) {
      for (const part of ['evening', 'night'] as DayPart[]) {
        const bits = skyBits(k, part)
        expect(bits).toEqual(skyBits(k, part))
        for (const b of bits) {
          if (b.kind === 'drop') continue
          expect(b.y).toBeGreaterThanOrEqual(0)
          expect(b.y).toBeLessThanOrEqual(40)
        }
        expect(bits.filter((b) => b.kind !== 'drop' && b.x > 60 && b.y < 8)).toEqual([])
      }
    }
  })

  it('저녁과 밤에는 창문에 불이 켜진다', () => {
    expect(windowsLit('day')).toBe(false)
    expect(windowsLit('evening')).toBe(true)
    expect(windowsLit('night')).toBe(true)
  })
})

/** 색의 밝기(0~255) */
function light(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11
}
