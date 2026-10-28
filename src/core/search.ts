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
  /** 긴 글에서 찾았으면 처음 찾은 말 둘레 조각(앞뒤가 잘렸으면 …). 줄바꿈은 빈칸으로 보인다 */
  more?: SearchPart[]
}

/** 긴 글 조각에 남길 찾은 말 앞·뒤 글자 수 */
const SNIPPET_BEFORE = 16
const SNIPPET_AFTER = 32

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

/** 긴 글에서 처음 찾은 말 둘레만 잘라 조각으로 나눈다. 말이 없으면 undefined */
function snippetOf(more: string, words: readonly string[]): SearchPart[] | undefined {
  const flat = more.replace(/\s+/g, ' ')
  const hay = lower(flat)
  const at = Math.min(...words.map((w) => hay.indexOf(w)).filter((i) => i >= 0))
  if (!Number.isFinite(at)) return undefined
  const from = Math.max(0, at - SNIPPET_BEFORE)
  const to = Math.min(flat.length, at + SNIPPET_AFTER)
  const parts = partsOf(flat.slice(from, to), words)
  if (from > 0) parts.unshift({ text: '…', hit: false })
  if (to < flat.length) parts.push({ text: '…', hit: false })
  return parts
}

/** 찾을 말이 모두 들어간 글(한 줄과 긴 글을 함께 본다)을 최근 날부터 */
export function searchEntries(entries: readonly Entry[], query: string): SearchHit[] {
  const words = searchWords(query).map(lower)
  if (!words.length) return []
  return entries
    .filter((e) => words.every((w) => lower(e.text).includes(w) || lower(e.more ?? '').includes(w)))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((entry) => {
      const hit: SearchHit = { entry, parts: partsOf(entry.text, words) }
      const more = entry.more && snippetOf(entry.more, words)
      if (more) hit.more = more
      return hit
    })
}
