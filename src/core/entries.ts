import { addDays, dayKey } from './date'
import type { Entry, MoodId, SaveData } from './types'

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
  return { ok: true, save: { ...save, entries }, entry }
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
