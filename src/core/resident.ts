import { buildingInfo, buildingOf, hasFinal } from './building'
import { PLAZA, writtenDays } from './landmark'
import { BLOCK_H, BLOCK_W, ROAD, hash, type Block, type Village } from './village'
import type { Entry } from './types'

export type Ears = 'none' | 'bunny' | 'bear' | 'cat' | 'leaf'

export interface Resident {
  id: string
  name: string
  /** 누적으로 쓴 날 수가 이만큼이 되면 마을에 온다 */
  days: number
  color: string
  ears: Ears
}

const COLORS = ['#ffd1dc', '#ffe6a7', '#c9e8c0', '#cfe3f7', '#e5d4f5', '#ffd8b8', '#fff4e6']
const EARS: Ears[] = ['bunny', 'none', 'bear', 'cat', 'leaf']
const ROSTER: [string, string, number][] = [
  ['kong', '콩이', 1],
  ['momo', '모모', 3],
  ['bori', '보리', 5],
  ['dubu', '두부', 7],
  ['hodu', '호두', 10],
  ['somi', '솜이', 14],
  ['gomi', '꼬미', 20],
  ['dalle', '달래', 25],
  ['gamja', '감자', 30],
  ['dotori', '도토리', 40],
  ['nabi', '나비', 50],
  ['gureum', '구름', 60],
  ['sagwa', '사과', 70],
  ['byeol', '별이', 85],
  ['danchu', '단추', 100],
  ['maru', '마루', 120],
  ['haru', '하루', 140],
  ['mango', '망고', 160],
  ['mongsil', '몽실', 180],
  ['pori', '포리', 200],
  ['choco', '초코', 250],
  ['ssuk', '쑥이', 300],
  ['donggeul', '동글이', 365],
]

/**
 * 쌓일수록 마을이 자란다(기획서 6번). 둥근 주민이 누적 날 수에 따라 한 명씩 온다.
 * 기분·글 길이·연속 기록은 보지 않고, 글은 지워지지 않으니 주민도 떠나지 않는다
 */
export const RESIDENTS: Resident[] = ROSTER.map(([id, name, days], i) => ({
  id,
  name,
  days,
  color: COLORS[i % COLORS.length],
  ears: EARS[i % EARS.length],
}))

export function residentsOf(entries: Entry[]): Resident[] {
  const n = writtenDays(entries)
  return RESIDENTS.filter((r) => r.days <= n)
}

export type Spot = { gx: number; gy: number }

/** 주민이 오가는 한 칸 길(from ↔ to). depth 는 마을 그림에서 앞뒤를 정하는 값 */
export interface Walk {
  resident: Resident
  from: Spot
  to: Spot
  depth: number
}

type Lane = { from: Spot; to: Spot }

const lane = (from: Spot, to: Spot): Lane => ({ from, to })

/**
 * 구역 앞쪽 두 길(왼쪽 앞, 오른쪽 앞)의 한 칸씩. 집 자리(구역 안)를 지나지 않는다.
 * 뒤쪽 길은 집에 가려지므로 쓰지 않는다. 고르게 퍼지도록 순서를 섞는다
 */
function blockLanes(b: Block): Lane[] {
  const gx0 = b.bx * (BLOCK_W + ROAD)
  const gy0 = b.by * (BLOCK_H + ROAD)
  const front = gy0 + BLOCK_H + ROAD / 4
  const right = gx0 + BLOCK_W + ROAD / 4
  const left = [2, 5, 0, 4, 1, 6, 3].map((k) => lane({ gx: gx0 + k, gy: front }, { gx: gx0 + k + 1, gy: front }))
  const side = [2, 0, 4, 1, 5, 3].map((r) => lane({ gx: right, gy: gy0 + r }, { gx: right, gy: gy0 + r + 1 }))
  const out: Lane[] = []
  for (let i = 0; i < left.length; i++) {
    out.push(left[i])
    if (side[i]) out.push(side[i])
  }
  return out
}

/** 광장의 빈 돌길(명소 자리를 피한다) */
function plazaLanes(): Lane[] {
  const at = (u: number, v: number): Spot => ({ gx: PLAZA.gx + u, gy: PLAZA.gy + v })
  return [lane(at(1, 3), at(2, 3)), lane(at(4, 3), at(5, 3)), lane(at(3.5, 4), at(3.5, 5))]
}

/**
 * 주민마다 걷는 길을 정한다. 첫 주민은 가장 최근 구역(오늘 자리 근처), 다음은 광장,
 * 그다음은 오래된 구역 순으로 돌아가며 하나씩 고른다. 길이 모자라면 남는 주민은 빠진다
 */
export function residentWalks(village: Village, residents: Resident[]): Walk[] {
  const blocks = [...village.blocks].reverse()
  const queues = [blockLanes(blocks[0] ?? { month: '', bx: 0, by: 0, lots: [] }), plazaLanes(), ...blocks.slice(1).map(blockLanes)]
  const lanes: Lane[] = []
  for (let i = 0; queues.some((q) => i < q.length); i++) for (const q of queues) if (i < q.length) lanes.push(q[i])
  return residents.slice(0, lanes.length).map((resident, i) => {
    const { from, to } = lanes[i]
    // 길 한 칸 가운데를 기준으로, 뒤 칸 집보다 뒤에·앞 칸 집보다 먼저 그린다
    const depth = (from.gx + to.gx) / 2 + (from.gy + to.gy) / 2 - 0.25
    return { resident, from, to, depth }
  })
}

/** 주민을 누르면 하는 짧은 한마디. tap 은 지금까지 누른 횟수(0부터) */
export function residentLine(r: Resident, entries: Entry[], today: string, tap: number): string {
  if (tap === 0) {
    const todays = entries.find((x) => x.date === today)
    if (!todays) return '오늘은 어떤 하루였어요?'
    const b = buildingOf(todays)
    return b ? `새로 생긴 ${buildingInfo(b.id).name}에 가 봤어요!` : '오늘 지은 집, 참 예뻐요.'
  }
  const lines = [
    `한 줄이 ${writtenDays(entries)}일 쌓였어요.`,
    `저는 ${r.name}${hasFinal(r.name) ? '이에요' : '예요'}. 반가워요!`,
    '짧게 써도 충분해요.',
    '천천히 산책하는 중이에요.',
    '빈 날엔 꽃이 피어요.',
  ]
  return lines[(tap - 1 + hash(r.id)) % lines.length]
}
