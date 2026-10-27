import { isDate } from './date'
import { isMoodId } from './mood'
import type { Entry, SaveData } from './types'

/**
 * grow_together 와 같은 사이트(github.io)라 localStorage 를 함께 쓴다.
 * 키는 반드시 "diary-village:" 로 시작한다
 */
export const SAVE_KEY = 'diary-village:save'

export interface KV {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const emptySave = (): SaveData => ({ version: 1, entries: [] })

function isEntry(e: unknown): e is Entry {
  if (typeof e !== 'object' || e === null) return false
  const x = e as Record<string, unknown>
  return isDate(x.date) && typeof x.text === 'string' && isMoodId(x.mood) && typeof x.writtenAt === 'number'
}

/** 형식이 맞으면 저장, 아니면 null. 백업 가져오기에도 쓴다 */
export function parseSave(text: string): SaveData | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const x = raw as Record<string, unknown>
  if (x.version !== 1 || !Array.isArray(x.entries) || !x.entries.every(isEntry)) return null
  // 고친 시각이 이상하면 그 칸만 버린다(글은 지킨다)
  const entries = x.entries.map((e: Entry): Entry => {
    const entry: Entry = { date: e.date, text: e.text, mood: e.mood, writtenAt: e.writtenAt }
    if (typeof e.editedAt === 'number' && Number.isFinite(e.editedAt)) entry.editedAt = e.editedAt
    return entry
  })
  if (new Set(entries.map((e) => e.date)).size !== entries.length) return null
  entries.sort((a, b) => a.date.localeCompare(b.date))
  return { version: 1, entries }
}

/** 저장이 깨져 있으면 던진다. 빈 기록으로 덮어써서 일기를 잃지 않게 */
export function loadSave(kv: KV): SaveData {
  const text = kv.getItem(SAVE_KEY)
  if (text == null) return emptySave()
  const save = parseSave(text)
  if (!save) throw new Error('저장된 기록을 읽을 수 없어요')
  return save
}

export function writeSave(kv: KV, save: SaveData): void {
  kv.setItem(SAVE_KEY, JSON.stringify(save))
}
