import { hasFinal } from './building'
import { writtenDays } from './landmark'
import type { Dated } from './types'

export type DecorId =
  | 'pot'
  | 'bench'
  | 'flowerbed'
  | 'lamp'
  | 'mailbox'
  | 'fence'
  | 'pond'
  | 'birdhouse'
  | 'sunflower'
  | 'roseArch'
  | 'bulbs'
  | 'tent'

export interface Decor {
  id: DecorId
  name: string
  icon: string
  /** 누적으로 쓴 날 수가 이만큼이 되면 열린다. 연속 기록은 보지 않고 줄지 않는다 */
  days: number
}

/**
 * 내 손으로 꾸미는 꾸밈 소품(기획서 M4). 쓴 날이 쌓이면 하나씩 열린다.
 * 명소·마을 단계가 서는 날(7·10·14·30·50·60…)과 겹치지 않게 그 사이사이에 둔다.
 * 앞의 셋은 처음 며칠이 허전하지 않게 주는 첫 주 선물(2·3·5일째, `gift.ts`)이다. 날 수는 앞당기기만 해 이미 연 소품을 빼앗지 않는다.
 * 글 길이·기분은 보지 않는다
 */
export const DECORS: Decor[] = [
  { id: 'pot', name: '화분', icon: '🪴', days: 2 },
  { id: 'bench', name: '벤치', icon: '🪑', days: 3 },
  { id: 'flowerbed', name: '꽃밭', icon: '🌼', days: 5 },
  { id: 'lamp', name: '가로등', icon: '🏮', days: 9 },
  { id: 'mailbox', name: '우체통', icon: '📮', days: 11 },
  { id: 'fence', name: '울타리', icon: '🪵', days: 16 },
  { id: 'pond', name: '연못', icon: '🐟', days: 21 },
  { id: 'birdhouse', name: '새집', icon: '🐦', days: 26 },
  { id: 'sunflower', name: '해바라기', icon: '🌻', days: 35 },
  { id: 'roseArch', name: '장미 아치', icon: '🌹', days: 45 },
  { id: 'bulbs', name: '꼬마 전구', icon: '💡', days: 65 },
  { id: 'tent', name: '작은 텐트', icon: '⛺', days: 90 },
]

export function isDecorId(x: unknown): x is DecorId {
  return DECORS.some((d) => d.id === x)
}

export function unlockedDecors(entries: Dated[]): Decor[] {
  const n = writtenDays(entries)
  return DECORS.filter((d) => d.days <= n)
}

export function nextDecor(entries: Dated[]): { decor: Decor; left: number } | null {
  const n = writtenDays(entries)
  const decor = DECORS.find((d) => d.days > n)
  return decor ? { decor, left: decor.days - n } : null
}

/** before → after 로 바뀌며 새로 열린 소품 */
export function reachedDecors(before: Dated[], after: Dated[]): Decor[] {
  const from = writtenDays(before)
  const to = writtenDays(after)
  return DECORS.filter((d) => d.days > from && d.days <= to)
}

/** 수첩에 보이는 소품 목록. 아직 안 열린 소품은 몇 일 더 쓰면 열리는지 */
export function decorBook(entries: Dated[]): { decor: Decor; unlocked: boolean; left: number }[] {
  const n = writtenDays(entries)
  return DECORS.map((decor) => ({ decor, unlocked: decor.days <= n, left: Math.max(0, decor.days - n) }))
}

/** 한 줄을 써서 소품이 열렸을 때 마을 아래에 잠깐 보이는 알림. 없으면 null */
export function decorNote(reached: Decor[]): string | null {
  if (reached.length === 0) return null
  if (reached.length > 1) return `🎁 꾸밈 소품 ${reached.length}개가 열렸어요`
  const d = reached[0]
  return `${d.icon} 꾸밈 소품 ${d.name}${hasFinal(d.name) ? '이' : '가'} 열렸어요`
}
