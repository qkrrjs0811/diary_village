import { describe, expect, it } from 'vitest'
import { blockScenery, farScene, islandEdge, islandSlabs, outerSides, PLAZA_GATES, PLAZA_TREES, roadside, signSpots } from './scenery'
import { BLOCK_H, BLOCK_W, ROAD, buildVillage, hash } from './village'
import { LANDMARKS, PLAZA } from './landmark'
import { RESIDENTS, residentWalks } from './resident'
import type { Entry } from './types'
import { skyBits } from './weather'

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
      expect(s?.kind).toBe('flowers')
    }
  })

  it('집과 떨어진 달력 밖 칸은 예전처럼 날짜로 정한 나무숲이다', () => {
    const scenery = blockScenery(october(), '2026-10-28')
    // 첫 줄 0~3칸은 앞에도 뒤에도 그달의 날이 없다
    for (let col = 0; col < 4; col++) {
      const s = scenery.find((x) => x.col === col && x.row === 0)
      const seed = hash(`2026-10:${col}:0`)
      expect(s).toEqual({ col, row: 0, gx: col, gy: 0, kind: seed % 5 < 3 ? 'tree' : 'bush', seed })
    }
  })

  it('지난 빈 날에는 가끔 꽃이 피고, 집이 선 날·오늘에는 아무것도 없다', () => {
    const block = october([e('2026-10-05')])
    const scenery = blockScenery(block, '2026-10-28')
    for (const lot of block.lots) {
      const s = scenery.find((x) => x.col === lot.col && x.row === lot.row)
      const seed = hash(`2026-10:${lot.col}:${lot.row}`)
      if (lot.entry || lot.date === '2026-10-28') expect(s).toBeUndefined()
      else if (lot.date < '2026-10-28' && seed % 3 === 0) expect(s?.kind).toBe('flowers')
      else if (s) expect(s.kind).toBe('tuft')
    }
  })

  it('숲 칸 중 나무가 없던 자리에는 둥근 덤불이, 집 바로 앞이면 꽃·풀이 난다', () => {
    const block = october()
    const lots = new Set(block.lots.map((l) => `${l.col},${l.row}`))
    const scenery = blockScenery(block, '2026-10-28')
    let bushes = 0
    for (let row = 0; row < BLOCK_H; row++) {
      for (let col = 0; col < BLOCK_W; col++) {
        if (lots.has(`${col},${row}`) || hash(`2026-10:${col}:${row}`) % 5 < 3) continue
        const s = scenery.find((x) => x.col === col && x.row === row)
        const front = behind(col, row).some(([c, r]) => lots.has(`${c},${r}`))
        expect(s?.kind).toBe(front ? 'flowers' : 'bush')
        if (!front) bushes++
      }
    }
    expect(bushes).toBeGreaterThan(0)
  })

  it('빈 날 칸(지난 빈 날·앞날)에 풀 포기·돌이 넉넉히 나서 맨땅이 덜 보인다', () => {
    const block = october()
    const scenery = blockScenery(block, '2026-10-28')
    const empty = block.lots.filter((l) => l.date !== '2026-10-28')
    const covered = empty.filter((l) => scenery.some((s) => s.col === l.col && s.row === l.row))
    expect(scenery.some((s) => s.kind === 'tuft' && block.lots.find((l) => l.col === s.col && l.row === s.row)!.date > '2026-10-28')).toBe(true)
    expect(covered.length / empty.length).toBeGreaterThanOrEqual(0.5)
  })

  it('덤불·풀 포기 자리는 기록으로 바뀌지 않고, 집을 지으면 그 칸만 비워진다', () => {
    const before = blockScenery(october(), '2026-10-28')
    const after = blockScenery(october([e('2026-10-20')]), '2026-10-28')
    const at = (list: typeof before) => list.filter((s) => !(s.col === 2 && s.row === 3))
    // 10월 20일은 화요일, 셋째 주: (2, 3)
    expect(after.some((s) => s.col === 2 && s.row === 3)).toBe(false)
    expect(at(after)).toEqual(at(before))
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

describe('먼 바깥 풍경(구름 바다·먼 산)', () => {
  const PARTS = ['day', 'evening', 'night'] as const
  const DAYS = { spring: '2027-04-12', summer: '2027-07-20', autumn: '2026-10-28', winter: '2026-12-20' }
  const light = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114
  }

  it('날짜와 때만으로 정해 언제 열어도 같다(저장하지 않음)', () => {
    for (const part of PARTS) expect(farScene('2026-10-28', part)).toEqual(farScene('2026-10-28', part))
  })

  it('같은 계절 안에서는 날이 바뀌어도 같고, 산 모양·구름 자리는 계절이 바뀌어도 그대로다(색만 바뀐다)', () => {
    expect(farScene('2027-04-01', 'day')).toEqual(farScene('2027-05-20', 'day'))
    const spring = farScene(DAYS.spring, 'day')
    const winter = farScene(DAYS.winter, 'night')
    expect(winter.hills).toEqual(spring.hills)
    expect(winter.puffs).toEqual(spring.puffs)
    expect(winter.seaTop).toBe(spring.seaTop)
  })

  it('먼 산은 화면 너비 끝까지 끊김 없이 이어진다', () => {
    const { hills } = farScene(DAYS.spring, 'day')
    expect(hills.length).toBeGreaterThanOrEqual(5)
    expect(hills.length).toBeLessThanOrEqual(10)
    const sorted = [...hills].sort((a, b) => a.x - b.x)
    expect(sorted[0].x - sorted[0].w / 2).toBeLessThanOrEqual(0)
    expect(sorted.at(-1)!.x + sorted.at(-1)!.w / 2).toBeGreaterThanOrEqual(100)
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].x - sorted[i].w / 2).toBeLessThan(sorted[i - 1].x + sorted[i - 1].w / 2)
  })

  it('산과 구름 바다는 해·달·하늘 구름보다 아래에 있어 겹치지 않는다', () => {
    const scene = farScene(DAYS.spring, 'day')
    const kinds = ['sunny', 'partly', 'cloudy', 'rain', 'starry'] as const
    const skyLow = Math.max(...kinds.flatMap((k) => PARTS.flatMap((p) => skyBits(k, p).filter((b) => b.kind !== 'drop').map((b) => b.y))))
    for (const h of scene.hills) expect(scene.seaTop - h.h).toBeGreaterThan(skyLow + 8)
    expect(scene.seaTop).toBeGreaterThanOrEqual(55)
    expect(scene.seaTop).toBeLessThanOrEqual(75)
  })

  it('구름 바다 뭉게는 한 폭(0~100) 안에 있어 두 폭을 이어 흘려도 이음매가 없고, 어수선하지 않게 적다', () => {
    const { puffs } = farScene(DAYS.spring, 'day')
    expect(puffs.length).toBeGreaterThanOrEqual(6)
    expect(puffs.length).toBeLessThanOrEqual(14)
    for (const p of puffs) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThan(100)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(100)
    }
  })

  it('계절마다 산 색이 다르고, 눈 덮인 봉우리는 겨울에만 있다', () => {
    const fills = Object.values(DAYS).map((d) => farScene(d, 'day').hillFill)
    expect(new Set(fills).size).toBe(4)
    expect(farScene(DAYS.winter, 'day').snow).toBe(true)
    for (const d of [DAYS.spring, DAYS.summer, DAYS.autumn]) expect(farScene(d, 'day').snow).toBe(false)
  })

  it('저녁은 노을빛, 밤은 더 어두운 빛으로 산과 구름 바다를 물들인다', () => {
    for (const d of Object.values(DAYS)) {
      const day = farScene(d, 'day')
      const evening = farScene(d, 'evening')
      const night = farScene(d, 'night')
      expect(evening.hillFill).not.toBe(day.hillFill)
      expect(evening.seaFill).not.toBe(day.seaFill)
      expect(light(night.hillFill)).toBeLessThan(light(day.hillFill))
      expect(light(night.seaFill)).toBeLessThan(light(day.seaFill))
      for (const c of [day, evening, night].flatMap((s) => [s.hillFill, s.hillLine, s.seaFill, s.seaLine, s.seaShade])) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('길가(울타리 토막·꽃길·가로수)', () => {
  const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
  const village = buildVillage(months.map((m) => e(`${m}-05`)), '2026-10-28')
  const bits = roadside(village)
  const inside = (gx: number, gy: number, x0: number, y0: number, w: number, h: number) => gx > x0 && gx < x0 + w && gy > y0 && gy < y0 + h

  it('저장하지 않고 구역 자리로만 정해 언제 열어도 같고, 한 줄을 써도 바뀌지 않는다', () => {
    expect(roadside(village)).toEqual(bits)
    const more = buildVillage([...months.map((m) => e(`${m}-05`)), e('2026-10-27'), e('2026-07-12')], '2026-10-28')
    expect(roadside(more)).toEqual(bits)
  })

  it('울타리·꽃길·가로수가 모두 난다', () => {
    for (const kind of ['fence', 'flowers', 'tree'] as const) expect(bits.some((b) => b.kind === kind)).toBe(true)
  })

  it('모두 길 위에 있어 집·명소·소품 칸(구역 안·광장 안)에 닿지 않는다', () => {
    for (const b of bits) {
      for (const k of village.blocks) expect(inside(b.gx, b.gy, k.bx * (BLOCK_W + ROAD), k.by * (BLOCK_H + ROAD), BLOCK_W, BLOCK_H)).toBe(false)
      expect(inside(b.gx, b.gy, PLAZA.gx, PLAZA.gy, PLAZA.w, PLAZA.h)).toBe(false)
    }
  })

  it('울타리는 구역 뒤쪽 두 길가(북·서)에만 있어 집 앞을 가리지 않는다', () => {
    for (const b of bits.filter((x) => x.kind === 'fence')) expect(['north', 'west']).toContain(b.side)
  })

  it('가로수는 구역 왼쪽·오른쪽 모서리 길에만, 한 자리에 하나씩 선다', () => {
    const trees = bits.filter((b) => b.kind === 'tree')
    const corners = village.blocks.flatMap((k) => {
      const x0 = k.bx * (BLOCK_W + ROAD) - ROAD / 2
      const y0 = k.by * (BLOCK_H + ROAD) - ROAD / 2
      return [`${x0},${y0 + BLOCK_H + ROAD}`, `${x0 + BLOCK_W + ROAD},${y0}`]
    })
    for (const t of trees) expect(corners).toContain(`${t.gx},${t.gy}`)
    expect(new Set(trees.map((t) => `${t.gx},${t.gy}`)).size).toBe(trees.length)
  })

  it('이름표 기둥 둘레와 광장 돌길 입구는 비운다', () => {
    for (const b of bits) {
      for (const s of signSpots(village)) expect(Math.hypot(b.gx - s.gx, b.gy - s.gy)).toBeGreaterThanOrEqual(0.8)
      for (const p of PLAZA_GATES) expect(Math.hypot(b.gx - p.gx, b.gy - p.gy)).toBeGreaterThanOrEqual(1)
    }
  })

  it('주민이 걷는 길에서 떨어져 있다', () => {
    const walks = residentWalks(village, RESIDENTS)
    expect(walks.length).toBeGreaterThan(5)
    for (const w of walks) {
      for (const b of bits) {
        // 한 칸 길(선분)과의 거리
        const [ax, ay, bx, by] = [w.from.gx, w.from.gy, w.to.gx, w.to.gy]
        const t = Math.max(0, Math.min(1, ((b.gx - ax) * (bx - ax) + (b.gy - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)))
        const d = Math.hypot(b.gx - (ax + (bx - ax) * t), b.gy - (ay + (by - ay) * t))
        expect(d).toBeGreaterThan(b.kind === 'tree' ? 0.4 : 0.1)
        if (b.kind === 'fence') expect(d).toBeGreaterThan(0.5)
      }
    }
  })
})
