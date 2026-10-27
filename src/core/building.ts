import type { Entry } from './types'

export type BuildingId =
  | 'cafe'
  | 'bookstore'
  | 'field'
  | 'catHouse'
  | 'dogHouse'
  | 'flowerShop'
  | 'bakery'
  | 'lighthouse'
  | 'musicHall'
  | 'cinema'

export interface Building {
  id: BuildingId
  /** 화면에 보이는 이름 */
  name: string
  /** 간판·알림에 쓰는 그림 글자 */
  icon: string
  /** 글에서 찾는 말. 한국어는 조사가 붙으므로 글 안에 들어 있기만 하면 맞는다. 영어는 소문자로 적는다 */
  words: string[]
}

/**
 * 글 내용이 마을을 만든다(기획서 3번). 글은 폰 안에서 단어 찾기로만 읽는다.
 * 어떤 건물도 다른 건물보다 좋지 않다. 기분·글 길이는 건물을 바꾸지 않는다
 */
export const BUILDINGS: Building[] = [
  { id: 'cafe', name: '카페', icon: '☕', words: ['커피', '카페', '라떼', '아메리카노', 'coffee', 'cafe'] },
  { id: 'bookstore', name: '책방', icon: '📚', words: ['책방', '서점', '도서관', '독서', '소설', '책'] },
  { id: 'field', name: '운동장', icon: '⚽', words: ['운동', '달리기', '러닝', '조깅', '축구', '농구', '헬스', '요가', '수영'] },
  { id: 'catHouse', name: '고양이 집', icon: '🐱', words: ['고양이', '냥이', '야옹'] },
  { id: 'dogHouse', name: '강아지 집', icon: '🐶', words: ['강아지', '댕댕이', '멍멍'] },
  { id: 'flowerShop', name: '꽃집', icon: '💐', words: ['꽃집', '꽃', '장미', '튤립', '해바라기'] },
  { id: 'bakery', name: '빵집', icon: '🥐', words: ['빵집', '빵', '베이커리', '케이크', '쿠키', '크루아상'] },
  { id: 'lighthouse', name: '등대', icon: '🌊', words: ['바다', '바닷가', '등대', '해변', '파도'] },
  { id: 'musicHall', name: '음악당', icon: '🎵', words: ['음악', '노래', '공연', '콘서트', '피아노'] },
  { id: 'cinema', name: '영화관', icon: '🎬', words: ['영화', '극장', '팝콘'] },
]

/** 건물 단어가 들어 있지만 다른 뜻인 말. 찾기 전에 지운다(자리는 그대로 둔다) */
const NOT_WORDS = ['산책', '책임', '대책', '자책', '책망', '빵점', '빵빵', '꽃게']

export interface BuildingMatch {
  id: BuildingId
  /** 글에서 찾은 말(단어 목록에 적힌 모양) */
  word: string
}

/**
 * 글에서 건물을 정한다. 맞는 말이 없으면 null(날짜마다 모양이 다른 보통 집).
 * 여러 개가 맞으면 글에서 먼저 나온 말이 이기고, 같은 자리면 더 긴 말, 그래도 같으면 목록 순서
 */
export function findBuilding(text: string): BuildingMatch | null {
  let hay = text.toLowerCase()
  for (const not of NOT_WORDS) hay = hay.split(not).join(' '.repeat(not.length))
  let best: (BuildingMatch & { at: number }) | null = null
  for (const b of BUILDINGS) {
    for (const word of b.words) {
      const at = hay.indexOf(word)
      if (at < 0) continue
      if (!best || at < best.at || (at === best.at && word.length > best.word.length)) best = { id: b.id, word, at }
    }
  }
  return best && { id: best.id, word: best.word }
}

/** 그날 건물. 기록에서 계산하므로 글을 고치면 따라 바뀐다 */
export function buildingOf(entry: Entry): BuildingMatch | null {
  return findBuilding(entry.text)
}

export function buildingInfo(id: BuildingId): Building {
  return BUILDINGS.find((b) => b.id === id)!
}

/** 마지막 글자에 받침이 있으면 true(한글이 아니면 false) */
export function hasFinal(word: string): boolean {
  const c = word.charCodeAt(word.length - 1) - 0xac00
  return c >= 0 && c < 11172 && c % 28 !== 0
}

/** 지은 뒤 알려 주는 말. 보통 집이면 null */
export function buildingNote(match: BuildingMatch | null): string | null {
  if (!match) return null
  const b = buildingInfo(match.id)
  return `${b.icon} '${match.word}'${hasFinal(match.word) ? '을' : '를'} 찾아 ${b.name}${hasFinal(b.name) ? '이' : '가'} 생겼어요`
}
