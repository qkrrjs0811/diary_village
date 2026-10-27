import { hasFinal } from './building'
import { celebration, writtenDays, type Landmark } from './landmark'
import type { Dated } from './types'

export interface Stage {
  name: string
  icon: string
  /** 누적으로 쓴 날 수가 이만큼이 되면 이 단계가 된다 */
  days: number
}

/**
 * 마을 단계(기획서 6번). 기준은 누적 날 수라서 내려가지 않는다.
 * 글 길이·기분·연속 기록은 보지 않는다. 일부는 명소와 같은 날 올라 한 카드에 함께 축하한다
 */
export const STAGES: Stage[] = [
  { name: '작은 동네', icon: '🏡', days: 0 },
  { name: '마을', icon: '🏘️', days: 10 },
  { name: '큰 마을', icon: '🌳', days: 30 },
  { name: '읍내', icon: '🎪', days: 60 },
  { name: '큰 읍내', icon: '🎡', days: 120 },
  { name: '고을', icon: '🏯', days: 200 },
  { name: '동화 나라', icon: '✨', days: 365 },
]

export function stageOf(entries: Dated[]): Stage {
  const n = writtenDays(entries)
  return [...STAGES].reverse().find((s) => s.days <= n)!
}

export function nextStage(entries: Dated[]): { stage: Stage; left: number } | null {
  const n = writtenDays(entries)
  const stage = STAGES.find((s) => s.days > n)
  return stage ? { stage, left: stage.days - n } : null
}

/** before → after 로 바뀌며 새로 오른 단계 */
export function reachedStages(before: Dated[], after: Dated[]): Stage[] {
  const from = writtenDays(before)
  const to = writtenDays(after)
  return STAGES.filter((s) => s.days > from && s.days <= to)
}

/** 머리줄에 보이는 지금 단계("🏡 작은 동네") */
export function stageLabel(entries: Dated[]): string {
  const s = stageOf(entries)
  return `${s.icon} ${s.name}`
}

const ga = (word: string) => `${word}${hasFinal(word) ? '이' : '가'}`
/** 받침이 없거나 ㄹ 받침이면 '로', 아니면 '으로' */
function ro(word: string): string {
  const c = word.charCodeAt(word.length - 1) - 0xac00
  return `${word}${hasFinal(word) && c % 28 !== 8 ? '으로' : '로'}`
}

export interface MilestoneCard {
  title: string
  body: string
  next: string | null
  icons: string[]
  /** "보러 가기"로 갈 명소. 단계만 올랐으면 없다 */
  visit: Landmark | null
}

/** 명소가 생기거나 단계가 오른 순간의 축하 카드 문구. 둘 중 하나는 비어 있지 않다 */
export function milestoneCard(landmarks: Landmark[], stages: Stage[], entries: Dated[]): MilestoneCard {
  const visit = landmarks.length ? landmarks[landmarks.length - 1] : null
  const lm = landmarks.length ? celebration(landmarks, entries) : null
  if (stages.length === 0) return { ...lm!, icons: landmarks.map((l) => l.icon), visit }
  const to = stages[stages.length - 1]
  const from = STAGES[STAGES.indexOf(stages[0]) - 1]
  let body = `한 줄을 ${writtenDays(entries)}일 남겼어요. ${ga(from.name)} ${ro(to.name)} 자랐어요.`
  if (lm) body += lm.body.slice(lm.body.indexOf('.') + 1)
  const n = nextStage(entries)
  const next = lm ? lm.next : n ? `다음은 ${n.left}일 더 쓰면 ${ga(n.stage.name)} 돼요` : null
  return { title: `${to.icon} ${ga(to.name)} 되었어요!`, body, next, icons: [to.icon, ...landmarks.map((l) => l.icon)], visit }
}
