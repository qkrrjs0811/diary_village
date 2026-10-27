import { addDays, dayKey } from './date'
import type { Dated, Entry, Erased, MoodId, SaveData } from './types'

/** 짧게 써도 되는 게 핵심이라 길게 쓸 이유를 만들지 않는다. 글 길이는 마을에 영향을 주지 않는다 */
export const MAX_TEXT = 100

export type TextCheck = { ok: true; text: string } | { ok: false; reason: 'empty' | 'long' }

export function checkText(raw: string): TextCheck {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (text.length === 0) return { ok: false, reason: 'empty' }
  if ([...text].length > MAX_TEXT) return { ok: false, reason: 'long' }
  return { ok: true, text }
}

export function entryOn(save: SaveData, date: string): Entry | undefined {
  return save.entries.find((e) => e.date === date)
}

export type WriteResult = { ok: true; save: SaveData; entry: Entry } | { ok: false; reason: 'empty' | 'long' | 'already' }

/** 늦게 자는 사람을 위해 어제까지는 쓸 수 있다. 어제를 안 썼으면 그 날짜, 아니면 null. 그보다 전은 열지 않는다 */
export function yesterdayOpen(save: SaveData, now: number): string | null {
  const date = addDays(dayKey(now), -1)
  return entryOn(save, date) ? null : date
}

export type Day = 'today' | 'yesterday'

/** 오늘(또는 어제) 한 줄을 쓴다. 하루에 하나뿐이다. writtenAt은 실제로 쓴 시각이다 */
export function writeEntry(save: SaveData, input: { text: string; mood: MoodId }, now: number, day: Day = 'today'): WriteResult {
  const checked = checkText(input.text)
  if (!checked.ok) return checked
  const date = day === 'today' ? dayKey(now) : addDays(dayKey(now), -1)
  if (entryOn(save, date)) return { ok: false, reason: 'already' }
  const entry: Entry = { date, text: checked.text, mood: input.mood, writtenAt: now }
  const entries = [...save.entries, entry].sort((a, b) => a.date.localeCompare(b.date))
  // 지운 날에 다시 쓰면 지운 표시를 걷는다(날 수는 그대로다)
  return { ok: true, save: withErased({ ...save, entries }, (save.erased ?? []).filter((x) => x.date !== date)), entry }
}

function withErased(save: SaveData, erased: Erased[]): SaveData {
  const { erased: _, ...rest } = save
  return erased.length ? { ...rest, erased } : rest
}

export type EraseResult = { ok: true; save: SaveData } | { ok: false; reason: 'missing' }

/**
 * 쓴 글을 지운다(기획서 8번). 확인은 화면에서 한 번 더 받는다.
 * 글은 남기지 않고 날짜와 지운 시각만 남겨, 지운 날도 "집을 지었던 날"로 센다(명소·마을 단계를 빼앗지 않는다)
 */
export function eraseEntry(save: SaveData, date: string, now: number): EraseResult {
  if (!entryOn(save, date)) return { ok: false, reason: 'missing' }
  const entries = save.entries.filter((e) => e.date !== date)
  const erased = [...(save.erased ?? []), { date, erasedAt: now }].sort((a, b) => a.date.localeCompare(b.date))
  return { ok: true, save: { ...save, entries, erased } }
}

/** 집을 지었던 날(쓴 날 + 지운 날). 명소·마을 단계·주민은 이 날 수로 센다 */
export function builtDays(save: SaveData): Dated[] {
  const dates = new Set([...save.entries.map((e) => e.date), ...(save.erased ?? []).map((x) => x.date)])
  return [...dates].sort().map((date) => ({ date }))
}

/**
 * 읽기 창에서 넘겨 볼 바로 앞·뒤 쓴 날. 빈 날·지운 날(entries 에 없음)은 건너뛰고, 없으면 null.
 * 저장 순서와 상관없이 날짜 순서로 본다
 */
export function neighborDays(entries: Dated[], date: string): { prev: string | null; next: string | null } {
  let prev: string | null = null
  let next: string | null = null
  for (const e of entries) {
    if (e.date < date && (prev === null || e.date > prev)) prev = e.date
    if (e.date > date && (next === null || e.date < next)) next = e.date
  }
  return { prev, next }
}

export type EditResult =
  | { ok: true; save: SaveData; entry: Entry; changed: boolean }
  | { ok: false; reason: 'empty' | 'long' | 'missing' }

/** 이미 쓴 날의 글과 기분을 고친다. 날짜와 처음 쓴 시각은 그대로 두고 고친 시각을 남긴다 */
export function editEntry(save: SaveData, date: string, input: { text: string; mood: MoodId }, now: number): EditResult {
  const old = entryOn(save, date)
  if (!old) return { ok: false, reason: 'missing' }
  const checked = checkText(input.text)
  if (!checked.ok) return checked
  if (checked.text === old.text && input.mood === old.mood) return { ok: true, save, entry: old, changed: false }
  const entry: Entry = { ...old, text: checked.text, mood: input.mood, editedAt: now }
  const entries = save.entries.map((e) => (e.date === date ? entry : e))
  return { ok: true, save: { ...save, entries }, entry, changed: true }
}
