/** 한 달 돌아보기: 지난달의 기분 색 띠와 가장 많이 나온 건물. 기록에서 계산하고 저장하지 않는다 */
import { buildingOf, type BuildingId } from './building'
import { calendarMonth, shiftMonth } from './calendar'
import { monthKey } from './date'
import type { Entry, MoodId } from './types'

/** 새 달이 시작되고 이 날까지 홈에서 지난달을 돌아본다 */
export const RECAP_DAYS = 7

export interface MonthRecap {
  month: string
  /** "9월" */
  label: string
  /** 그달 쓴 날 수(지운 날은 빼고) */
  written: number
  /** 기분마다 쓴 날 수. 많은 것부터 */
  moods: { mood: MoodId; count: number }[]
  /** 가장 많이 지은 건물. 같으면 그달 먼저 나온 것. 건물이 하나도 없으면 null */
  top: { id: BuildingId; count: number } | null
}

export function monthRecap(entries: readonly Entry[], month: string): MonthRecap {
  const { written, moods } = calendarMonth(entries, [], month, '9999-12-31')
  const counts = new Map<BuildingId, number>()
  const inMonth = entries.filter((e) => monthKey(e.date) === month).sort((a, b) => (a.date < b.date ? -1 : 1))
  for (const e of inMonth) {
    const b = buildingOf(e)
    if (b) counts.set(b.id, (counts.get(b.id) ?? 0) + 1)
  }
  let top: MonthRecap['top'] = null
  for (const [id, count] of counts) if (!top || count > top.count) top = { id, count }
  return { month, label: `${Number(month.slice(5))}월`, written, moods, top }
}

/** 새 달 첫 7일 동안 지난달 돌아보기. 지난달에 쓴 날이 없으면 null */
export function recapOf(entries: readonly Entry[], today: string): MonthRecap | null {
  if (Number(today.slice(8)) > RECAP_DAYS) return null
  const r = monthRecap(entries, shiftMonth(monthKey(today), -1))
  return r.written ? r : null
}
