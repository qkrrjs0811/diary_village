// 구역 이름표("10월") 팻말 높이: 팻말 둘레에 선 집 지붕보다 조금만 위로. 기록에서 계산하고 저장하지 않는다
import { BLOCK_H, BLOCK_W, ROAD, houseLook, type Block, type Village } from './village'
import { buildingOf } from './building'
import type { Entry } from './types'

/** 팻말판 아래 끝이 땅에서 뜬 가장 짧은 높이(빈 구역) */
export const SIGN_MIN = 24
/** 가장 높은 높이: 뒤쪽 모서리 첫 칸의 등대도 비키는 예전 높이 */
export const SIGN_MAX = 62
/** 팻말판 높이 */
export const SIGN_H = 18
/** 지붕과 팻말판 사이 여유 */
const GAP = 3
/** 칸 하나의 화면 크기(render.ts의 TW·TH와 같다) */
const TW = 48
const TH = 24
/** 집 그림이 칸 가운데에서 옆으로 퍼지는 폭(바깥 탁자·화분까지)과 아래로 내려가는 폭 */
const HALF_W = 28
const BELOW = 8

/** 집 그림이 칸 가운데에서 위로 닿는 높이(px). render.ts의 누르기 칸 높이(등대 70, 그 밖 층마다 17 + 26)에 칸 뒤 모서리까지 12를 더한다 */
export function signReach(entry: Entry): number {
  if (buildingOf(entry)?.id === 'lighthouse') return 82
  return 17 * houseLook(entry).floors + 26 + 12
}

const at = (gx: number, gy: number) => ({ x: ((gx - gy) * TW) / 2, y: ((gx + gy) * TH) / 2 })

/**
 * 구역 뒤쪽 모서리 팻말의 높이(팻말판 아래 끝이 땅에서 뜬 px). width는 팻말판 폭(달 이름을 붙이면 넓어진다).
 * 제 구역 집 지붕은 꼭 비키고, 뒤 구역 집은 비킬 수 있는 만큼 덜 가리는 가장 낮은 높이를 고른다
 */
export function signLift(village: Village, block: Block, width: number): number {
  const foot = at(block.bx * (BLOCK_W + ROAD) - ROAD / 2, block.by * (BLOCK_H + ROAD) - ROAD / 2)
  const left = foot.x - width / 2
  const right = foot.x + width / 2
  const boxes = village.blocks.flatMap((b) =>
    b.lots
      .filter((l) => l.entry)
      .map((l) => {
        const c = at(l.gx + 0.5, l.gy + 0.5)
        return { own: b === block, x0: c.x - HALF_W, x1: c.x + HALF_W, y0: c.y - signReach(l.entry!) - GAP, y1: c.y + BELOW + GAP }
      })
      .filter((h) => h.x0 < right && left < h.x1),
  )
  let best = SIGN_MAX
  let bestCost = Infinity
  for (let lift = SIGN_MIN; lift <= SIGN_MAX; lift++) {
    const top = foot.y - lift - SIGN_H
    const bottom = foot.y - lift
    let cost = 0
    for (const h of boxes) {
      const over = Math.max(0, Math.min(bottom, h.y1) - Math.max(top, h.y0))
      cost += h.own ? over * 1000 : over
    }
    if (cost < bestCost) {
      best = lift
      bestCost = cost
      if (cost === 0) break
    }
  }
  return best
}
