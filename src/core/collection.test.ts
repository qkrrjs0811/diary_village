import { describe, expect, it } from 'vitest'
import { BUILDINGS } from './building'
import { HINTS, collectionOf, collectionCount, landmarkBook } from './collection'
import { addDays } from './date'
import type { Entry, MoodId } from './types'

const e = (date: string, text: string, mood: MoodId = 'calm'): Entry => ({ date, text, mood, writtenAt: 0 })

describe('건물 도감', () => {
  it('건물마다 힌트가 있고, 힌트에 건물 이름은 나오지 않는다', () => {
    for (const b of BUILDINGS) {
      expect(HINTS[b.id]).toBeTruthy()
      expect(HINTS[b.id]).not.toContain(b.name)
    }
  })

  it('빈 마을은 모든 건물이 아직 못 만난 칸이다(목록 순서 그대로)', () => {
    const book = collectionOf([])
    expect(book.map((c) => c.building.id)).toEqual(BUILDINGS.map((b) => b.id))
    expect(book.every((c) => !c.found && c.count === 0 && c.first === null)).toBe(true)
    expect(book[0].hint).toBe(HINTS.cafe)
    expect(collectionCount([])).toEqual({ found: 0, total: BUILDINGS.length })
  })

  it('만난 건물은 채 수와 처음 만난 날·말을 보여 준다(기록 순서와 상관없이 가장 이른 날)', () => {
    const entries = [
      e('2026-10-20', '라떼 한 잔'),
      e('2026-10-03', '아침에 커피를 마셨다'),
      e('2026-10-05', '고양이가 울었다'),
      e('2026-10-06', '그냥 조용한 하루'),
    ]
    const book = collectionOf(entries)
    const cafe = book.find((c) => c.building.id === 'cafe')!
    expect(cafe).toMatchObject({ found: true, count: 2, first: { date: '2026-10-03', word: '커피' } })
    expect(book.find((c) => c.building.id === 'catHouse')).toMatchObject({ found: true, count: 1 })
    expect(book.find((c) => c.building.id === 'cinema')).toMatchObject({ found: false, count: 0 })
    expect(collectionCount(entries)).toEqual({ found: 2, total: BUILDINGS.length })
  })

  it('글을 고치면 도감도 따라 바뀐다(기록에서 계산한다)', () => {
    expect(collectionCount([e('2026-10-03', '커피')]).found).toBe(1)
    expect(collectionCount([e('2026-10-03', '영화')]).found).toBe(1)
    expect(collectionOf([e('2026-10-03', '영화')]).find((c) => c.found)!.building.id).toBe('cinema')
  })

  it('기분은 도감에 영향을 주지 않는다', () => {
    const a = collectionOf([e('2026-10-03', '커피', 'great')])
    const b = collectionOf([e('2026-10-03', '커피', 'blue')])
    expect(a).toEqual(b)
  })
})

describe('명소 수첩', () => {
  const days = (n: number) => Array.from({ length: n }, (_, i) => e(addDays('2026-01-01', i), '한 줄'))

  it('얻은 명소는 얻음, 못 얻은 명소는 남은 날 수를 보여 준다', () => {
    const book = landmarkBook(days(10))
    expect(book[0]).toMatchObject({ earned: true, left: 0 })
    expect(book[0].landmark.id).toBe('well')
    expect(book[1]).toMatchObject({ earned: false, left: 4 })
    expect(book[6]).toMatchObject({ earned: false, left: 355 })
  })

  it('365일이면 모두 얻는다', () => {
    expect(landmarkBook(days(365)).every((l) => l.earned)).toBe(true)
  })
})
