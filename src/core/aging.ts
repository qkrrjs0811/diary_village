/** 시간이 쌓이는 집: 지은 날에서 흐른 날 수로 세월(덩굴·담쟁이·둥지)을 정한다. 날짜로만 계산하고 저장하지 않는다 */
import { isDate } from './date'

export type AgingStage = 'none' | 'vine' | 'ivy' | 'nest'

/** 세월이 깃드는 날 수. 앞의 것이 먼저 온다 */
export const AGING_STEPS: readonly { stage: Exclude<AgingStage, 'none'>; days: number }[] = [
  { stage: 'vine', days: 30 },
  { stage: 'ivy', days: 100 },
  { stage: 'nest', days: 365 },
]

const utcDay = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** 지은 날부터 오늘까지 날 수. 미래 날짜나 이상한 값은 0 */
export function houseAge(date: string, today: string): number {
  if (!isDate(date) || !isDate(today)) return 0
  return Math.max(0, utcDay(today) - utcDay(date))
}

/** 집 나이로 정한 세월 단계. 늘기만 하고 기분·글과 무관하다 */
export function agingOf(date: string, today: string): AgingStage {
  const age = houseAge(date, today)
  let stage: AgingStage = 'none'
  for (const s of AGING_STEPS) if (age >= s.days) stage = s.stage
  return stage
}

const AGING_ICON: Record<Exclude<AgingStage, 'none'>, string> = { vine: '🌿', ivy: '🍃', nest: '🪺' }
const TURNED_LINE: Record<Exclude<AgingStage, 'none'>, string> = {
  vine: '지은 지 30일, 오늘 벽에 덩굴이 돋았어요',
  ivy: '지은 지 100일, 오늘 담쟁이가 올랐어요',
  nest: '지은 지 1년, 오늘 처마에 새 둥지가 생겼어요',
}

/** 읽기 창에 보일 집 나이 한 줄. 세월이 깃들기 전(30일 전)에는 말하지 않는다 */
export function agingLine(date: string, today: string): string | null {
  const stage = agingOf(date, today)
  if (stage === 'none') return null
  const turned = agingTurnedToday(date, today)
  if (turned) return `${AGING_ICON[turned]} ${TURNED_LINE[turned]}`
  return `${AGING_ICON[stage]} 지은 지 ${houseAge(date, today)}일 된 집이에요`
}

/** 오늘이 그 집이 단계를 넘는 날(30·100·365일째)이면 그 단계, 아니면 null */
export function agingTurnedToday(date: string, today: string): Exclude<AgingStage, 'none'> | null {
  const age = houseAge(date, today)
  return AGING_STEPS.find((s) => s.days === age)?.stage ?? null
}
