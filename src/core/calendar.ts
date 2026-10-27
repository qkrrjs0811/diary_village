/** 기분 색 달력. 기록에서 계산하고 저장하지 않는다 */
import { addDays, monthKey, weekday } from './date'
import { MOODS } from './mood'
import type { Entry, MoodId } from './types'

/** written: 쓴 날, erased: 지운 날, empty: 빈 날, future: 아직 안 온 날 */
export type DayState = 'written' | 'erased' | 'empty' | 'future'

export interface CalendarDay {
  date: string
  day: number
  state: DayState
  /** 쓴 날의 기분 */
  mood?: MoodId
  today: boolean
}

export interface CalendarMonth {
  month: string
  title: string
  /** 일요일부터 7칸씩. 달 앞뒤 빈칸은 null */
  weeks: (CalendarDay | null)[][]
  /** 그달 쓴 날 수(지운 날은 빼고) */
  written: number
  /** 기분마다 쓴 날 수. 많은 것부터, 같으면 기분 순서 */
  moods: { mood: MoodId; count: number }[]
}

/** "2026-10" 에서 n달 옮긴 달 */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const i = y * 12 + (m - 1) + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}

/** 넘겨 볼 수 있는 달: 처음 집을 지은 달(지운 날 포함)부터 이번 달까지 */
export function calendarRange(entries: readonly Entry[], erased: readonly string[], today: string) {
  const last = monthKey(today)
  const months = [...entries.map((e) => e.date), ...erased].map(monthKey).filter((m) => m <= last)
  const first = months.reduce((a, b) => (b < a ? b : a), last)
  return { first, last }
}

export function calendarMonth(entries: readonly Entry[], erased: readonly string[], month: string, today: string): CalendarMonth {
  const byDate = new Map(entries.filter((e) => monthKey(e.date) === month).map((e) => [e.date, e]))
  const gone = new Set(erased)
  const cells: (CalendarDay | null)[] = Array(weekday(`${month}-01`)).fill(null)
  for (let date = `${month}-01`; monthKey(date) === month; date = addDays(date, 1)) {
    const entry = byDate.get(date)
    const state: DayState = entry ? 'written' : gone.has(date) ? 'erased' : date > today ? 'future' : 'empty'
    cells.push({ date, day: Number(date.slice(8)), state, ...(entry ? { mood: entry.mood } : {}), today: date === today })
  }
  while (cells.length % 7) cells.push(null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
  const moods = MOODS.map((m) => ({ mood: m.id, count: [...byDate.values()].filter((e) => e.mood === m.id).length }))
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count)
  const [y, m] = month.split('-').map(Number)
  return { month, title: `${y}년 ${m}월`, weeks, written: byDate.size, moods }
}
