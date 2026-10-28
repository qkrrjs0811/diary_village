import { buildingOf, hasFinal } from './building'
import type { Entry } from './types'
import { hash } from './village'

export type YardTraceId =
  | 'bicycle'
  | 'laundry'
  | 'umbrella'
  | 'kite'
  | 'snowman'
  | 'basket'
  | 'mail'
  | 'chairs'
  | 'hammock'
  | 'shoes'

export interface YardTrace {
  id: YardTraceId
  /** 화면에 보이는 이름 */
  name: string
  /** 알림에 쓰는 그림 글자 */
  icon: string
  /** 알림 끝말("마당에 연이 떴어요") */
  verb: string
  /** 글에서 찾는 말. 건물 말처럼 글 안에 들어 있기만 하면 맞는다 */
  words: string[]
}

/**
 * 건물이 서지 않은 보통 집 마당에 남는 작은 흔적(피드백 2026-10-28).
 * 한 줄에 나온 말로 고른다. 어떤 흔적도 다른 흔적보다 좋지 않고, 기분·글 길이와 무관하다.
 * '자전거'는 운동장 말이라 여기선 따릉이·킥보드로 찾는다
 */
export const YARD_TRACES: YardTrace[] = [
  { id: 'bicycle', name: '자전거', icon: '🚲', verb: '놓였어요', words: ['따릉이', '킥보드', '퀵보드', '페달', '바이크', 'bike'] },
  { id: 'laundry', name: '빨랫줄', icon: '👕', verb: '걸렸어요', words: ['빨래', '빨랫', '세탁', '이불', '청소', '정리'] },
  {
    id: 'umbrella',
    name: '우산',
    icon: '☂️',
    verb: '놓였어요',
    words: ['우산', '장마', '소나기', '빗소리', '빗길', '비가 오', '비가 와', '비가 내', '비가오', '비가와', '비가내', '비 오', '비 와', '비오는', '비와서'],
  },
  { id: 'kite', name: '연', icon: '🪁', verb: '떴어요', words: ['바람', '연날리기', '연을 날', '태풍'] },
  {
    id: 'snowman',
    name: '눈사람',
    icon: '⛄',
    verb: '섰어요',
    words: ['눈사람', '첫눈', '함박눈', '눈싸움', '눈썰매', '눈이 오', '눈이 와', '눈이 왔', '눈이 내', '눈이 쌓', '눈 오', '눈 와', '눈 왔'],
  },
  { id: 'basket', name: '장바구니', icon: '🧺', verb: '놓였어요', words: ['장바구니', '마트', '시장', '쇼핑', '장보', '장을 봤', '편의점'] },
  { id: 'mail', name: '우편함', icon: '📮', verb: '섰어요', words: ['편지', '택배', '소포', '우체국', '엽서'] },
  { id: 'chairs', name: '의자 두 개', icon: '🪑', verb: '놓였어요', words: ['친구', '만났', '수다', '통화', '가족', '엄마', '아빠', '동생', '언니', '누나', '오빠'] },
  { id: 'hammock', name: '해먹', icon: '💤', verb: '걸렸어요', words: ['낮잠', '늦잠', '잠을', '잠이', '잤', '푹 쉬', '쉬었', '휴식', '뒹굴'] },
  { id: 'shoes', name: '신발', icon: '👟', verb: '놓였어요', words: ['신발', '운동화', '걸었', '걷기', '만보', '걸어서'] },
]

/** 흔적 말이 들어 있지만 다른 뜻인 말. 찾기 전에 지운다(자리는 그대로 둔다) */
const NOT_WORDS = [
  // '비가 오'를 품는 '준비가 오래' 등
  '준비', '낭비', '경비', '소비', '장비', '설비', '대비', '회비', '학비', '식비', '예비', '비비',
  '스마트', '청소년', '바람직', '는 바람에', '던 바람에', '한 바람에',
  '전화를 걸었', '전화 걸었', '말을 걸었', '기대를 걸었', '정리해고',
]

/** 흔적 하나. word: 글에서 찾은 말. 맞는 말이 없어 날짜로 고른 흔적이면 없다 */
export interface YardMatch {
  id: YardTraceId
  word?: string
}

/** 맞는 말이 없을 때 날짜로 고르는 조용한 흔적. 이 차례에 없는 칸은 "흔적 없음" */
const QUIET: (YardTraceId | null)[] = ['laundry', 'mail', 'basket', null, null, null]

/** 글에서 흔적 말을 찾는다. 글에서 먼저 나온 말이 이기고, 같은 자리면 더 긴 말, 그래도 같으면 목록 순서 */
export function findYardTrace(text: string): YardMatch | null {
  let hay = text.toLowerCase()
  for (const not of NOT_WORDS) hay = hay.split(not).join(' '.repeat(not.length))
  let best: { id: YardTraceId; word: string; at: number } | null = null
  for (const t of YARD_TRACES) {
    for (const word of t.words) {
      const at = hay.indexOf(word)
      if (at < 0) continue
      if (!best || at < best.at || (at === best.at && word.length > best.word.length)) best = { id: t.id, word, at }
    }
  }
  return best && { id: best.id, word: best.word }
}

/**
 * 그날 마당 흔적. 건물이 서면 없다. 한 줄에서만 찾고(더 쓴 글은 보지 않는다), 맞는 말이 없으면
 * 날짜로 고른 작은 흔적이거나 없다. 기록에서 계산하므로 글을 고치면 따라 바뀐다
 */
export function yardOf(entry: Entry): YardMatch | null {
  if (buildingOf(entry)) return null
  const found = findYardTrace(entry.text)
  if (found) return found
  const id = QUIET[hash(`yard:${entry.date}`) % QUIET.length]
  return id ? { id } : null
}

export function yardTraceInfo(id: YardTraceId): YardTrace {
  return YARD_TRACES.find((t) => t.id === id)!
}

/** 읽기 창에 보이는 한 줄. 찾은 말이 있을 때만 알려 준다(날짜로 고른 흔적은 조용히 둔다) */
export function yardNote(match: YardMatch | null): string | null {
  if (!match?.word) return null
  const t = yardTraceInfo(match.id)
  return `${t.icon} '${match.word}'${hasFinal(match.word) ? '을' : '를'} 찾아 마당에 ${t.name}${hasFinal(t.name) ? '이' : '가'} ${t.verb}`
}
