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

export interface YearRecap {
  year: number
  /** "2026년" */
  label: string
  /** 그해 쓴 날 수(지운 날은 빼고) */
  written: number
  /** 1월부터 12월까지. mood는 그달 가장 많이 고른 기분(같으면 기분 목록 순서), 쓴 날이 없으면 null */
  months: { month: string; label: string; written: number; mood: MoodId | null }[]
  /** 그해 가장 많이 지은 건물. 같으면 그해 먼저 나온 것. 건물이 하나도 없으면 null */
  top: { id: BuildingId; count: number } | null
  /** 그해 처음 만난 건물 종류. 만난 순서대로 */
  firstFound: BuildingId[]
  /** 그해 첫 한 줄 날짜. 없으면 null */
  firstDate: string | null
}

/** 한 해 돌아보기: 열두 달 한 달 돌아보기를 모은다. 기분·글 길이로 좋고 나쁨을 매기지 않는다 */
export function yearRecap(entries: readonly Entry[], year: number): YearRecap {
  const y = String(year)
  const months = Array.from({ length: 12 }, (_, i) => {
    const r = monthRecap(entries, `${y}-${String(i + 1).padStart(2, '0')}`)
    return { month: r.month, label: r.label, written: r.written, mood: r.moods[0]?.mood ?? null }
  })
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1))
  const seen = new Set<BuildingId>()
  const counts = new Map<BuildingId, number>()
  const firstFound: BuildingId[] = []
  let firstDate: string | null = null
  for (const e of sorted) {
    if (e.date.slice(0, 4) > y) break
    const b = buildingOf(e)
    const inYear = e.date.slice(0, 4) === y
    if (inYear) firstDate ??= e.date
    if (!b) continue
    if (inYear) {
      counts.set(b.id, (counts.get(b.id) ?? 0) + 1)
      if (!seen.has(b.id)) firstFound.push(b.id)
    }
    seen.add(b.id)
  }
  let top: YearRecap['top'] = null
  for (const [id, count] of counts) if (!top || count > top.count) top = { id, count }
  return { year, label: `${y}년`, written: months.reduce((n, m) => n + m.written, 0), months, top, firstFound, firstDate }
}

/** 새해 첫 7일 동안 지난해 돌아보기. 지난해에 쓴 날이 없으면 null */
export function yearRecapOf(entries: readonly Entry[], today: string): YearRecap | null {
  if (today.slice(5, 7) !== '01' || Number(today.slice(8)) > RECAP_DAYS) return null
  const r = yearRecap(entries, Number(today.slice(0, 4)) - 1)
  return r.written ? r : null
}

/** 새 달 첫 7일 동안 지난달 돌아보기. 지난달에 쓴 날이 없으면 null */
export function recapOf(entries: readonly Entry[], today: string): MonthRecap | null {
  if (Number(today.slice(8)) > RECAP_DAYS) return null
  const r = monthRecap(entries, shiftMonth(monthKey(today), -1))
  return r.written ? r : null
}
