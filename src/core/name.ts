import type { SaveData } from './types'

/** 이름을 짓지 않았을 때의 마을 이름 */
export const DEFAULT_NAME = '한 줄 마을'
/** 머리줄에 단계 이름표·집 수와 함께 들어가도록 짧게 */
export const NAME_MAX = 8

/** 앞뒤 빈칸을 지우고 가운데 빈칸은 하나로 */
export const cleanName = (input: string) => input.trim().replace(/\s+/g, ' ')

/** 저장해도 되는 이름인지(빈 이름은 이름 칸을 두지 않는다) */
export const isVillageName = (name: unknown): name is string =>
  typeof name === 'string' && name === cleanName(name) && name.length > 0 && [...name].length <= NAME_MAX

export const villageTitle = (save: SaveData) => save.villageName ?? DEFAULT_NAME

/** 마을 이름을 바꾼다. 비우면 기본 이름으로 돌아간다. 이름 칸 말고는(기록·지운 날·소품·편지) 건드리지 않는다 */
export function renameVillage(save: SaveData, input: string): { ok: true; save: SaveData } | { ok: false } {
  const name = cleanName(input)
  if ([...name].length > NAME_MAX) return { ok: false }
  const next: SaveData = { ...save }
  delete next.villageName
  if (name) next.villageName = name
  return { ok: true, save: next }
}
