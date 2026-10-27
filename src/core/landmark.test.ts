import { describe, expect, it } from 'vitest'
import { LANDMARKS, PLAZA, earnedLandmarks, landmarkSpot, nextLandmark, reachedLandmarks, writtenDays } from './landmark'
import { buildVillage, BLOCK_W, BLOCK_H } from './village'
import { addDays } from './date'
import type { Entry } from './types'

const e = (date: string, text = date): Entry => ({ date, text, mood: 'calm', writtenAt: 0 })
/** 2026-01-01부터 n일을 이어서 쓴 기록 */
const days = (n: number, start = '2026-01-01'): Entry[] => Array.from({ length: n }, (_, i) => e(addDays(start, i)))

describe('마을 명소', () => {
  it('누적 7·14·30·50·100·200·365일에 하나씩, 이름이 모두 다르다', () => {
    expect(LANDMARKS.map((l) => l.days)).toEqual([7, 14, 30, 50, 100, 200, 365])
    expect(new Set(LANDMARKS.map((l) => l.id)).size).toBe(LANDMARKS.length)
    expect(LANDMARKS.slice(0, 4).map((l) => l.name)).toContain('우물')
    expect(LANDMARKS.map((l) => l.name)).toEqual(expect.arrayContaining(['분수', '다리', '시계탑']))
  })

  it('쓴 날 수로만 정한다(같은 날이 두 번 있어도 하루)', () => {
    expect(writtenDays([])).toBe(0)
    expect(writtenDays([e('2026-10-01'), e('2026-10-01'), e('2026-10-03')])).toBe(2)
  })

  it('7일째에 첫 명소가 생기고, 그 전에는 없다', () => {
    expect(earnedLandmarks(days(6))).toEqual([])
    expect(earnedLandmarks(days(7)).map((l) => l.days)).toEqual([7])
    expect(earnedLandmarks(days(30)).map((l) => l.days)).toEqual([7, 14, 30])
    expect(earnedLandmarks(days(400))).toHaveLength(LANDMARKS.length)
  })

  it('빠진 날이 있어도, 띄엄띄엄 써도 누적 날 수면 된다(연속 기록을 보지 않는다)', () => {
    const scattered = [1, 5, 40, 41, 90, 200, 300].map((d) => e(addDays('2026-01-01', d)))
    expect(earnedLandmarks(scattered).map((l) => l.days)).toEqual([7])
  })

  it('글 길이는 명소에 영향을 주지 않는다', () => {
    const short = days(14).map((x) => ({ ...x, text: '응' }))
    const long = days(14).map((x) => ({ ...x, text: '아주 긴 하루였다 '.repeat(5) }))
    expect(earnedLandmarks(short)).toEqual(earnedLandmarks(long))
  })

  it('다음 명소까지 남은 날', () => {
    expect(nextLandmark([])).toEqual({ landmark: LANDMARKS[0], left: 7 })
    expect(nextLandmark(days(7))).toEqual({ landmark: LANDMARKS[1], left: 7 })
    expect(nextLandmark(days(29))).toEqual({ landmark: LANDMARKS[2], left: 1 })
    expect(nextLandmark(days(365))).toBeNull()
  })

  it('한 줄을 써서 넘은 명소를 알려 준다(가져오기로 여럿을 넘으면 여럿)', () => {
    expect(reachedLandmarks(days(6), days(7)).map((l) => l.days)).toEqual([7])
    expect(reachedLandmarks(days(7), days(8))).toEqual([])
    expect(reachedLandmarks(days(5), days(35)).map((l) => l.days)).toEqual([7, 14, 30])
    // 고치기처럼 날 수가 그대로면 아무것도 없다
    expect(reachedLandmarks(days(7), days(7))).toEqual([])
  })

  it('명소는 광장에 자리가 정해져 있고, 서로·집 구역과 겹치지 않는다', () => {
    const spots = LANDMARKS.map((l) => landmarkSpot(l))
    expect(new Set(spots.map((s) => `${s.gx},${s.gy}`)).size).toBe(LANDMARKS.length)
    for (const s of spots) {
      expect(s.gx).toBeGreaterThanOrEqual(PLAZA.gx)
      expect(s.gx).toBeLessThan(PLAZA.gx + BLOCK_W)
      expect(s.gy).toBeGreaterThanOrEqual(PLAZA.gy)
      expect(s.gy).toBeLessThan(PLAZA.gy + BLOCK_H)
    }
    // 3년 동안 매달 쓴 마을에서도 광장은 집 구역과 겹치지 않는다
    const entries: Entry[] = []
    for (let y = 2026; y <= 2028; y++) for (let m = 1; m <= 12; m++) entries.push(e(`${y}-${String(m).padStart(2, '0')}-15`))
    const lots = new Set(buildVillage(entries).blocks.flatMap((b) => b.lots.map((l) => `${l.gx},${l.gy}`)))
    for (let x = PLAZA.gx; x < PLAZA.gx + BLOCK_W; x++)
      for (let y = PLAZA.gy; y < PLAZA.gy + BLOCK_H; y++) expect(lots.has(`${x},${y}`)).toBe(false)
  })
})
