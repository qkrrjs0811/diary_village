import { buildingOf, type BuildingId } from './building'
import { monthKey } from './date'
import { seasonOf, type Season } from './season'
import type { Entry } from './types'
import { hash, houseLook } from './village'

/** 집 안에 놓는 가구. 그림은 `src/village` 쪽에서 그린다 */
export type Furniture =
  // 아늑한 가구(어느 집에나 놓인다)
  | 'sofa'
  | 'lamp'
  | 'plant'
  | 'clock'
  | 'frame'
  | 'radio'
  | 'chair'
  | 'teapot'
  // 건물마다 하나씩 있는 대표 가구
  | 'coffeeMachine'
  | 'bookshelf'
  | 'dumbbell'
  | 'catTower'
  | 'dogBed'
  | 'vase'
  | 'oven'
  | 'shipModel'
  | 'piano'
  | 'projector'
  | 'pot'
  | 'picnicBasket'
  | 'desk'
  | 'suitcase'
  | 'easel'
  | 'seedTray'

export const COZY_ITEMS: Furniture[] = ['sofa', 'lamp', 'plant', 'clock', 'frame', 'radio', 'chair', 'teapot']

/** 건물마다 다른 대표 가구. 어떤 가구도 다른 가구보다 좋지 않다 */
export const SIGNATURE: Record<BuildingId, Furniture> = {
  cafe: 'coffeeMachine',
  bookstore: 'bookshelf',
  field: 'dumbbell',
  catHouse: 'catTower',
  dogHouse: 'dogBed',
  flowerShop: 'vase',
  bakery: 'oven',
  lighthouse: 'shipModel',
  musicHall: 'piano',
  cinema: 'projector',
  restaurant: 'pot',
  park: 'picnicBasket',
  school: 'desk',
  station: 'suitcase',
  gallery: 'easel',
  farm: 'seedTray',
}

/** 파스텔 벽지(크림·분홍·민트·하늘·노랑·연보라) */
export const WALLPAPERS = ['#fbefd9', '#f8dfe0', '#dcefe2', '#dbe9f4', '#f7ecc4', '#e7def2']
export type Floor = 'wood' | 'tile' | 'rug'
export const FLOORS: Floor[] = ['wood', 'tile', 'rug']

export interface Room {
  wall: string
  floor: Floor
  /** 커튼 색. 그날 기분 색(지붕 색과 같다) */
  curtain: string
  /** 창밖 풍경 */
  view: Season
  /** 가구 셋. 첫째는 대표 가구(보통 집은 날짜로 고른 아늑한 가구) */
  items: [Furniture, Furniture, Furniture]
}

/**
 * 그날 집 안의 방. 날짜·기분·건물로만 계산하고 저장하지 않는다.
 * 가구 수는 모든 날 같고(글 길이와 무관), 기분은 커튼 색만 바꾼다.
 * 글을 고쳐 건물이 바뀌면 대표 가구만 바뀐다
 */
export function roomOf(entry: Entry): Room {
  // 집 손길(houseLook)처럼 그달 안 날짜 차례로 돌려 이웃한 날 방이 닮지 않게 하고, 달마다 시작을 달리한다
  const day = Number(entry.date.slice(8, 10))
  const m = hash(monthKey(entry.date))
  const s = (day * 3 + (m >>> 2)) % COZY_ITEMS.length
  const cozy = [0, 3, 5].map((k) => COZY_ITEMS[(s + k) % COZY_ITEMS.length])
  const match = buildingOf(entry)
  return {
    wall: WALLPAPERS[(day + (m >>> 6)) % WALLPAPERS.length],
    floor: FLOORS[(day * 2 + (m >>> 10)) % FLOORS.length],
    curtain: houseLook(entry).roof,
    view: seasonOf(entry.date),
    items: [match ? SIGNATURE[match.id] : cozy[0], cozy[1], cozy[2]],
  }
}
