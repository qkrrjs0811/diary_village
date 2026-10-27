import { BLOCK_H, BLOCK_W, ROAD } from './village'
import type { Entry } from './types'

export type LandmarkId = 'well' | 'garden' | 'fountain' | 'bridge' | 'clockTower' | 'windmill' | 'bigTree'

export interface Landmark {
  id: LandmarkId
  name: string
  icon: string
  /** 누적으로 쓴 날 수가 이만큼이 되면 생긴다. 연속 기록은 보지 않는다 */
  days: number
  /** 광장 안 칸(광장 왼쪽 위가 0,0) */
  col: number
  row: number
}

/**
 * 쌓일수록 마을이 자란다(기획서 6번). 기준은 누적 날 수라서 줄어들지 않는다(글은 지워지지 않는다).
 * 글 길이·기분·연속 기록은 명소에 영향을 주지 않는다
 */
export const LANDMARKS: Landmark[] = [
  { id: 'well', name: '우물', icon: '🪣', days: 7, col: 1, row: 1 },
  { id: 'garden', name: '꽃 정원', icon: '🌷', days: 14, col: 5, row: 1 },
  { id: 'fountain', name: '분수', icon: '⛲', days: 30, col: 3, row: 2 },
  { id: 'bridge', name: '다리', icon: '🌉', days: 50, col: 1, row: 4 },
  { id: 'clockTower', name: '시계탑', icon: '🕰️', days: 100, col: 5, row: 4 },
  { id: 'windmill', name: '풍차', icon: '🌾', days: 200, col: 3, row: 5 },
  { id: 'bigTree', name: '무지개 큰 나무', icon: '🌈', days: 365, col: 3, row: 0 },
]

/**
 * 명소가 서는 광장. 첫 구역(첫 달) 바로 아래 구역 자리다.
 * 구역은 지그재그(0,0)→(1,0)→(1,1)→(2,1)… 로 이어지므로 이 자리는 언제나 비어 있다
 */
export const PLAZA = { gx: 0, gy: BLOCK_H + ROAD, w: BLOCK_W, h: BLOCK_H }

/** 지금까지 쓴 날 수(같은 날은 하루) */
export function writtenDays(entries: Entry[]): number {
  return new Set(entries.map((e) => e.date)).size
}

export function earnedLandmarks(entries: Entry[]): Landmark[] {
  const n = writtenDays(entries)
  return LANDMARKS.filter((l) => l.days <= n)
}

export function nextLandmark(entries: Entry[]): { landmark: Landmark; left: number } | null {
  const n = writtenDays(entries)
  const landmark = LANDMARKS.find((l) => l.days > n)
  return landmark ? { landmark, left: landmark.days - n } : null
}

/** before → after 로 바뀌며 새로 생긴 명소(축하 카드에 쓴다) */
export function reachedLandmarks(before: Entry[], after: Entry[]): Landmark[] {
  const from = writtenDays(before)
  const to = writtenDays(after)
  return LANDMARKS.filter((l) => l.days > from && l.days <= to)
}

/** 마을 전체 칸 좌표 */
export function landmarkSpot(l: Landmark): { gx: number; gy: number } {
  return { gx: PLAZA.gx + l.col, gy: PLAZA.gy + l.row }
}
