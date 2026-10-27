import { BUILDINGS, buildingOf, type Building, type BuildingId } from './building'
import { LANDMARKS, writtenDays, type Landmark } from './landmark'
import type { Entry } from './types'

/** 아직 못 만난 건물의 힌트. 건물 이름은 숨기고 어떤 날에 생기는지만 살짝 알려 준다 */
export const HINTS: Record<BuildingId, string> = {
  cafe: '따뜻한 한 잔을 마신 날',
  bookstore: '종이 넘기는 소리가 들린 날',
  field: '땀 흘려 몸을 움직인 날',
  catHouse: '야옹 소리를 들은 날',
  dogHouse: '꼬리 흔드는 친구를 만난 날',
  flowerShop: '향기로운 꽃잎을 본 날',
  bakery: '고소한 냄새가 난 날',
  lighthouse: '파도 소리를 들은 날',
  musicHall: '흥얼흥얼 노래한 날',
  cinema: '큰 화면 앞에 앉은 날',
}

export interface CollectionItem {
  building: Building
  found: boolean
  /** 이 건물이 선 날 수 */
  count: number
  /** 처음 만난 날과 그날 찾은 말. 못 만났으면 null */
  first: { date: string; word: string } | null
  hint: string
}

/**
 * 건물 도감(기획서 M2). 기록에서 계산하므로 따로 저장하지 않고, 글을 고치면 따라 바뀐다.
 * 순서는 건물 목록 그대로다. 기분·글 길이는 보지 않는다
 */
export function collectionOf(entries: Entry[]): CollectionItem[] {
  const items = new Map<BuildingId, CollectionItem>(
    BUILDINGS.map((b) => [b.id, { building: b, found: false, count: 0, first: null, hint: HINTS[b.id] }]),
  )
  for (const entry of entries) {
    const match = buildingOf(entry)
    if (!match) continue
    const item = items.get(match.id)!
    item.found = true
    item.count++
    if (!item.first || entry.date < item.first.date) item.first = { date: entry.date, word: match.word }
  }
  return [...items.values()]
}

export function collectionCount(entries: Entry[]): { found: number; total: number } {
  return { found: collectionOf(entries).filter((c) => c.found).length, total: BUILDINGS.length }
}

/** 수첩에 보이는 명소 목록. 못 얻은 명소는 몇 일 더 쓰면 생기는지 */
export function landmarkBook(entries: Entry[]): { landmark: Landmark; earned: boolean; left: number }[] {
  const n = writtenDays(entries)
  return LANDMARKS.map((landmark) => ({ landmark, earned: landmark.days <= n, left: Math.max(0, landmark.days - n) }))
}
