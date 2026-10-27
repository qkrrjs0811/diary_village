import { describe, expect, it } from 'vitest'
import { RESIDENTS, residentLine, residentsOf, residentTalk, residentWalks, storyDay, storyTalk } from './resident'
import { BUILDINGS, findBuilding } from './building'
import { memoryDates } from './memory'
import { PLAZA } from './landmark'
import { festivalLine, festivalOn } from './festival'
import { BLOCK_H, BLOCK_W, ROAD, buildVillage } from './village'
import { addDays } from './date'
import type { Entry } from './types'

const e = (date: string, text = '그냥 하루'): Entry => ({ date, text, mood: 'calm', writtenAt: 0 })
/** start 부터 n일을 이어서 쓴 기록 */
const days = (n: number, start = '2026-01-01'): Entry[] => Array.from({ length: n }, (_, i) => e(addDays(start, i)))

describe('주민', () => {
  it('쓴 날이 쌓일수록 늘고, 첫날부터 한 명이 산다', () => {
    expect(residentsOf([])).toEqual([])
    expect(residentsOf(days(1))).toHaveLength(1)
    expect(residentsOf(days(3))).toHaveLength(2)
    const counts = [1, 5, 10, 30, 100, 365].map((n) => residentsOf(days(n)).length)
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1])
    expect(residentsOf(days(400))).toHaveLength(RESIDENTS.length)
  })

  it('누적 날 수로만 정한다(같은 날·띄엄띄엄·글 길이·기분은 상관없다)', () => {
    const spread = [e('2026-01-01'), e('2026-03-10'), e('2026-09-30', '아주 긴 글'.repeat(10))]
    expect(residentsOf(spread)).toEqual(residentsOf(days(3)))
    expect(residentsOf([e('2026-01-01'), e('2026-01-01')])).toHaveLength(1)
    const blue = days(10).map((x) => ({ ...x, mood: 'blue' as const }))
    expect(residentsOf(blue)).toEqual(residentsOf(days(10)))
  })

  it('이름과 모습이 서로 다르고, 들어오는 날 수가 커지는 순서다', () => {
    expect(new Set(RESIDENTS.map((r) => r.id)).size).toBe(RESIDENTS.length)
    expect(new Set(RESIDENTS.map((r) => r.name)).size).toBe(RESIDENTS.length)
    for (let i = 1; i < RESIDENTS.length; i++) expect(RESIDENTS[i].days).toBeGreaterThan(RESIDENTS[i - 1].days)
    expect(RESIDENTS[0].days).toBe(1)
  })

  it('걷는 길은 집 자리가 아닌 길·광장 돌길 위 한 칸이고, 처음 주민은 오늘 구역에 산다', () => {
    const entries = days(40, '2026-09-20')
    const village = buildVillage(entries, '2026-10-29')
    const walks = residentWalks(village, residentsOf(entries))
    expect(walks).toHaveLength(residentsOf(entries).length)
    const lots = new Set(village.blocks.flatMap((b) => b.lots.map((l) => `${l.gx},${l.gy}`)))
    for (const w of walks) {
      expect(Math.hypot(w.to.gx - w.from.gx, w.to.gy - w.from.gy)).toBeCloseTo(1)
      // 한 줄로만 걷는다(가로 또는 세로)
      expect(w.from.gx === w.to.gx || w.from.gy === w.to.gy).toBe(true)
      for (const t of [0, 0.5, 1]) {
        const gx = w.from.gx + (w.to.gx - w.from.gx) * t
        const gy = w.from.gy + (w.to.gy - w.from.gy) * t
        expect(lots.has(`${Math.floor(gx)},${Math.floor(gy)}`)).toBe(false)
      }
    }
    // 같은 길에 두 주민이 겹치지 않는다
    expect(new Set(walks.map((w) => `${w.from.gx},${w.from.gy}`)).size).toBe(walks.length)
    // 첫 주민은 가장 최근(오늘) 구역 둘레 길에, 둘째는 광장에
    const last = village.blocks[village.blocks.length - 1]
    const gx0 = last.bx * (BLOCK_W + ROAD)
    const gy0 = last.by * (BLOCK_H + ROAD)
    const w0 = walks[0].from
    expect(w0.gx).toBeGreaterThanOrEqual(gx0)
    expect(w0.gx).toBeLessThanOrEqual(gx0 + BLOCK_W + ROAD)
    expect(w0.gy).toBeGreaterThanOrEqual(gy0)
    expect(w0.gy).toBeLessThanOrEqual(gy0 + BLOCK_H + ROAD)
    const w1 = walks[1].from
    expect(w1.gy).toBeGreaterThanOrEqual(PLAZA.gy)
    expect(w1.gy).toBeLessThanOrEqual(PLAZA.gy + PLAZA.h)
  })

  it('길이 모자라면 남는 주민은 걷지 않는다(겹치지 않게)', () => {
    const village = buildVillage([], '2026-10-27')
    const many = RESIDENTS
    const walks = residentWalks(village, many)
    expect(walks.length).toBeLessThan(many.length)
    expect(new Set(walks.map((w) => `${w.from.gx},${w.from.gy}`)).size).toBe(walks.length)
  })

  it('누르면 짧은 한마디. 처음엔 오늘 이야기, 다시 누르면 다른 말', () => {
    const r = RESIDENTS[0]
    const today = '2026-10-27'
    expect(residentLine(r, [e('2026-10-26')], today, 0)).toBe('오늘은 어떤 하루였어요?')
    expect(residentLine(r, [e(today, '라떼 한 잔')], today, 0)).toBe('새로 생긴 카페에 가 봤어요!')
    expect(residentLine(r, [e(today)], today, 0)).toBe('오늘 지은 집, 참 예뻐요.')
    const lines = new Set([1, 2, 3, 4, 5].map((t) => residentLine(r, [e(today)], today, t)))
    expect(lines.size).toBe(5)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(20)
    // 누적 날 수를 말할 뿐 연속 기록은 말하지 않는다(지난 글이 있으면 첫 다음 차례는 지난 이야기)
    const all = [2, 3, 4, 5, 6].map((t) => residentLine(r, days(12), today, t)).join(' ')
    expect(all).toContain('한 줄이 12일')
    expect(all).not.toMatch(/연속|끊/)
  })

  it('잔치 날에는 두 번째로 누르면 잔치 한마디, 그 뒤는 여느 때 말을 차례로 한다', () => {
    const r = RESIDENTS[0]
    const today = '2026-12-24'
    const f = festivalOn([], today)!
    const es = [e(today)]
    expect(residentLine(r, es, today, 0, es, f)).toBe('오늘 지은 집, 참 예뻐요.')
    expect(residentLine(r, es, today, 1, es, f)).toBe(festivalLine(f, r.id))
    expect(residentLine(r, es, today, 2, es, f)).toBe(residentLine(r, es, today, 1))
    expect(residentLine(r, es, today, 3, es, f)).toBe(residentLine(r, es, today, 2))
    // 잔치가 없는 날은 그대로
    expect(residentLine(r, es, today, 1, es, null)).toBe(residentLine(r, es, today, 1))
  })
})

describe('주민 이야기', () => {
  const today = '2026-10-27'
  const past = days(60, '2026-08-01').filter((x) => x.date < today)

  it('지난 글이 없으면 이야기가 없다(오늘 글만 있어도 없다)', () => {
    expect(storyDay(RESIDENTS[0], [], today)).toBeNull()
    expect(storyDay(RESIDENTS[0], [e(today)], today)).toBeNull()
    // 내일 날짜 글(있을 수 없지만)도 꺼내지 않는다
    expect(storyDay(RESIDENTS[0], [e('2026-10-28')], today)).toBeNull()
  })

  it('같은 주민·같은 날은 같은 이야기, 주민·날이 바뀌면 다른 날도 꺼낸다', () => {
    const r = RESIDENTS[0]
    expect(storyDay(r, past, today)?.date).toBe(storyDay(r, [...past].reverse(), today)?.date)
    const byResident = new Set(RESIDENTS.map((x) => storyDay(x, past, today)?.date))
    expect(byResident.size).toBeGreaterThan(3)
    const byDay = new Set(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((t) => storyDay(r, past, t)?.date))
    expect(byDay.size).toBeGreaterThan(1)
  })

  it('오늘·"N일 전 오늘"이 보여 주는 날·지운 날은 꺼내지 않는다', () => {
    // 한 달 전 오늘과 오늘만 남기면 꺼낼 날이 없다
    expect(storyDay(RESIDENTS[0], [e('2026-09-27'), e(today)], today)).toBeNull()
    expect(storyDay(RESIDENTS[0], [e(addDays(today, -100)), e('2025-10-27')], today)).toBeNull()
    const shown = new Set(memoryDates(today).map((m) => m.date))
    for (const r of RESIDENTS) {
      const d = storyDay(r, past, today)!.date
      expect(d < today).toBe(true)
      expect(shown.has(d)).toBe(false)
    }
    // 지운 날은 기록(entries)에 글이 없으니 꺼낼 수 없다: 하나 남은 지난 글만 꺼낸다
    expect(storyDay(RESIDENTS[3], [e('2026-10-01')], today)?.date).toBe('2026-10-01')
  })

  it('이야기는 날짜와 건물 이름만 말하고 글은 옮기지 않는다', () => {
    const t = storyTalk(RESIDENTS[0], [e('2026-03-12', '갓 구운 빵 냄새 비밀일기')], today)!
    expect(t.date).toBe('2026-03-12')
    expect(t.text).toContain('3월 12일')
    expect(t.text).toContain('빵집')
    expect(t.text).not.toContain('비밀일기')
    const house = storyTalk(RESIDENTS[0], [e('2026-03-12', '비밀일기')], today)!
    expect(house.text).toContain('3월 12일')
    expect(house.text).not.toContain('비밀일기')
    // 작년 이야기는 해를 붙인다
    expect(storyTalk(RESIDENTS[0], [e('2025-03-12')], today)!.text).toContain('2025년 3월 12일')
  })

  it('건물 16종과 보통 집마다 이야기 말이 있고, 기분에 따라 말이 달라지지 않는다', () => {
    for (const b of BUILDINGS) {
      const word = b.words.find((w) => findBuilding(w)?.id === b.id)!
      const t = storyTalk(RESIDENTS[0], [e('2026-03-12', word)], today)!
      expect(t.text).toContain(b.name)
    }
    const lines = new Set(BUILDINGS.map((b) => storyTalk(RESIDENTS[0], [e('2026-03-12', b.words[0])], today)!.text))
    expect(lines.size).toBe(BUILDINGS.length)
    const calm = storyTalk(RESIDENTS[0], [e('2026-03-12', '커피')], today)!.text
    for (const mood of ['great', 'meh', 'blue', 'tired'] as const) {
      expect(storyTalk(RESIDENTS[0], [{ ...e('2026-03-12', '커피'), mood }], today)!.text).toBe(calm)
    }
  })

  it('한마디 차례: 첫 한마디는 오늘 이야기, 다음이 지난 이야기, 잔치 날은 잔치 다음', () => {
    const r = RESIDENTS[0]
    const es = [...past, e(today)]
    const story = storyTalk(r, es, today)!
    expect(residentTalk(r, es, today, 0)).toEqual({ text: '오늘 지은 집, 참 예뻐요.' })
    expect(residentTalk(r, es, today, 1)).toEqual(story)
    expect(residentLine(r, es, today, 1)).toBe(story.text)
    // 그 뒤는 여느 때 말을 차례로
    const usual = new Set([2, 3, 4, 5, 6].map((t) => residentLine(r, es, today, t)))
    expect(usual.size).toBe(5)
    expect(usual.has(story.text)).toBe(false)
    expect(residentTalk(r, es, today, 2).date).toBeUndefined()
    // 잔치 날
    const fday = '2026-12-24'
    const f = festivalOn([], fday)!
    const fes = [...past, e(fday)]
    const fstory = storyTalk(r, fes, fday)!
    expect(residentLine(r, fes, fday, 1, fes, f)).toBe(festivalLine(f, r.id))
    expect(residentTalk(r, fes, fday, 2, fes, f)).toEqual(fstory)
  })
})
