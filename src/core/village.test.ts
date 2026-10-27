import { describe, expect, it } from 'vitest'
import { buildVillage, houseLook, BLOCK_W, BLOCK_H, DOOR_COLORS, WINDOW_SHAPES, PORCHES, ROOF_TOPS } from './village'
import type { Entry } from './types'

const e = (date: string, mood: Entry['mood'] = 'calm'): Entry => ({ date, text: date, mood, writtenAt: 0 })

describe('마을 배치', () => {
  it('기록이 없으면 빈 마을', () => {
    expect(buildVillage([]).blocks).toEqual([])
  })

  it('한 달이 한 구역이고, 구역 안은 달력처럼 요일·주로 놓인다', () => {
    const v = buildVillage([e('2026-10-01'), e('2026-10-27')])
    expect(v.blocks).toHaveLength(1)
    const [block] = v.blocks
    expect(block.month).toBe('2026-10')
    expect(block.lots).toHaveLength(31) // 그달의 모든 날에 땅이 있다
    const first = block.lots.find((l) => l.date === '2026-10-01')!
    const last = block.lots.find((l) => l.date === '2026-10-27')!
    expect([first.col, first.row]).toEqual([4, 0]) // 목요일, 첫 주
    expect([last.col, last.row]).toEqual([2, 4]) // 화요일, 다섯째 주
    expect(first.entry?.date).toBe('2026-10-01')
    expect(block.lots.find((l) => l.date === '2026-10-02')!.entry).toBeUndefined() // 빈 날은 빈 땅
  })

  it('처음 열어도 오늘이 있는 달의 땅은 보인다', () => {
    const v = buildVillage([], '2026-10-27')
    expect(v.blocks.map((b) => b.month)).toEqual(['2026-10'])
    expect(v.blocks[0].lots.every((l) => !l.entry)).toBe(true)
    expect(buildVillage([e('2026-09-03')], '2026-10-27').blocks.map((b) => b.month)).toEqual(['2026-09', '2026-10'])
  })

  it('기록이 있는 달만 구역이 되고 달 순서대로 이어진다', () => {
    const v = buildVillage([e('2026-12-05'), e('2026-09-30'), e('2026-10-01')])
    expect(v.blocks.map((b) => b.month)).toEqual(['2026-09', '2026-10', '2026-12'])
  })

  it('구역끼리, 집끼리 땅이 겹치지 않는다', () => {
    const entries: Entry[] = []
    for (let m = 1; m <= 12; m++) entries.push(e(`2026-${String(m).padStart(2, '0')}-15`))
    const v = buildVillage(entries)
    const cells = v.blocks.flatMap((b) => b.lots.map((l) => `${l.gx},${l.gy}`))
    expect(new Set(cells).size).toBe(cells.length)
    for (const b of v.blocks) for (const l of b.lots) {
      expect(l.col).toBeLessThan(BLOCK_W)
      expect(l.row).toBeLessThan(BLOCK_H)
    }
  })

  it('같은 기록이면 언제 계산해도 같은 마을', () => {
    const list = [e('2026-10-01', 'great'), e('2026-10-02', 'blue')]
    expect(buildVillage(list)).toEqual(buildVillage([...list].reverse()))
  })
})

describe('지운 날과 구역', () => {
  it('지운 날만 남은 달도 구역이 그대로 남아 다른 구역 자리가 바뀌지 않는다', () => {
    const v = buildVillage([e('2026-10-05')], '2026-10-27', ['2026-09-03'])
    expect(v.blocks.map((b) => b.month)).toEqual(['2026-09', '2026-10'])
    expect(v.blocks[0].lots.every((l) => !l.entry)).toBe(true)
  })
})

describe('집 모양', () => {
  it('지붕 색은 그날 기분의 색 중 하나', () => {
    expect(['#ff9f7a', '#ffc15e', '#ff8fa3']).toContain(houseLook(e('2026-10-01', 'great')).roof)
    expect(['#7fa7d9', '#8fb8e8', '#6e9cc9']).toContain(houseLook(e('2026-10-01', 'blue')).roof)
  })

  it('날짜가 다르면 모양이 여러 가지로 나온다', () => {
    const looks = new Set<string>()
    for (let d = 1; d <= 28; d++) {
      const l = houseLook(e(`2026-02-${String(d).padStart(2, '0')}`))
      looks.add(`${l.floors}-${l.roofStyle}-${l.chimney}`)
    }
    expect(looks.size).toBeGreaterThanOrEqual(5)
  })

  it('이미 선 집의 지붕 색·벽 색·층수·지붕 모양·굴뚝은 그대로다', () => {
    const base = (x: Entry) => {
      const l = houseLook(x)
      return { roof: l.roof, wall: l.wall, floors: l.floors, roofStyle: l.roofStyle, chimney: l.chimney }
    }
    expect(base(e('2026-10-01', 'great'))).toEqual({ roof: '#ff8fa3', wall: '#fff9ef', floors: 1, roofStyle: 'flat', chimney: true })
    expect(base(e('2026-10-27'))).toEqual({ roof: '#9ed39b', wall: '#fff9ef', floors: 1, roofStyle: 'flat', chimney: false })
    expect(base(e('2025-02-14', 'blue'))).toEqual({ roof: '#7fa7d9', wall: '#fff9ef', floors: 1, roofStyle: 'gable', chimney: false })
    expect(base(e('2026-12-25', 'tired'))).toEqual({ roof: '#a99be0', wall: '#fdebd8', floors: 2, roofStyle: 'gable', chimney: false })
  })
})

describe('집집마다 다른 손길', () => {
  const october = Array.from({ length: 31 }, (_, i) => houseLook(e(`2026-10-${String(i + 1).padStart(2, '0')}`)))

  it('문 색·창 모양·꽃상자·현관·지붕 위 작은 것을 정한다', () => {
    for (const l of october) {
      expect(DOOR_COLORS).toContain(l.door)
      expect(WINDOW_SHAPES).toContain(l.window)
      expect(typeof l.flowerBox).toBe('boolean')
      expect(PORCHES).toContain(l.porch)
      expect(ROOF_TOPS).toContain(l.roofTop)
    }
  })

  it('기분은 손길을 바꾸지 않는다', () => {
    const touch = (x: Entry) => {
      const l = houseLook(x)
      return [l.door, l.window, l.flowerBox, l.porch, l.roofTop]
    }
    for (const d of ['2026-10-01', '2026-03-17', '2027-01-09']) {
      const calm = touch(e(d, 'calm'))
      for (const m of ['great', 'meh', 'blue', 'tired'] as const) expect(touch(e(d, m))).toEqual(calm)
    }
  })

  it('한 달 안에서 고르게 퍼진다', () => {
    for (const shape of WINDOW_SHAPES) expect(october.filter((l) => l.window === shape).length).toBeGreaterThanOrEqual(7)
    for (const color of DOOR_COLORS) expect(october.filter((l) => l.door === color).length).toBeGreaterThanOrEqual(4)
    for (const p of PORCHES) expect(october.filter((l) => l.porch === p).length).toBeGreaterThanOrEqual(5)
    for (const t of ROOF_TOPS) expect(october.filter((l) => l.roofTop === t).length).toBeGreaterThanOrEqual(3)
    const boxes = october.filter((l) => l.flowerBox).length
    expect(boxes).toBeGreaterThanOrEqual(10)
    expect(boxes).toBeLessThanOrEqual(21)
  })

  it('이웃한 날 집은 창 모양과 문 색이 다르다', () => {
    for (const month of ['2026-02', '2026-10', '2027-05']) {
      for (let d = 1; d < 28; d++) {
        const a = houseLook(e(`${month}-${String(d).padStart(2, '0')}`))
        const b = houseLook(e(`${month}-${String(d + 1).padStart(2, '0')}`))
        expect(a.window).not.toBe(b.window)
        expect(a.door).not.toBe(b.door)
      }
    }
  })

  it('글 길이는 집 모양에 영향을 주지 않는다', () => {
    const short = houseLook({ ...e('2026-10-01'), text: '좋다' })
    const long = houseLook({ ...e('2026-10-01'), text: '아주 긴 하루였다 '.repeat(5) })
    expect(short).toEqual(long)
  })
})
