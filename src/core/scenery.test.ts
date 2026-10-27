import { describe, expect, it } from 'vitest'
import { blockScenery, islandEdge, islandSlabs, outerSides, PLAZA_TREES, signSpots } from './scenery'
import { BLOCK_H, BLOCK_W, ROAD, buildVillage, hash } from './village'
import { LANDMARKS } from './landmark'
import type { Entry } from './types'

const e = (date: string): Entry => ({ date, text: date, mood: 'calm', writtenAt: 0 })

// 2026년 10월: 1일이 목요일(4번째 칸)이라 첫 줄 0~3칸과 여섯째 줄(31일이 다섯째 줄 토요일)이 달력 밖이다
const october = (entries: Entry[] = [], today = '2026-10-28') => buildVillage(entries, today).blocks[0]

/** 칸 (col,row) 바로 뒤(화면 위쪽으로 이웃한) 세 칸 */
const behind = (col: number, row: number) => [
  [col - 1, row],
  [col, row - 1],
  [col - 1, row - 1],
]

describe('빈 땅 나무·꽃 자리', () => {
  it('집·건물 바로 앞(화면 아래쪽으로 이웃한) 칸에는 나무가 서지 않는다', () => {
    const block = october()
    const lots = new Set(block.lots.map((l) => `${l.col},${l.row}`))
    const trees = blockScenery(block, '2026-10-28').filter((s) => s.kind === 'tree')
    expect(trees.length).toBeGreaterThan(0)
    for (const t of trees) {
      expect(lots.has(`${t.col},${t.row}`)).toBe(false)
      for (const [c, r] of behind(t.col, t.row)) expect(lots.has(`${c},${r}`)).toBe(false)
    }
  })

  it('나무가 설 자리였던 집 앞 칸에는 꽃·풀이 난다', () => {
    const block = october()
    const scenery = blockScenery(block, '2026-10-28')
    // 31일(토, 6칸·다섯째 줄 row 4) 아래 여섯째 줄은 모두 달력 밖이고 다섯째 줄 집들 바로 앞이다
    for (let col = 0; col < 7; col++) {
      const s = scenery.find((x) => x.col === col && x.row === 5)
      if (hash(`2026-10:${col}:5`) % 5 < 3) expect(s?.kind).toBe('flowers')
      else expect(s).toBeUndefined()
    }
  })

  it('집과 떨어진 달력 밖 칸은 예전처럼 날짜로 정한 나무숲이다', () => {
    const scenery = blockScenery(october(), '2026-10-28')
    // 첫 줄 0~3칸은 앞에도 뒤에도 그달의 날이 없다
    for (let col = 0; col < 4; col++) {
      const s = scenery.find((x) => x.col === col && x.row === 0)
      const seed = hash(`2026-10:${col}:0`)
      if (seed % 5 < 3) expect(s).toEqual({ col, row: 0, gx: col, gy: 0, kind: 'tree', seed })
      else expect(s).toBeUndefined()
    }
  })

  it('지난 빈 날에는 가끔 꽃이 피고, 집이 선 날·오늘·앞날에는 아무것도 없다', () => {
    const block = october([e('2026-10-05')])
    const scenery = blockScenery(block, '2026-10-28')
    for (const lot of block.lots) {
      const s = scenery.find((x) => x.col === lot.col && x.row === lot.row)
      const seed = hash(`2026-10:${lot.col}:${lot.row}`)
      if (!lot.entry && lot.date < '2026-10-28' && seed % 3 === 0) expect(s?.kind).toBe('flowers')
      else expect(s).toBeUndefined()
    }
  })

  it('나무 자리는 기록으로 바뀌지 않는다(집을 지어도 옆 나무가 갑자기 사라지지 않는다)', () => {
    const trees = (entries: Entry[]) => blockScenery(october(entries), '2026-10-28').filter((s) => s.kind === 'tree')
    expect(trees([e('2026-10-01'), e('2026-10-31')])).toEqual(trees([]))
  })

  it('광장 모서리 나무는 명소 자리도, 명소 바로 앞도 아니다', () => {
    for (const [col, row] of PLAZA_TREES) {
      for (const l of LANDMARKS) {
        expect([l.col, l.row]).not.toEqual([col, row])
        for (const [c, r] of behind(col, row)) expect([l.col, l.row]).not.toEqual([c, r])
      }
    }
  })
})

describe('떠 있는 섬 가장자리', () => {
  /** 2026-01부터 n달, 달마다 한 줄 */
  const monthly = (n: number): Entry[] =>
    Array.from({ length: n }, (_, i) => e(`${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-10`))
  const villageOf = (n: number) => buildVillage(monthly(n))
  const cornerOf = (s: { bx: number; by: number }) => ({ x: s.bx * (BLOCK_W + ROAD), y: s.by * (BLOCK_H + ROAD) })

  it('섬 땅은 구역들과 광장이고, 광장은 첫 구역 바로 아래다', () => {
    const slabs = islandSlabs(villageOf(3))
    expect(slabs.map((s) => [s.key, s.bx, s.by])).toEqual([
      ['2026-01', 0, 0],
      ['2026-02', 1, 0],
      ['2026-03', 1, 1],
      ['plaza', 0, 1],
    ])
  })

  it('다른 땅과 맞닿은 쪽은 가장자리가 아니다', () => {
    const slabs = islandSlabs(villageOf(3))
    expect(outerSides(slabs, slabs[0])).toEqual(['north', 'west'])
    expect(outerSides(slabs, slabs.find((s) => s.key === 'plaza')!)).toEqual(['south', 'west'])
  })

  it('가장자리 풀숲·꽃·돌은 섬 바깥 길가에만 놓여 집·광장·명소·소품·우체통 칸과 겹치지 않는다', () => {
    for (const n of [1, 2, 5, 13]) {
      const village = villageOf(n)
      const slabs = islandSlabs(village)
      const { rim } = islandEdge(village, '2026-01-10')
      expect(rim.length).toBeGreaterThan(0)
      for (const r of rim) {
        // 어느 땅 판의 칸(집·명소·우체통·소품 자리) 안도 아니다
        for (const s of slabs) {
          const c = cornerOf(s)
          expect(r.gx >= c.x && r.gx < c.x + BLOCK_W && r.gy >= c.y && r.gy < c.y + BLOCK_H).toBe(false)
        }
        // 그래도 섬 위(어느 땅 판 위)에 있다
        const onIsland = slabs.some((s) => {
          const c = cornerOf(s)
          return r.gx >= c.x - ROAD / 2 && r.gx <= c.x + BLOCK_W + ROAD / 2 && r.gy >= c.y - ROAD / 2 && r.gy <= c.y + BLOCK_H + ROAD / 2
        })
        expect(onIsland).toBe(true)
      }
    }
  })

  it('구역 이름표 기둥과 광장 이름표 자리 둘레는 비워 둔다', () => {
    const village = villageOf(5)
    const { rim } = islandEdge(village, '2026-05-10')
    const signs = signSpots(village)
    expect(signs).toHaveLength(6)
    for (const r of rim) for (const s of signs) expect(Math.hypot(r.gx - s.gx, r.gy - s.gy)).toBeGreaterThanOrEqual(0.8)
  })

  it('흙 옆면의 돌·뿌리는 바깥으로 드러난 앞쪽 두 옆면(동·남)에만 있다', () => {
    const village = villageOf(5)
    const slabs = islandSlabs(village)
    const { cliff } = islandEdge(village, '2026-05-10')
    expect(cliff.some((c) => c.kind === 'stone')).toBe(true)
    expect(cliff.some((c) => c.kind === 'root')).toBe(true)
    for (const c of cliff) {
      expect(['east', 'south']).toContain(c.side)
      expect(outerSides(slabs, slabs.find((s) => s.key === c.slab)!)).toContain(c.side)
      expect(c.t).toBeGreaterThan(0)
      expect(c.t).toBeLessThan(1)
      expect(c.h).toBeGreaterThanOrEqual(0)
      expect(c.h).toBeLessThanOrEqual(1)
    }
  })

  it('계절 따라 다르다: 봄엔 꽃이 피고 겨울엔 꽃 없이 풀숲·돌만', () => {
    const spring = islandEdge(buildVillage([e('2026-04-10')]), '2026-04-10')
    const winter = islandEdge(buildVillage([e('2026-12-10')]), '2026-12-10')
    expect(spring.rim.some((r) => r.kind === 'flower')).toBe(true)
    expect(winter.rim.some((r) => r.kind === 'flower')).toBe(false)
    expect(winter.rim.some((r) => r.kind === 'tuft')).toBe(true)
    for (const r of [...spring.rim, ...winter.rim]) expect(['tuft', 'flower', 'stone']).toContain(r.kind)
  })

  it('언제 열어도 같고, 쓴 날 수·기분·글과 무관하다', () => {
    const a = buildVillage([e('2026-10-01')], '2026-10-28')
    const many = Array.from({ length: 20 }, (_, i): Entry => ({
      ...e(`2026-10-${String(i + 1).padStart(2, '0')}`),
      mood: 'great',
      text: '아주 긴 글'.repeat(10),
    }))
    const b = buildVillage(many, '2026-10-28')
    expect(islandEdge(a, '2026-10-28')).toEqual(islandEdge(b, '2026-10-28'))
  })
})
