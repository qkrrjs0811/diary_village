import { isDate } from './date'
import type { SaveData } from './types'

/**
 * 사진 일기. 하루 한 장이고 날짜가 사진의 이름이다.
 * 사진은 폰 안 보관함(IndexedDB)에만 두고 밖으로 보내지 않는다. 마을 계산(건물·명소·단계)에는 쓰지 않는다
 */

/** 날짜(YYYY-MM-DD) → 사진(data URL) */
export type Photos = Record<string, string>

/** 줄인 사진의 긴 변(px). 폰 화면에 또렷하면서 폰 저장 공간을 아끼게 */
export const PHOTO_EDGE = 1080

/** 사진 한 장의 글자 수 한도(약 1.5MB). 줄인 jpeg 은 보통 이보다 훨씬 작다 */
export const PHOTO_MAX_CHARS = 2_000_000

/** 긴 변이 PHOTO_EDGE 를 넘으면 비율을 지켜 줄인다. 작은 사진은 키우지 않는다. 이상한 크기는 null */
export function photoSize(width: number, height: number): { width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  const scale = Math.min(1, PHOTO_EDGE / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

const PHOTO_DATA = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/

/** 받을 수 있는 사진 글자인지(jpeg·png·webp data URL, 한도 안) */
export const isPhotoData = (x: unknown): x is string =>
  typeof x === 'string' && x.length <= PHOTO_MAX_CHARS && PHOTO_DATA.test(x)

const sortPhotos = (photos: Photos): Photos => Object.fromEntries(Object.entries(photos).sort(([a], [b]) => a.localeCompare(b)))

/** 글이 남은 날의 사진만. 지운 날·글 없는 날의 사진은 보이지 않는다 */
export function photosShown(save: SaveData, photos: Photos): Photos {
  const written = new Set(save.entries.map((e) => e.date))
  return sortPhotos(Object.fromEntries(Object.entries(photos).filter(([date]) => written.has(date))))
}

/** 백업 파일의 사진 묶음을 읽는다. 이상한 장은 그 장만 버리고, 묶음이 아니면(사진 없는 이전 백업) 빈 묶음 */
export function readPhotos(raw: unknown): Photos {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const photos: Photos = {}
  for (const [date, data] of Object.entries(raw)) if (isDate(date) && isPhotoData(data)) photos[date] = data
  return sortPhotos(photos)
}

/** 백업 가져오기: 폰 사진을 지키고, 폰에 없는 날만 백업에서 더한다. 가져온 뒤 글이 있는 날만 */
export const mergePhotos = (phone: Photos, backup: Photos, save: SaveData): Photos => photosShown(save, { ...backup, ...phone })
