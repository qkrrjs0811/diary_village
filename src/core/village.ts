import { addDays, monthKey, weekday } from './date'
import { moodOf } from './mood'
import type { Entry } from './types'

/** 한 구역 = 한 달. 달력처럼 가로 7칸(요일) × 세로 6줄(주) */
export const BLOCK_W = 7
export const BLOCK_H = 6
/** 구역 사이 길 폭(칸) */
export const ROAD = 1

export interface Lot {
  date: string
  /** 구역 안 칸: col = 요일(0 = 일), row = 그달의 몇째 주 */
  col: number
  row: number
  /** 마을 전체 칸 좌표 */
  gx: number
  gy: number
  entry?: Entry
}

export interface Block {
  month: string
  /** 구역 자리(구역 단위) */
  bx: number
  by: number
  lots: Lot[]
}

export interface Village {
  blocks: Block[]
}

/** 구역 i의 자리. 지그재그로 화면 아래쪽으로 이어진다(폰 세로 화면에 맞게) */
function blockSpot(i: number): { bx: number; by: number } {
  return { bx: Math.ceil(i / 2), by: Math.floor(i / 2) }
}

function daysOfMonth(month: string): string[] {
  const days: string[] = []
  for (let d = `${month}-01`; monthKey(d) === month; d = addDays(d, 1)) days.push(d)
  return days
}

/**
 * 기록에서 마을을 계산한다. 기록이 있는 달(과 오늘이 있는 달)만 구역이 되고, 빈 날은 빈 땅으로 남는다.
 * today 를 주면 아직 아무것도 안 쓴 날에도 오늘 자리가 보인다.
 * kept 는 지운 날이다. 빈 땅으로 돌아가지만 그 달 구역은 남겨 다른 구역 자리가 바뀌지 않게 한다
 */
export function buildVillage(entries: Entry[], today?: string, kept: string[] = []): Village {
  const byDate = new Map(entries.map((e) => [e.date, e]))
  const dates = [...entries.map((e) => e.date), ...kept, ...(today ? [today] : [])]
  const months = [...new Set(dates.map(monthKey))].sort()
  const blocks = months.map((month, i): Block => {
    const { bx, by } = blockSpot(i)
    const days = daysOfMonth(month)
    const offset = weekday(days[0])
    const lots = days.map((date, d): Lot => {
      const col = (offset + d) % 7
      const row = Math.floor((offset + d) / 7)
      const lot: Lot = { date, col, row, gx: bx * (BLOCK_W + ROAD) + col, gy: by * (BLOCK_H + ROAD) + row }
      const entry = byDate.get(date)
      if (entry) lot.entry = entry
      return lot
    })
    return { month, bx, by, lots }
  })
  return { blocks }
}

/** 날짜 문자열로 만드는 고정된 난수(FNV-1a). 같은 날은 언제나 같은 모양 */
export function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export type RoofStyle = 'gable' | 'hip' | 'flat'

export interface HouseLook {
  roof: string
  wall: string
  floors: 1 | 2
  roofStyle: RoofStyle
  chimney: boolean
}

const WALLS = ['#fff4e2', '#fdebd8', '#f6efe4', '#fff9ef']
const ROOF_STYLES: RoofStyle[] = ['gable', 'gable', 'hip', 'flat']

/** 집 모양은 날짜와 기분으로만 정한다. 글 길이는 쓰지 않는다 */
export function houseLook(entry: Entry): HouseLook {
  const h = hash(entry.date)
  const mood = moodOf(entry.mood)
  return {
    roof: mood.roofs[h % mood.roofs.length],
    wall: WALLS[(h >>> 3) % WALLS.length],
    floors: (h >>> 6) % 3 === 0 ? 2 : 1,
    roofStyle: ROOF_STYLES[(h >>> 9) % ROOF_STYLES.length],
    chimney: (h >>> 12) % 2 === 0,
  }
}
