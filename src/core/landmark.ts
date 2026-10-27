import { BLOCK_H, BLOCK_W, ROAD } from './village'
import { hasFinal } from './building'
import type { Dated } from './types'

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
  // 키 큰 명소(시계탑·풍차·큰 나무)는 뒤쪽에, 화면에서 같은 세로줄에 서지 않게 둔다
  { id: 'well', name: '우물', icon: '🪣', days: 7, col: 1, row: 4 },
  { id: 'garden', name: '꽃 정원', icon: '🌷', days: 14, col: 5, row: 4 },
  { id: 'fountain', name: '분수', icon: '⛲', days: 30, col: 3, row: 2 },
  { id: 'bridge', name: '다리', icon: '🌉', days: 50, col: 1, row: 5 },
  { id: 'clockTower', name: '시계탑', icon: '🕰️', days: 100, col: 0, row: 2 },
  { id: 'windmill', name: '풍차', icon: '🌾', days: 200, col: 6, row: 2 },
  { id: 'bigTree', name: '무지개 큰 나무', icon: '🌈', days: 365, col: 3, row: 0 },
]

/**
 * 명소가 서는 광장. 첫 구역(첫 달) 바로 아래 구역 자리다.
 * 구역은 지그재그(0,0)→(1,0)→(1,1)→(2,1)… 로 이어지므로 이 자리는 언제나 비어 있다
 */
export const PLAZA = { gx: 0, gy: BLOCK_H + ROAD, w: BLOCK_W, h: BLOCK_H }

/** 지금까지 쓴 날 수(같은 날은 하루) */
export function writtenDays(entries: Dated[]): number {
  return new Set(entries.map((e) => e.date)).size
}

export function earnedLandmarks(entries: Dated[]): Landmark[] {
  const n = writtenDays(entries)
  return LANDMARKS.filter((l) => l.days <= n)
}

export function nextLandmark(entries: Dated[]): { landmark: Landmark; left: number } | null {
  const n = writtenDays(entries)
  const landmark = LANDMARKS.find((l) => l.days > n)
  return landmark ? { landmark, left: landmark.days - n } : null
}

/** before → after 로 바뀌며 새로 생긴 명소(축하 카드에 쓴다) */
export function reachedLandmarks(before: Dated[], after: Dated[]): Landmark[] {
  const from = writtenDays(before)
  const to = writtenDays(after)
  return LANDMARKS.filter((l) => l.days > from && l.days <= to)
}

/** 마을 전체 칸 좌표 */
export function landmarkSpot(l: Landmark): { gx: number; gy: number } {
  return { gx: PLAZA.gx + l.col, gy: PLAZA.gy + l.row }
}

const ga = (word: string) => `${word}${hasFinal(word) ? '이' : '가'}`

/** 아직 명소가 없는 자리에 세우는 팻말("7일 더 쓰면 / 우물이 생겨요"). 모두 얻었으면 null */
export function nextSign(entries: Dated[]): { landmark: Landmark; lines: [string, string] } | null {
  const next = nextLandmark(entries)
  if (!next) return null
  return { landmark: next.landmark, lines: [`${next.left}일 더 쓰면`, `${ga(next.landmark.name)} 생겨요`] }
}

/** 명소가 생긴 순간의 축하 카드 문구. reached 는 비어 있지 않다 */
export function celebration(reached: Landmark[], entries: Dated[]): { title: string; body: string; next: string | null } {
  const title = reached.length === 1 ? `${reached[0].icon} ${ga(reached[0].name)} 생겼어요!` : `🎉 명소 ${reached.length}곳이 생겼어요!`
  const body = `한 줄을 ${writtenDays(entries)}일 남겼어요. 광장에 ${ga(reached.map((l) => l.name).join(', '))} 섰어요.`
  const n = nextLandmark(entries)
  const next = n ? `다음은 ${n.left}일 더 쓰면 ${n.landmark.name}${hasFinal(n.landmark.name) ? '이에요' : '예요'}` : null
  return { title, body, next }
}
