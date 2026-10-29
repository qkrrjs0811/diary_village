import { describe, expect, it } from 'vitest'
import { BUILDINGS, buildingOf } from './building'
import { dayHappenings, HAPPENINGS, happeningNote, happeningsFor } from './happening'
import { buildVillage } from './village'
import type { Entry, MoodId } from './types'
import type { DayPart, WeatherKind } from './weather'

const e = (date: string, text: string, mood: MoodId = 'calm'): Entry => ({ date, text, mood, writtenAt: 0 })

/** 9~10월에 여러 건물을 지은 마을 */
const entries: Entry[] = [
  e('2026-09-03', '갓 구운 빵을 샀다'),
  e('2026-09-07', '공원을 산책했다'),
  e('2026-09-12', '고양이가 울었다'),
  e('2026-09-20', '바다를 보러 갔다'),
  e('2026-10-02', '피아노를 쳤다'),
  e('2026-10-05', '그냥 평범한 하루'),
  e('2026-10-09', '기차를 탔다'),
  e('2026-10-15', '빵집에 또 갔다'),
]
const today = '2026-10-30'
const village = (list: Entry[] = entries, kept: string[] = []) => buildVillage(list, today, kept)
const days = Array.from({ length: 40 }, (_, i) => `2026-11-${String((i % 30) + 1).padStart(2, '0')}`)
const conditions: [DayPart, WeatherKind][] = [
  ['day', 'sunny'],
  ['evening', 'partly'],
  ['day', 'rain'],
  ['night', 'rain'],
  ['night', 'starry'],
]

describe('건물마다 작은 일 표', () => {
  it('건물 16종 모두 두세 가지 일이 있고, 어떤 때·날씨에도 하나 이상 고를 수 있다', () => {
    for (const b of BUILDINGS) {
      const list = HAPPENINGS[b.id]
      expect(list.length, b.id).toBeGreaterThanOrEqual(2)
      expect(list.length, b.id).toBeLessThanOrEqual(3)
      for (const [part, weather] of conditions) expect(happeningsFor(b.id, part, weather).length, `${b.id} ${part} ${weather}`).toBeGreaterThan(0)
    }
  })

  it('비 오는 날엔 비 오는 날 일이, 맑은 밤엔 밤 일이 먼저 나온다', () => {
    for (const b of BUILDINGS) {
      const rain = HAPPENINGS[b.id].filter((h) => h.when === 'rain')
      if (rain.length) expect(happeningsFor(b.id, 'day', 'rain')).toEqual(rain)
      const night = HAPPENINGS[b.id].filter((h) => h.when === 'night')
      if (night.length) expect(happeningsFor(b.id, 'night', 'starry')).toEqual(night)
      // 맑은 낮엔 비·밤 일이 나오지 않는다
      expect(happeningsFor(b.id, 'day', 'sunny').every((h) => h.when === 'any' || h.when === 'fair')).toBe(true)
    }
  })

  it('말풍선 한 줄은 짧고, 장면 이름과 아이디가 겹치지 않는다', () => {
    const ids = new Set<string>()
    for (const b of BUILDINGS)
      for (const h of HAPPENINGS[b.id]) {
        expect(h.line.length, h.id).toBeLessThanOrEqual(28)
        expect(h.line.length).toBeGreaterThan(4)
        expect(ids.has(h.id), h.id).toBe(false)
        ids.add(h.id)
        expect(h.scene).toMatch(/^[a-z][a-zA-Z]*$/)
      }
  })
})

describe('오늘의 작은 일 고르기', () => {
  it('선 건물 가운데 한두 곳, 서로 다른 건물 종류이고 그 건물이 생긴 날을 함께 준다', () => {
    for (const d of days) {
      const list = dayHappenings(village(), d, 'day', 'sunny')
      expect(list.length).toBeGreaterThanOrEqual(1)
      expect(list.length).toBeLessThanOrEqual(2)
      expect(new Set(list.map((x) => x.building)).size).toBe(list.length)
      for (const x of list) {
        const entry = entries.find((y) => y.date === x.date)!
        expect(buildingOf(entry)?.id).toBe(x.building)
        expect(HAPPENINGS[x.building]).toContain(x.happening)
        expect(x.block).toBe(x.date.slice(0, 7))
        const lot = village().blocks.flatMap((b) => b.lots).find((l) => l.date === x.date)!
        expect([x.gx, x.gy]).toEqual([lot.gx, lot.gy])
      }
    }
  })

  it('같은 날엔 늘 같고, 날마다 바뀐다(두 곳인 날도 있다)', () => {
    const a = dayHappenings(village(), '2026-11-04', 'day', 'sunny')
    expect(dayHappenings(village(), '2026-11-04', 'day', 'sunny')).toEqual(a)
    const seen = new Set(days.map((d) => JSON.stringify(dayHappenings(village(), d, 'day', 'sunny').map((x) => [x.date, x.happening.id]))))
    expect(seen.size).toBeGreaterThan(5)
    expect(days.some((d) => dayHappenings(village(), d, 'day', 'sunny').length === 2)).toBe(true)
    // 여러 날에 걸쳐 여러 건물에서 일이 일어난다
    const places = new Set(days.flatMap((d) => dayHappenings(village(), d, 'day', 'sunny').map((x) => x.building)))
    expect(places.size).toBeGreaterThanOrEqual(4)
  })

  it('지금 때·날씨에 맞는 일만 고른다', () => {
    for (const d of days)
      for (const [part, weather] of conditions)
        for (const x of dayHappenings(village(), d, part, weather)) expect(happeningsFor(x.building, part, weather)).toContain(x.happening)
  })

  it('건물이 없거나 건물이 선 날을 지우면 그 일은 없다', () => {
    expect(dayHappenings(village([e('2026-10-05', '평범한 하루')]), today, 'day', 'sunny')).toEqual([])
    expect(dayHappenings(buildVillage([], today), today, 'day', 'sunny')).toEqual([])
    const onlyBakery = [e('2026-10-05', '평범한 하루'), e('2026-10-15', '빵집에 갔다')]
    expect(dayHappenings(village(onlyBakery), today, 'day', 'sunny').map((x) => x.building)).toEqual(['bakery'])
    // 빵집 날을 지우면(날짜만 남음) 일이 없다
    expect(dayHappenings(village([onlyBakery[0]], ['2026-10-15']), today, 'day', 'sunny')).toEqual([])
  })

  it('같은 종류 건물이 여럿이면 그 가운데 한 채를 날마다 고른다', () => {
    const dates = new Set(days.flatMap((d) => dayHappenings(village(), d, 'day', 'sunny').filter((x) => x.building === 'bakery').map((x) => x.date)))
    expect([...dates].every((x) => x === '2026-09-03' || x === '2026-10-15')).toBe(true)
    expect(dates.size).toBe(2)
  })

  it('기분·긴 글·쓴 시각은 고르는 데 영향을 주지 않는다', () => {
    const other = entries.map((x, i) => ({ ...x, mood: (['great', 'blue', 'tired', 'meh', 'calm'] as MoodId[])[i % 5], more: '아주 긴 글'.repeat(50), writtenAt: i * 999 }))
    for (const d of days) expect(dayHappenings(village(other), d, 'day', 'sunny')).toEqual(dayHappenings(village(), d, 'day', 'sunny'))
  })

  it('저장하지 않는다(localStorage를 건드리지 않는다)', () => {
    const store = globalThis.localStorage
    let touched = false
    ;(globalThis as { localStorage?: unknown }).localStorage = new Proxy({}, { get: () => { touched = true; return () => null } })
    try {
      dayHappenings(village(), today, 'day', 'sunny')
    } finally {
      ;(globalThis as { localStorage?: unknown }).localStorage = store
    }
    expect(touched).toBe(false)
  })
})

describe('작은 일 말풍선', () => {
  it('그 건물이 생긴 날을 받침에 맞게 붙인다', () => {
    const [x] = dayHappenings(village([e('2026-09-03', '빵을 샀다')]), today, 'day', 'sunny')
    expect(happeningNote(x)).toBe(`${x.happening.line} · 이 빵집은 9월 3일에 생겼어요`)
    const [c] = dayHappenings(village([e('2026-10-01', '커피를 마셨다')]), today, 'day', 'sunny')
    expect(happeningNote(c)).toContain('이 카페는 10월 1일에 생겼어요')
  })

  it('작년에 생긴 건물이면 해도 붙인다', () => {
    const [x] = dayHappenings(buildVillage([e('2025-12-24', '빵을 샀다')], '2026-10-30'), '2026-10-30', 'day', 'sunny')
    expect(happeningNote(x, '2026-10-30')).toContain('이 빵집은 2025년 12월 24일에 생겼어요')
  })
})
