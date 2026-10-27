/** "N일 전 오늘": 한 달 전·100일 전·작년 오늘에 쓴 글을 다시 만난다. 기록에서 계산하고 저장하지 않는다 */
import { addDays, isDate } from './date'
import type { Entry } from './types'

export type MemoryKind = 'year' | 'hundred' | 'month'

export interface MemoryDate {
  kind: MemoryKind
  label: string
  date: string
}

export interface Memory {
  kind: MemoryKind
  label: string
  entry: Entry
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 오늘에서 돌아볼 날들. 드문 것부터(작년 → 100일 전 → 한 달 전). 지난달·작년에 없는 날(31일, 2월 29일)은 건너뛴다 */
export function memoryDates(today: string): MemoryDate[] {
  const [y, m, d] = today.split('-').map(Number)
  const year = `${y - 1}-${pad(m)}-${pad(d)}`
  const month = m === 1 ? `${y - 1}-12-${pad(d)}` : `${y}-${pad(m - 1)}-${pad(d)}`
  const out: MemoryDate[] = []
  if (isDate(year)) out.push({ kind: 'year', label: '작년 오늘', date: year })
  out.push({ kind: 'hundred', label: '100일 전 오늘', date: addDays(today, -100) })
  if (isDate(month)) out.push({ kind: 'month', label: '한 달 전 오늘', date: month })
  return out
}

/** 그날 쓴 글이 있는 것 중 가장 드문 하나. 없으면 null */
export function memoryOf(entries: readonly Entry[], today: string): Memory | null {
  for (const m of memoryDates(today)) {
    const entry = entries.find((e) => e.date === m.date)
    if (entry) return { kind: m.kind, label: m.label, entry }
  }
  return null
}
