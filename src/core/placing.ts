import { addDays } from './date'
import { isDecorId, unlockedDecors, type DecorId } from './decor'
import { builtDays } from './entries'
import { LANDMARKS, PLAZA } from './landmark'
import type { PlacedDecor, SaveData } from './types'
import { BLOCK_H, BLOCK_W, ROAD, type Village } from './village'

/** 소품 자리: 그달 구역(또는 광장) 안 칸 */
export type DecorPlace = Pick<PlacedDecor, 'at' | 'col' | 'row'>

/** 마을 칸 좌표가 붙은 자리 */
export type DecorSpot = DecorPlace & { gx: number; gy: number }

const isMonth = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(x)
const isCell = (col: unknown, row: unknown, w: number, h: number) =>
  Number.isInteger(col) && Number.isInteger(row) && (col as number) >= 0 && (col as number) < w && (row as number) >= 0 && (row as number) < h

/** 저장에서 읽은 한 줄이 소품 자리로 맞는지(마을과 상관없는 모양만 본다) */
export function isPlacedDecor(x: unknown): x is PlacedDecor {
  if (typeof x !== 'object' || x === null) return false
  const { id, at, col, row } = x as Record<string, unknown>
  if (!isDecorId(id)) return false
  if (at === 'plaza') return isCell(col, row, PLAZA.w, PLAZA.h)
  return isMonth(at) && isCell(col, row, BLOCK_W, BLOCK_H)
}

const sameSpot = (a: DecorPlace, b: DecorPlace) => a.at === b.at && a.col === b.col && a.row === b.row

/** 광장에서 비워 두는 칸: 명소 자리(아직 안 선 곳도), 가운데 돌길, 모서리 나무 */
function plazaFree(col: number, row: number): boolean {
  if (col === 3 || row === 2 || row === 3) return false
  if (LANDMARKS.some((l) => l.col === col && l.row === row)) return false
  return ![[0, 0], [6, 0], [0, 5]].some(([c, r]) => c === col && r === row)
}

/**
 * 땅이 비어 있는 자리면 마을 칸 좌표, 아니면 null(다른 소품은 보지 않는다).
 * 구역에서는 달력 밖 칸과 지난 빈 날(지운 날 포함)만 빈 땅이다. 오늘·어제는 아직 쓸 수 있어 비워 둔다
 */
function groundSpot(village: Village, today: string, p: DecorPlace): DecorSpot | null {
  if (p.at === 'plaza') {
    if (!isCell(p.col, p.row, PLAZA.w, PLAZA.h) || !plazaFree(p.col, p.row)) return null
    return { ...p, gx: PLAZA.gx + p.col, gy: PLAZA.gy + p.row }
  }
  const block = village.blocks.find((b) => b.month === p.at)
  if (!block || !isCell(p.col, p.row, BLOCK_W, BLOCK_H)) return null
  const lot = block.lots.find((l) => l.col === p.col && l.row === p.row)
  if (lot && (lot.entry || lot.date >= addDays(today, -1))) return null
  return { ...p, gx: block.bx * (BLOCK_W + ROAD) + p.col, gy: block.by * (BLOCK_H + ROAD) + p.row }
}

/** 소품을 놓을 수 있는 자리인지. skip 번째 소품(옮기는 중인 것)은 없는 셈 친다 */
export function canPlace(village: Village, today: string, save: SaveData, p: DecorPlace, skip = -1): boolean {
  if (!groundSpot(village, today, p)) return false
  return !(save.decor ?? []).some((d, i) => i !== skip && sameSpot(d, p))
}

/** 지금 소품을 놓을 수 있는 모든 자리(광장 → 오래된 구역 순) */
export function decorSpots(village: Village, today: string, save: SaveData): DecorSpot[] {
  const places: DecorPlace[] = []
  for (let row = 0; row < PLAZA.h; row++) for (let col = 0; col < PLAZA.w; col++) places.push({ at: 'plaza', col, row })
  for (const b of village.blocks) for (let row = 0; row < BLOCK_H; row++) for (let col = 0; col < BLOCK_W; col++) places.push({ at: b.month, col, row })
  return places.filter((p) => canPlace(village, today, save, p)).map((p) => groundSpot(village, today, p)!)
}

/** 누른 마을 칸(gx, gy)이 어느 구역(또는 광장)의 몇째 칸인지. 길·마을 밖이면 null */
export function placeAt(village: Village, gx: number, gy: number): DecorPlace | null {
  if (isCell(gx - PLAZA.gx, gy - PLAZA.gy, PLAZA.w, PLAZA.h)) return { at: 'plaza', col: gx - PLAZA.gx, row: gy - PLAZA.gy }
  for (const b of village.blocks) {
    const col = gx - b.bx * (BLOCK_W + ROAD)
    const row = gy - b.by * (BLOCK_H + ROAD)
    if (isCell(col, row, BLOCK_W, BLOCK_H)) return { at: b.month, col, row }
  }
  return null
}

export type PlaceResult = { ok: true; save: SaveData } | { ok: false; reason: 'locked' | 'spot' | 'missing' }

const pick = (p: DecorPlace) => ({ at: p.at, col: p.col, row: p.row })

/** 열린 소품을 빈 자리에 놓는다. 같은 소품을 여러 개 놓아도 된다. 기록(글)은 건드리지 않는다 */
export function placeDecor(save: SaveData, village: Village, today: string, id: DecorId, p: DecorPlace): PlaceResult {
  if (!unlockedDecors(builtDays(save)).some((d) => d.id === id)) return { ok: false, reason: 'locked' }
  if (!canPlace(village, today, save, p)) return { ok: false, reason: 'spot' }
  return { ok: true, save: { ...save, decor: [...(save.decor ?? []), { id, ...pick(p) }] } }
}

/** index 번째 소품을 다른 빈 자리로 옮긴다 */
export function moveDecor(save: SaveData, village: Village, today: string, index: number, p: DecorPlace): PlaceResult {
  const list = save.decor ?? []
  if (!list[index]) return { ok: false, reason: 'missing' }
  if (!canPlace(village, today, save, p, index)) return { ok: false, reason: 'spot' }
  return { ok: true, save: { ...save, decor: list.map((d, i) => (i === index ? { id: d.id, ...pick(p) } : d)) } }
}

/** index 번째 소품을 치운다. 소품은 다시 놓을 수 있다(열린 소품은 줄지 않는다) */
export function removeDecor(save: SaveData, index: number): SaveData {
  const decor = (save.decor ?? []).filter((_, i) => i !== index)
  const next: SaveData = { ...save }
  if (decor.length) next.decor = decor
  else delete next.decor
  return next
}

/**
 * 마을에 그릴 소품(마을 칸 좌표와 저장 속 순서 index).
 * 아직 안 열린 소품, 없는 구역, 집이 선 칸(백업으로 더해진 날)의 소품은 그리지 않지만 저장에서 지우지는 않는다
 */
export function decorsOnMap(village: Village, today: string, save: SaveData): (PlacedDecor & DecorSpot & { index: number })[] {
  const open = new Set(unlockedDecors(builtDays(save)).map((d) => d.id))
  const out: (PlacedDecor & DecorSpot & { index: number })[] = []
  ;(save.decor ?? []).forEach((d, index) => {
    if (!open.has(d.id)) return
    const spot = groundSpot(village, today, d)
    if (spot) out.push({ ...spot, id: d.id, index })
  })
  return out
}
