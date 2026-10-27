import { dayKey } from './date'
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

/** 오늘 한 줄을 쓴다. 하루에 하나뿐이다 */
export function writeEntry(save: SaveData, input: { text: string; mood: MoodId }, now: number): WriteResult {
  const checked = checkText(input.text)
  if (!checked.ok) return checked
  const date = dayKey(now)
  if (entryOn(save, date)) return { ok: false, reason: 'already' }
  const entry: Entry = { date, text: checked.text, mood: input.mood, writtenAt: now }
  const entries = [...save.entries, entry].sort((a, b) => a.date.localeCompare(b.date))
  return { ok: true, save: { ...save, entries }, entry }
}
