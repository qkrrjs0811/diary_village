import { describe, expect, it } from 'vitest'
import { RESIDENTS, residentLine, residentsOf, residentWalks } from './resident'
import { PLAZA } from './landmark'
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
    // 누적 날 수를 말할 뿐 연속 기록은 말하지 않는다
    const all = [1, 2, 3, 4, 5].map((t) => residentLine(r, days(12), today, t)).join(' ')
    expect(all).toContain('12일')
    expect(all).not.toMatch(/연속|끊/)
  })
})
