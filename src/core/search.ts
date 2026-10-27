/** 단어로 지난 글 찾기. 글은 폰 안에서 단어 찾기로만 읽고, 찾은 것도 저장하지 않는다 */
import type { Entry } from './types'

export interface SearchPart {
  text: string
  hit: boolean
}

export interface SearchHit {
  entry: Entry
  /** 글을 찾은 말이 있는 곳과 없는 곳으로 나눈 조각 */
  parts: SearchPart[]
}

/** 찾을 말을 띄어쓰기로 나눈다. 빈 말은 버린다 */
export function searchWords(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean)
}

/** 영어 대소문자를 가리지 않게 낮춘다. 길이가 바뀌는 글자가 있으면 그대로 둔다(조각 자리가 어긋나지 않게) */
function lower(s: string): string {
  const l = s.toLowerCase()
  return l.length === s.length ? l : s
}

/** 찾은 말이 있는 곳을 표시해 조각으로 나눈다 */
function partsOf(text: string, words: readonly string[]): SearchPart[] {
  const hay = lower(text)
  const mark = Array<boolean>(text.length).fill(false)
  for (const w of words) {
    for (let i = hay.indexOf(w); i >= 0; i = hay.indexOf(w, i + 1)) mark.fill(true, i, i + w.length)
  }
  const parts: SearchPart[] = []
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1]
    if (last && last.hit === mark[i]) last.text += text[i]
    else parts.push({ text: text[i], hit: mark[i] })
  }
  return parts
}

/** 찾을 말이 모두 들어간 글을 최근 날부터 */
export function searchEntries(entries: readonly Entry[], query: string): SearchHit[] {
  const words = searchWords(query).map(lower)
  if (!words.length) return []
  return entries
    .filter((e) => words.every((w) => lower(e.text).includes(w)))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((entry) => ({ entry, parts: partsOf(entry.text, words) }))
}
