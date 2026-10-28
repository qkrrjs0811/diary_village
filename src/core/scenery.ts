import { PLAZA } from './landmark'
import { seasonOf, type Season } from './season'
import { BLOCK_H, BLOCK_W, ROAD, hash, type Block, type Village } from './village'
import { mix, type DayPart } from './weather'

/** 빈 땅에 나는 것: 나무 또는 작은 꽃·풀 */
export interface Scenery {
  /** 구역 안 칸 */
  col: number
  row: number
  /** 마을 전체 칸 좌표 */
  gx: number
  gy: number
  kind: 'tree' | 'flowers' | 'bush' | 'tuft'
  /** 나무 크기·잎 색, 꽃 자리를 정하는 고정 난수 */
  seed: number
}

/** 광장 모서리 나무(광장 안 칸). 명소 자리와 그 바로 앞은 피했다 */
export const PLAZA_TREES: [number, number][] = [
  [0, 0],
  [6, 0],
  [0, 5],
]

/**
 * 구역 하나의 빈 땅 나무·덤불·꽃·풀 포기. 저장하지 않고 달·칸으로만 계산해 언제 열어도 같다.
 * 달력 밖 칸은 나무와 둥근 덤불이 섞인 숲인데, 그달의 날 바로 앞(화면 아래쪽으로 이웃한) 칸에는 대신 꽃·풀이 나서
 * 집·건물을 가리지 않는다. 그달의 모든 날을 보므로 집을 지어도 옆 나무가 갑자기 사라지지 않는다.
 * 지난 빈 날(지운 날 포함)에는 가끔 꽃이 피고, 꽃 없는 빈 날과 아직 오지 않은 날에는 작은 풀 포기·돌이 난다.
 * 집을 지으면 그 칸의 것만 사라진다
 */
export function blockScenery(block: Block, today: string): Scenery[] {
  const lots = new Map(block.lots.map((l) => [`${l.col},${l.row}`, l]))
  const isDay = (col: number, row: number) => lots.has(`${col},${row}`)
  const out: Scenery[] = []
  for (let row = 0; row < BLOCK_H; row++) {
    for (let col = 0; col < BLOCK_W; col++) {
      const seed = hash(`${block.month}:${col}:${row}`)
      const gx = block.bx * (BLOCK_W + ROAD) + col
      const gy = block.by * (BLOCK_H + ROAD) + row
      const lot = lots.get(`${col},${row}`)
      let kind: Scenery['kind'] | null = null
      if (!lot) {
        const front = isDay(col - 1, row) || isDay(col, row - 1) || isDay(col - 1, row - 1)
        kind = front ? 'flowers' : seed % 5 < 3 ? 'tree' : 'bush'
      } else if (!lot.entry && lot.date !== today) {
        if (lot.date < today && seed % 3 === 0) kind = 'flowers'
        else if ((seed >>> 5) % 4 !== 0) kind = 'tuft'
      }
      if (kind) out.push({ col, row, gx, gy, kind, seed })
    }
  }
  return out
}

/** 섬을 이루는 땅 판 하나(구역 또는 광장). bx·by: 구역 자리 */
export interface Slab {
  /** 구역이면 'YYYY-MM', 광장이면 'plaza' */
  key: string
  bx: number
  by: number
}

/** 땅 판의 네 쪽. north = 화면 오른쪽 위, east = 오른쪽 아래, south = 왼쪽 아래, west = 왼쪽 위 */
export type Side = 'north' | 'east' | 'south' | 'west'

const SIDES: Side[] = ['north', 'east', 'south', 'west']
const STEP: Record<Side, [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] }
const SPAN_X = BLOCK_W + ROAD
const SPAN_Y = BLOCK_H + ROAD

/** 광장 이름표가 서는 자리(광장 판 왼쪽 모서리 길 위, 마을 칸 좌표) */
export const PLAZA_SIGN = { gx: PLAZA.gx - ROAD / 2 + 0.1, gy: PLAZA.gy + PLAZA.h + ROAD / 2 - 0.3 }

/** 섬의 땅 판들: 구역(오래된 순)과 광장 */
export function islandSlabs(village: Village): Slab[] {
  const plaza = { key: 'plaza', bx: PLAZA.gx / SPAN_X, by: PLAZA.gy / SPAN_Y }
  return [...village.blocks.map((b) => ({ key: b.month, bx: b.bx, by: b.by })), plaza]
}

/** 다른 땅 판과 맞닿지 않은(섬 바깥으로 드러난) 쪽 */
export function outerSides(slabs: Slab[], slab: Slab): Side[] {
  return SIDES.filter((side) => {
    const [dx, dy] = STEP[side]
    return !slabs.some((s) => s.bx === slab.bx + dx && s.by === slab.by + dy)
  })
}

/** 이름표가 서는 자리(구역 이름표 기둥 = 판 뒤 모서리, 광장 이름표) */
export function signSpots(village: Village): { gx: number; gy: number }[] {
  return [...village.blocks.map((b) => ({ gx: b.bx * SPAN_X - ROAD / 2, gy: b.by * SPAN_Y - ROAD / 2 })), PLAZA_SIGN]
}

/** 섬 테두리 길가에 난 것(마을 칸 좌표, 소수) */
export interface RimBit {
  slab: string
  gx: number
  gy: number
  kind: 'tuft' | 'flower' | 'stone'
  seed: number
}

/** 흙 옆면에 박힌 돌, 아래로 늘어진 뿌리. t: 옆면 화면 왼쪽 끝 0 ~ 오른쪽 끝 1, h: 옆면 위 0 ~ 아래 1 */
export interface CliffBit {
  slab: string
  side: 'east' | 'south'
  t: number
  h: number
  kind: 'stone' | 'root'
  seed: number
}

/** 테두리 길가에서 바깥 끝으로부터 떨어진 거리(칸). 길 폭의 절반 안이라 칸에 닿지 않는다 */
const RIM_IN = 0.22
const SIGN_CLEAR = 0.8
/** 계절마다 꽃이 나는 정도(고정 난수 끝자리가 이 값 이상이면 꽃) */
const FLOWER_FROM = { spring: 6, summer: 7, autumn: 9, winter: 10 }

/**
 * 떠 있는 섬의 가장자리 장식. 저장하지 않고 판·자리·계절로만 계산해 언제 열어도 같고, 쓴 날 수·기분과 무관하다.
 * 바깥으로 드러난 쪽의 테두리 길가에 풀숲·작은 꽃·돌이 나고(칸 안 = 집·명소·소품 자리에는 닿지 않음),
 * 앞쪽 두 흙 옆면(동·남)에는 돌이 박히고 뿌리가 늘어진다. 이름표 기둥 둘레는 비운다.
 * 구역은 그달 계절, 광장은 오늘 계절을 따른다(봄·여름엔 꽃이 많고, 가을엔 드물고, 겨울엔 없다)
 */
export function islandEdge(village: Village, today: string): { rim: RimBit[]; cliff: CliffBit[] } {
  const slabs = islandSlabs(village)
  const signs = signSpots(village)
  const rim: RimBit[] = []
  const cliff: CliffBit[] = []
  for (const slab of slabs) {
    const flowerFrom = FLOWER_FROM[seasonOf(slab.key === 'plaza' ? today : slab.key)]
    const x0 = slab.bx * SPAN_X - ROAD / 2
    const y0 = slab.by * SPAN_Y - ROAD / 2
    for (const side of outerSides(slabs, slab)) {
      const len = side === 'north' || side === 'south' ? SPAN_X : SPAN_Y
      for (let k = 0; k < len; k++) {
        const along = k + 0.5
        const at =
          side === 'north' ? { gx: x0 + along, gy: y0 + RIM_IN }
          : side === 'south' ? { gx: x0 + along, gy: y0 + SPAN_Y - RIM_IN }
          : side === 'west' ? { gx: x0 + RIM_IN, gy: y0 + along }
          : { gx: x0 + SPAN_X - RIM_IN, gy: y0 + along }
        const seed = hash(`rim:${slab.key}:${side}:${k}`)
        const r = seed % 10
        if (r >= 4 && !signs.some((s) => Math.hypot(at.gx - s.gx, at.gy - s.gy) < SIGN_CLEAR)) {
          rim.push({ slab: slab.key, ...at, kind: r < 6 ? 'stone' : r >= flowerFrom ? 'flower' : 'tuft', seed })
        }
        if (side === 'east' || side === 'south') {
          const c = (seed >>> 8) % 6
          // 남쪽 옆면은 서쪽 끝이, 동쪽 옆면은 남쪽 끝이 화면 왼쪽이다
          const t = side === 'south' ? along / len : 1 - along / len
          if (c === 0) cliff.push({ slab: slab.key, side, t, h: 0.35 + ((seed >>> 12) % 4) / 10, kind: 'stone', seed })
          else if (c <= 2) cliff.push({ slab: slab.key, side, t, h: 1, kind: 'root', seed })
        }
      }
    }
  }
  return { rim, cliff }
}

/** 먼 산 봉우리 하나(화면 %). x: 가운데, w: 밑동 너비, h: 구름 바다 윗줄에서 꼭대기까지 높이 */
export interface Hill {
  x: number
  w: number
  h: number
}

/** 구름 바다 윗줄의 뭉게 하나. x: 한 폭 안 자리(0~100), y: 띠 안 높이(0 위 ~ 100 아래), r: 크기 */
export interface Puff {
  x: number
  y: number
  r: number
}

/** 섬 아래·뒤 먼 바깥 풍경. seaTop: 구름 바다 윗줄(화면 위에서 %), 색은 계절·때를 따른다 */
export interface FarScene {
  hills: Hill[]
  puffs: Puff[]
  seaTop: number
  hillFill: string
  hillLine: string
  snow: boolean
  seaFill: string
  seaLine: string
  seaShade: string
}

/** 먼 산 한 겹. 이웃 봉우리끼리 밑동이 겹쳐 화면 양 끝 너머까지 이어진다 */
const HILLS: Hill[] = [
  { x: -4, w: 30, h: 7 },
  { x: 18, w: 30, h: 10 },
  { x: 38, w: 26, h: 6 },
  { x: 57, w: 32, h: 9 },
  { x: 78, w: 28, h: 6.5 },
  { x: 98, w: 32, h: 8.5 },
]

/** 구름 바다 윗줄 뭉게. 한 폭 안에만 두어 두 폭을 이어 흘려도 이음매가 없다 */
const PUFFS: Puff[] = [
  { x: 4, y: 40, r: 7 },
  { x: 15, y: 30, r: 9 },
  { x: 27, y: 45, r: 6 },
  { x: 37, y: 33, r: 8 },
  { x: 49, y: 42, r: 7 },
  { x: 60, y: 28, r: 9 },
  { x: 72, y: 44, r: 6 },
  { x: 82, y: 34, r: 8 },
  { x: 93, y: 42, r: 7 },
]

const SEA_TOP = 64
const HILL_COLOR: Record<Season, [string, string]> = {
  spring: ['#bfe0c4', '#93bba0'],
  summer: ['#a6d4b4', '#7fae90'],
  autumn: ['#e8cba0', '#c9a074'],
  winter: ['#cdd9e6', '#9eb0c6'],
}
const SEA = { fill: '#fffdf9', line: '#e3d9cc', shade: '#eef3f7' }
/** 저녁 노을빛·밤빛으로 물들이기 */
const TINT: Record<Exclude<DayPart, 'day'>, { hill: [string, number]; sea: [string, number] }> = {
  evening: { hill: ['#f6b9a6', 0.3], sea: ['#ffd2c0', 0.35] },
  night: { hill: ['#3a4078', 0.5], sea: ['#8a8cc6', 0.5] },
}

/**
 * 떠 있는 섬 아래·뒤로 깔리는 먼 바깥(먼 산 한 겹과 구름 바다). 날짜의 계절과 지금 때로만 정하고 저장하지 않는다.
 * 산 모양·구름 자리는 늘 같고 색만 계절(봄 연두·여름 초록·가을 갈대빛·겨울 눈 덮인 푸른빛)과 때를 따른다.
 * 해·달·하늘 구름보다 아래에 깔려 날씨 하늘과 겹치지 않는다
 */
export function farScene(date: string, part: DayPart): FarScene {
  const season = seasonOf(date)
  let [hillFill, hillLine] = HILL_COLOR[season]
  let { fill: seaFill, line: seaLine, shade: seaShade } = SEA
  if (part !== 'day') {
    const { hill, sea } = TINT[part]
    ;[hillFill, hillLine] = [mix(hillFill, hill[0], hill[1]), mix(hillLine, hill[0], hill[1])]
    ;[seaFill, seaLine, seaShade] = [mix(seaFill, sea[0], sea[1]), mix(seaLine, sea[0], sea[1]), mix(seaShade, sea[0], sea[1])]
  }
  return { hills: HILLS, puffs: PUFFS, seaTop: SEA_TOP, hillFill, hillLine, snow: season === 'winter', seaFill, seaLine, seaShade }
}
