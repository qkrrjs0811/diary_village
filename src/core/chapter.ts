/** 한 달 이어 읽기. 그달에 쓴 한 줄들을 한 장에 잇는다. 기록에서 계산하고 저장하지 않는다 */
import { buildingInfo, buildingOf } from './building'
import { monthKey } from './date'
import { monthLabel, monthTitleOf } from './title'
import type { MoodId, SaveData } from './types'

/** 보통 집(맞는 건물이 없는 날)의 아이콘 */
export const PLAIN_HOUSE_ICON = '🏠'

export interface ChapterDay {
  date: string
  day: number
  mood: MoodId
  text: string
  /** 그날 건물 아이콘. 보통 집이면 🏠 */
  icon: string
  /** "더 쓰기"로 이어 쓴 긴 글이 있는지(글은 넣지 않고 표시만) */
  more: boolean
  treasured: boolean
}

export interface MonthChapter {
  month: string
  /** 장 제목: "10월", 달 이름이 있으면 "10월 · 이사한 달" */
  heading: string
  /** 그달 한 줄 날 수(지운 날은 빼고) */
  written: number
  /** 쓴 날만 날짜 순으로. 빠진 날·지운 날은 넣지 않는다 */
  days: ChapterDay[]
  /** 쓴 날이 있는 가장 가까운 지난달·다음 달. 없으면 null */
  prev: string | null
  next: string | null
}

export function monthChapter(save: SaveData, month: string): MonthChapter {
  const days = save.entries
    .filter((e) => monthKey(e.date) === month)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((e): ChapterDay => {
      const found = buildingOf(e)
      return {
        date: e.date,
        day: Number(e.date.slice(8)),
        mood: e.mood,
        text: e.text,
        icon: found ? buildingInfo(found.id).icon : PLAIN_HOUSE_ICON,
        more: !!e.more,
        treasured: e.treasured === true,
      }
    })
  const months = [...new Set(save.entries.map((e) => monthKey(e.date)))].sort()
  const prev = months.filter((m) => m < month).pop() ?? null
  const next = months.find((m) => m > month) ?? null
  return { month, heading: monthLabel(month, monthTitleOf(save, month)), written: days.length, days, prev, next }
}
