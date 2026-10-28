import { blockScenery } from './scenery'
import { seasonOf } from './season'
import { hash, type Village } from './village'
import type { DayPart, WeatherKind } from './weather'

/**
 * 마을 땅의 작은 동물 하나. cell: 앉은 칸(마을 칸 좌표), gx·gy: 칸 안에서 선 자리(소수),
 * face: 바라보는 쪽(1 = 화면 오른쪽), seed: 움직임 박자·털빛을 정하는 고정 난수
 */
export interface Critter {
  kind: 'rabbit' | 'squirrel' | 'butterfly'
  block: string
  cell: { gx: number; gy: number }
  gx: number
  gy: number
  face: 1 | -1
  seed: number
}

/** 칸 안에서 서는 자리: 토끼는 덤불 앞, 다람쥐는 나무 밑동 옆, 나비는 꽃 위 */
const AT: Record<Critter['kind'], [number, number]> = { rabbit: [0.78, 0.86], squirrel: [0.84, 0.66], butterfly: [0.5, 0.5] }

/**
 * 오늘 숲가에 나온 토끼·다람쥐와 꽃 위를 나는 나비. 저장하지 않고 구역 달·오늘 날짜·때·날씨로만 정해
 * 같은 날·때에는 늘 같고 날이 바뀌면 자리가 바뀐다. 쓴 날 수·기분과 무관하다(보상이 아니다).
 * 한 구역에 토끼·다람쥐는 많아야 하나(토끼는 덤불, 다람쥐는 나무 칸), 나비는 많아야 둘(봄·여름 낮, 꽃 핀 칸).
 * 밤과 비 오는 날엔 모두 쉬러 가고, 겨울엔 다람쥐가 겨울잠을 잔다. taken: 소품을 놓은 칸('gx,gy')은 비운다
 */
export function critters(village: Village, today: string, part: DayPart, weather: WeatherKind, taken: Set<string> = new Set()): Critter[] {
  if (part === 'night' || weather === 'rain') return []
  const season = seasonOf(today)
  const flying = part === 'day' && (season === 'spring' || season === 'summer')
  const out: Critter[] = []
  const add = (kind: Critter['kind'], block: string, gx: number, gy: number, seed: number) => {
    const [u, v] = AT[kind]
    out.push({ kind, block, cell: { gx, gy }, gx: gx + u, gy: gy + v, face: seed % 2 ? 1 : -1, seed })
  }
  for (const block of village.blocks) {
    const scenery = blockScenery(block, today).filter((s) => !taken.has(`${s.gx},${s.gy}`))
    const s = hash(`critter:${block.month}:${today}`)
    // 세 구역 중 두 곳쯤에 토끼나 다람쥐 하나
    const woods = scenery.filter((x) => x.kind === 'bush' || (x.kind === 'tree' && season !== 'winter'))
    if (s % 3 !== 0 && woods.length) {
      const w = woods[(s >>> 4) % woods.length]
      add(w.kind === 'bush' ? 'rabbit' : 'squirrel', block.month, w.gx, w.gy, hash(`critter:${block.month}:${today}:${w.gx},${w.gy}`))
    }
    if (!flying) continue
    const flowers = scenery.filter((x) => x.kind === 'flowers')
    const n = Math.min(flowers.length, (s >>> 8) % 3)
    const first = (s >>> 12) % Math.max(1, flowers.length)
    for (let i = 0; i < n; i++) {
      // 꽃 칸을 고르게 건너뛰며 고른다(같은 칸에 둘이 겹치지 않게)
      const f = flowers[(first + Math.floor((i * flowers.length) / n)) % flowers.length]
      add('butterfly', block.month, f.gx, f.gy, hash(`fly:${block.month}:${today}:${i}`))
    }
  }
  return out
}

/** 새 떼 한 마리의 자리(앞장선 새로부터 px, 뒤로 갈수록 dx가 작아진다)와 날갯짓 박자(0~1) */
export interface FlockBird {
  dx: number
  dy: number
  beat: number
}

/** 하늘을 가로지르는 새 떼. y: 화면 위에서 %, dir: 1 = 왼쪽에서 오른쪽, delay: 날아가기 시작을 늦추는 정도(0~1) */
export interface Flock {
  y: number
  dir: 1 | -1
  delay: number
  birds: FlockBird[]
}

/**
 * 오늘 하늘을 가로지르는 새 떼(ㅅ자 3~5마리). 날짜로만 정해 사흘 중 이틀쯤 날아가고,
 * 밤과 비 오는 날에는 없다. 해·구름 높이(화면 위쪽)를 지나 마을을 가리지 않는다
 */
export function birdFlock(date: string, part: DayPart, weather: WeatherKind): Flock | null {
  if (part === 'night' || weather === 'rain') return null
  const h = hash(`birds:${date}`)
  if (h % 3 === 0) return null
  const count = 3 + ((h >>> 3) % 3)
  const birds = Array.from({ length: count }, (_, i): FlockBird => {
    const k = Math.ceil(i / 2)
    const side = i % 2 ? -1 : 1
    return { dx: -k * 13, dy: k === 0 ? 0 : side * k * 7, beat: ((h >>> (i * 3 + 5)) % 10) / 10 }
  })
  return { y: 8 + ((h >>> 6) % 21), dir: (h >>> 11) % 2 ? 1 : -1, delay: ((h >>> 13) % 101) / 100, birds }
}
