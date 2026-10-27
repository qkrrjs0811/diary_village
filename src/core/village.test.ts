import { describe, expect, it } from 'vitest'
import { buildVillage, houseLook, BLOCK_W, BLOCK_H } from './village'
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

  it('글 길이는 집 모양에 영향을 주지 않는다', () => {
    const short = houseLook({ ...e('2026-10-01'), text: '좋다' })
    const long = houseLook({ ...e('2026-10-01'), text: '아주 긴 하루였다 '.repeat(5) })
    expect(short).toEqual(long)
  })
})
