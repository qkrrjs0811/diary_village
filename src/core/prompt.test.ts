import { describe, expect, it } from 'vitest'
import { BUILDINGS } from './building'
import { addDays } from './date'
import { BUILDING_PROMPTS, PROMPTS, PROMPT_MAX, SEASON_PROMPTS, YESTERDAY_PROMPTS, todayPrompt, yesterdayPrompt } from './prompt'
import type { Entry } from './types'

const e = (date: string, text: string): Entry => ({ date, text, mood: 'calm', writtenAt: 0 })
/** 16종을 모두 만난 기록 */
const allFound = BUILDINGS.map((b, i) => e(addDays('2026-01-01', i), b.words[0]))
const len = (s: string) => [...s].length

describe('오늘의 물음', () => {
  it('여느 물음이 30개 이상이고, 계절마다 물음이 있고, 건물 16종마다 물음이 있다', () => {
    expect(PROMPTS.length).toBeGreaterThanOrEqual(30)
    for (const s of ['spring', 'summer', 'autumn', 'winter'] as const) expect(SEASON_PROMPTS[s].length).toBeGreaterThan(0)
    for (const b of BUILDINGS) expect(BUILDING_PROMPTS[b.id], b.id).toBeTruthy()
    expect(YESTERDAY_PROMPTS.length).toBeGreaterThan(0)
  })

  it('모든 물음은 빈 글자 자리에서 잘리지 않게 짧고, 겹치지 않는다', () => {
    const all = [...PROMPTS, ...Object.values(SEASON_PROMPTS).flat(), ...Object.values(BUILDING_PROMPTS), ...YESTERDAY_PROMPTS]
    for (const p of all) expect(len(p), p).toBeLessThanOrEqual(PROMPT_MAX)
    expect(new Set(all).size).toBe(all.length)
  })

  it('같은 날은 같은 물음이다(저장하지 않아도 된다)', () => {
    expect(todayPrompt([], '2026-10-28')).toEqual(todayPrompt([], '2026-10-28'))
    expect(yesterdayPrompt('2026-10-28')).toBe(yesterdayPrompt('2026-10-28'))
  })

  it('이웃한 날은 물음이 다르다(두 해 내내)', () => {
    for (const entries of [[], allFound]) {
      let prev = todayPrompt(entries, '2026-01-01').text
      let prevY = yesterdayPrompt('2026-01-01')
      for (let i = 1; i < 730; i++) {
        const day = addDays('2026-01-01', i)
        const now = todayPrompt(entries, day).text
        const y = yesterdayPrompt(day)
        expect(now, day).not.toBe(prev)
        expect(y, day).not.toBe(prevY)
        prev = now
        prevY = y
      }
    }
  })

  it('계절 물음은 그 계절에만 나온다', () => {
    const seasonOf = (m: number) => (m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter')
    const seen = new Set<string>()
    for (let i = 0; i < 365; i++) {
      const day = addDays('2026-01-01', i)
      const { text } = todayPrompt(allFound, day)
      const season = seasonOf(Number(day.slice(5, 7)))
      for (const [s, list] of Object.entries(SEASON_PROMPTS)) {
        if (list.includes(text)) {
          expect(s, `${day} ${text}`).toBe(season)
          seen.add(s)
        }
      }
    }
    expect(seen.size).toBe(4)
  })

  it('못 만난 건물이 있으면 사흘에 한 번쯤 그 건물 물음을 낸다', () => {
    const entries = allFound.filter((x) => findId(x) !== 'park' && findId(x) !== 'cafe')
    let count = 0
    const asked = new Set<string>()
    for (let i = 0; i < 90; i++) {
      const p = todayPrompt(entries, addDays('2026-10-01', i))
      if (p.building) {
        count++
        asked.add(p.building)
        expect(p.text).toBe(BUILDING_PROMPTS[p.building])
      }
    }
    expect(count).toBe(30)
    expect([...asked].sort()).toEqual(['cafe', 'park'])
  })

  it('16종을 모두 만났으면 건물 물음을 내지 않는다', () => {
    for (let i = 0; i < 60; i++) expect(todayPrompt(allFound, addDays('2026-10-01', i)).building).toBeUndefined()
  })

  it('처음 쓰는 사람(기록 없음)에게도 건물 물음이 섞인다', () => {
    const ps = Array.from({ length: 9 }, (_, i) => todayPrompt([], addDays('2026-10-01', i)))
    expect(ps.filter((p) => p.building).length).toBe(3)
  })

  it('기분·글 길이는 물음을 바꾸지 않는다', () => {
    const a = [e('2026-10-01', '커피'), e('2026-10-02', '빵')]
    const b = a.map((x) => ({ ...x, mood: 'blue' as const, text: `${x.text} ${'아주 긴 글 '.repeat(5)}` }))
    for (let i = 0; i < 30; i++) {
      const day = addDays('2026-10-10', i)
      expect(todayPrompt(b, day)).toEqual(todayPrompt(a, day))
    }
  })
})

function findId(x: Entry) {
  return BUILDINGS.find((b) => b.words[0] === x.text)!.id
}
