import { describe, expect, it } from 'vitest'
import { BUILDINGS } from './building'
import { HINTS, buildingOrdinal, collectionOf, collectionCount, daysOfBuilding, landmarkBook, ordinalWord } from './collection'
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

describe('건물마다 모인 날들(로드맵 R20)', () => {
  const entries = [
    e('2026-10-20', '라떼 한 잔'),
    e('2026-10-03', '아침에 커피를 마셨다'),
    e('2026-10-05', '고양이가 울었다'),
    e('2026-10-06', '그냥 조용한 하루'),
    e('2026-10-11', '카페에서 쉬었다'),
  ]

  it('그 건물이 선 날을 날짜 순으로 모은다', () => {
    expect(daysOfBuilding(entries, 'cafe').map((x) => x.date)).toEqual(['2026-10-03', '2026-10-11', '2026-10-20'])
    expect(daysOfBuilding(entries, 'catHouse').map((x) => x.date)).toEqual(['2026-10-05'])
    expect(daysOfBuilding(entries, 'cinema')).toEqual([])
  })

  it('모인 날 수는 도감의 채 수와 같다', () => {
    for (const c of collectionOf(entries)) expect(daysOfBuilding(entries, c.building.id).length).toBe(c.count)
  })

  it('지운 날은 빠지고, 고치면 따라 바뀐다', () => {
    const erased = entries.filter((x) => x.date !== '2026-10-11')
    expect(daysOfBuilding(erased, 'cafe').map((x) => x.date)).toEqual(['2026-10-03', '2026-10-20'])
    const edited = entries.map((x) => (x.date === '2026-10-03' ? { ...x, text: '영화를 봤다' } : x))
    expect(daysOfBuilding(edited, 'cafe').map((x) => x.date)).toEqual(['2026-10-11', '2026-10-20'])
    expect(daysOfBuilding(edited, 'cinema').map((x) => x.date)).toEqual(['2026-10-03'])
  })

  it('몇 번째는 그날까지 선 같은 건물 수다(쓴 순서가 아니라 날짜 순)', () => {
    expect(buildingOrdinal(entries, '2026-10-03')).toBe(1)
    expect(buildingOrdinal(entries, '2026-10-11')).toBe(2)
    expect(buildingOrdinal(entries, '2026-10-20')).toBe(3)
    expect(buildingOrdinal(entries, '2026-10-05')).toBe(1)
  })

  it('보통 집·없는 날은 몇 번째가 없다', () => {
    expect(buildingOrdinal(entries, '2026-10-06')).toBeNull()
    expect(buildingOrdinal(entries, '2026-10-07')).toBeNull()
  })

  it('기분은 몇 번째에 영향을 주지 않는다', () => {
    const blue = entries.map((x) => ({ ...x, mood: 'blue' as MoodId }))
    expect(buildingOrdinal(blue, '2026-10-20')).toBe(buildingOrdinal(entries, '2026-10-20'))
  })

  it('몇 번째를 우리말로 읽는다', () => {
    expect(ordinalWord(1)).toBe('첫 번째')
    expect(ordinalWord(2)).toBe('두 번째')
    expect(ordinalWord(3)).toBe('세 번째')
    expect(ordinalWord(4)).toBe('네 번째')
    expect(ordinalWord(10)).toBe('열 번째')
    expect(ordinalWord(11)).toBe('11번째')
    expect(ordinalWord(120)).toBe('120번째')
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
