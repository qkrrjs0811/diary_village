/**
 * 말의 메아리: 그날 한 줄에 나온 말을 지난날 글에서 폰 안 단어 찾기로 찾아, 그 말을 쓴 가장 최근 날을 알려 준다.
 * 기록에서 계산하고 저장하지 않는다. 기분·글 길이와 무관하고 마을을 바꾸지 않는다
 */
import { searchEntries } from './search'
import type { Entry } from './types'

export interface Echo {
  /** 메아리가 된 말 */
  word: string
  /** 그 말을 그날 이전에 쓴 가장 최근 날 */
  last: string
  /** 그 말을 그날 이전에 쓴 날 수 */
  days: number
}

/** 너무 흔해 메아리로 쓰지 않는 말 */
const COMMON = new Set([
  '오늘', '어제', '내일', '너무', '정말', '그냥', '진짜', '완전', '엄청', '조금', '많이', '아주', '다시', '이제', '지금',
  '그리고', '그래서', '하지만', '그런데', '근데', '그럼', '우리', '나는', '내가', '저는', '제가', '나도', '같이', '함께',
  '모두', '하루', '아침', '점심', '저녁', '좋다', '좋은', '좋아', '기분', '생각', '시간', '그거', '이거', '저거', '뭔가',
  '정도', '계속', '역시', '오랜만', '드디어', '벌써', '아직', '혼자', '하나', '있다', '없다', '했다', '같다', '싶다',
])

/** 떼는 조사(긴 것부터 본다). 이름 끝에 자주 오는 '이·나·야·아'는 떼지 않는다 */
const PARTICLES = [
  '에서', '에게', '으로', '이랑', '한테', '까지', '부터', '처럼', '보다', '하고', '이나',
  '은', '는', '을', '를', '가', '에', '와', '과', '도', '만', '의', '로', '랑', '께',
]

/** 조사를 뗀 말이 세 글자 이상이고 이렇게 끝나면 풀이말(했다·좋아요·갔는데)이라 쓰지 않는다 */
const PREDICATE = /(다|요|죠|고|서|면|며|지만|는데|니까)$/

/** 조사를 하나 떼고, 남은 말이 두 글자 넘으면 '들'도 뗀다. 떼면 한 글자가 되는 말은 그대로 */
function stem(token: string): string {
  let w = token
  const p = PARTICLES.find((x) => w.endsWith(x) && w.length - x.length >= 2)
  if (p) w = w.slice(0, -p.length)
  if (w.endsWith('들') && w.length >= 3) w = w.slice(0, -1)
  return w
}

/** 한 줄에서 메아리로 쓸 말을 나온 차례대로(같은 말은 한 번) */
export function echoWords(text: string): string[] {
  const out: string[] = []
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!/\p{L}/u.test(raw)) continue
    const w = stem(raw)
    if (w.length >= 3 && PREDICATE.test(w)) continue
    if (w.length < 2 || COMMON.has(w) || out.includes(w)) continue
    out.push(w)
  }
  return out
}

/** 그날 한 줄의 말 가운데 그날 이전 글(한 줄·긴 글)에 나온 첫 말. 그날 글이 없거나 맞는 말이 없으면 undefined */
export function echoOf(entries: readonly Entry[], date: string): Echo | undefined {
  const entry = entries.find((e) => e.date === date)
  if (!entry) return undefined
  const past = entries.filter((e) => e.date < date)
  for (const word of echoWords(entry.text)) {
    const hits = searchEntries(past, word)
    if (hits.length) return { word, last: hits[0].entry.date, days: hits.length }
  }
  return undefined
}

/** 짓는 알림 한 줄 "🔁 '바다' — 9월 3일에도 썼어요". 그날과 해가 다르면 해도 붙인다 */
export function echoNote(echo: Echo, date: string): string {
  const [y, m, d] = echo.last.split('-').map(Number)
  const year = echo.last.slice(0, 4) === date.slice(0, 4) ? '' : `${y}년 `
  return `🔁 '${echo.word}' — ${year}${m}월 ${d}일에도 썼어요`
}

/** 읽기 창 꼬리표: 그날의 메아리 말과 그 말을 쓴 날 수(그날·뒷날 포함, 찾기 창에서 보이는 수와 같다) */
export function echoTag(entries: readonly Entry[], date: string): { word: string; days: number; text: string } | undefined {
  const echo = echoOf(entries, date)
  if (!echo) return undefined
  const days = searchEntries(entries, echo.word).length
  // 받침이 있는 말은 '을'(사진을), 없으면 '를'(바다를)
  const c = echo.word.charCodeAt(echo.word.length - 1) - 0xac00
  const josa = c >= 0 && c < 11172 && c % 28 !== 0 ? '을' : '를'
  return { word: echo.word, days, text: `🔁 '${echo.word}'${josa} 쓴 날 ${days}일` }
}
