import { buildingInfo } from '../core/building'
import { moodOf } from '../core/mood'
import type { MonthRecap, YearRecap } from '../core/recap'
import type { MoodId } from '../core/types'

const WEEK = ['일', '월', '화', '수', '목', '금', '토']

/** "10월 27일 화요일" */
export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${m}월 ${d}일 ${WEEK[w]}요일`
}

/** "2026년 10월 27일 화요일" */
export function fullDateLabel(date: string): string {
  return `${date.slice(0, 4)}년 ${dateLabel(date)}`
}

/** 기분 지붕 색을 흰색과 섞은 옅은 색 */
export function softMood(mood: MoodId, k = 0.55): string {
  const hex = moodOf(mood).roofs[0]
  const mix = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k + 255 * (1 - k))
  return `rgb(${mix(1)}, ${mix(3)}, ${mix(5)})`
}

/** "가장 많이 지은 건물 · ☕ 카페 2채". 건물이 없던 달(해)은 보통 집 */
export function recapLine(r: MonthRecap | YearRecap): string {
  if (!r.top) return `🏡 아담한 보통 집들로 채운 ${'year' in r ? '해' : '달'}이에요`
  const b = buildingInfo(r.top.id)
  return `가장 많이 지은 건물 · ${b.icon} ${b.name} ${r.top.count}채`
}
