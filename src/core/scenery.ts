import { BLOCK_H, BLOCK_W, ROAD, hash, type Block } from './village'

/** 빈 땅에 나는 것: 나무 또는 작은 꽃·풀 */
export interface Scenery {
  /** 구역 안 칸 */
  col: number
  row: number
  /** 마을 전체 칸 좌표 */
  gx: number
  gy: number
  kind: 'tree' | 'flowers'
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
 * 구역 하나의 빈 땅 나무·꽃. 저장하지 않고 달·칸으로만 계산해 언제 열어도 같다.
 * 달력 밖 칸은 나무숲인데, 그달의 날 바로 앞(화면 아래쪽으로 이웃한) 칸에는 나무 대신 꽃·풀이 나서
 * 집·건물을 가리지 않는다. 그달의 모든 날을 보므로 집을 지어도 옆 나무가 갑자기 사라지지 않는다.
 * 지난 빈 날(지운 날 포함)에는 가끔 꽃이 핀다
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
        if (seed % 5 < 3) kind = isDay(col - 1, row) || isDay(col, row - 1) || isDay(col - 1, row - 1) ? 'flowers' : 'tree'
      } else if (!lot.entry && lot.date < today && seed % 3 === 0) {
        kind = 'flowers'
      }
      if (kind) out.push({ col, row, gx, gy, kind, seed })
    }
  }
  return out
}
