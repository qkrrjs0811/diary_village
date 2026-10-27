import { entryOn } from './entries'
import type { Entry, SaveData } from './types'

export type TreasureResult = { ok: true; save: SaveData; treasured: boolean } | { ok: false; reason: 'missing' }

/**
 * 그날을 소중한 날로 표시하거나 푼다. 사용자가 직접 정한 것이라 그날 기록의 칸 하나로 둔다.
 * 표시해도 건물·명소·단계 같은 보상은 없다. 푼 날은 칸을 남기지 않는다
 */
export function toggleTreasured(save: SaveData, date: string): TreasureResult {
  const old = entryOn(save, date)
  if (!old) return { ok: false, reason: 'missing' }
  const treasured = !old.treasured
  const { treasured: _, ...rest } = old
  const entry: Entry = treasured ? { ...rest, treasured: true } : rest
  const entries = save.entries.map((e) => (e.date === date ? entry : e))
  return { ok: true, save: { ...save, entries }, treasured }
}

export function isTreasured(save: SaveData, date: string): boolean {
  return entryOn(save, date)?.treasured === true
}

/** 소중한 날만 날짜 순으로. 지운 날은 글이 없어 들어가지 않는다 */
export function treasuredDays(save: SaveData): Entry[] {
  return save.entries.filter((e) => e.treasured === true).sort((a, b) => a.date.localeCompare(b.date))
}
