import { hasFinal } from './building'
import { DECORS, type DecorId } from './decor'
import { nextLandmark, writtenDays } from './landmark'
import type { Dated } from './types'

export interface Gift {
  id: 'firstSign' | DecorId
  name: string
  icon: string
  /** 누적으로 쓴 날 수가 이만큼이 되면 받는다. 연속 기록은 보지 않고 줄지 않는다 */
  days: number
  /** 꾸밈 소품 선물이면 그 소품. 첫 집 기념 팻말은 기록에서 계산해 저절로 서므로 없다 */
  decor: DecorId | null
}

/**
 * 처음 며칠이 허전하지 않게 첫 주에 자주 주는 선물(1·2·3·5일째, 7일째는 광장 우물).
 * 1일째는 첫 집 옆 기념 팻말, 나머지는 일찍 열리는 꾸밈 소품이다. 글 길이·기분은 보지 않는다
 */
export const FIRST_GIFTS: Gift[] = [
  { id: 'firstSign', name: '기념 팻말', icon: '🪧', days: 1, decor: null },
  ...DECORS.filter((d) => d.days < 7).map((d) => ({ id: d.id, name: d.name, icon: d.icon, days: d.days, decor: d.id })),
]

/** before → after 로 바뀌며 새로 받은 첫 주 선물 */
export function reachedGifts(before: Dated[], after: Dated[]): Gift[] {
  const from = writtenDays(before)
  const to = writtenDays(after)
  return FIRST_GIFTS.filter((g) => g.days > from && g.days <= to)
}

/** 첫 집 기념 팻말이 서는 날(처음 집을 지은 날. 그날 글을 지웠어도 그 자리에 남는다) */
export function firstSignDate(days: Dated[]): string | null {
  if (days.length === 0) return null
  return days.reduce((a, b) => (b.date < a ? b.date : a), days[0].date)
}

const ul = (word: string) => `${word}${hasFinal(word) ? '을' : '를'}`
const ga = (word: string) => `${word}${hasFinal(word) ? '이' : '가'}`

export interface GiftCard {
  title: string
  body: string
  next: string | null
  icons: string[]
  /** "놓으러 가기"로 바로 꾸미기에 들어갈 소품. 기념 팻말만 받았으면 없다 */
  decor: DecorId | null
}

/** 첫 주 선물을 받은 순간의 축하 카드 문구. 선물이 없으면 null */
export function giftCard(gifts: Gift[], days: Dated[]): GiftCard | null {
  if (gifts.length === 0) return null
  const n = writtenDays(days)
  const last = [...gifts].reverse().find((g) => g.decor) ?? null
  const title = gifts.length > 1 ? `🎁 선물 ${gifts.length}개가 왔어요!` : n === 1 ? '🎁 첫 선물이 왔어요!' : '🎁 선물이 왔어요!'
  const parts: string[] = []
  if (gifts.some((g) => g.id === 'firstSign')) parts.push('첫 집을 지었어요. 집 옆에 🪧 기념 팻말을 세웠어요.')
  else parts.push(`한 줄을 ${n}일 남겼어요.`)
  const decors = gifts.filter((g) => g.decor)
  if (decors.length) parts.push(`꾸밈 소품 ${ul(decors.map((g) => `${g.icon} ${g.name}`).join(', '))} 받았어요. 마음에 드는 자리에 놓아 보세요.`)
  const coming = FIRST_GIFTS.find((g) => g.days > n)
  const lm = nextLandmark(days)
  const next = coming
    ? `다음 선물은 ${coming.days - n}일 더 쓰면 ${coming.name}${hasFinal(coming.name) ? '이에요' : '예요'}`
    : lm
      ? `${lm.left}일 더 쓰면 광장에 ${ga(lm.landmark.name)} 생겨요`
      : null
  return { title, body: parts.join(' '), next, icons: gifts.map((g) => g.icon), decor: last?.decor ?? null }
}
