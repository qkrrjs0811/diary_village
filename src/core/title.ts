import { cleanName } from './name'
import type { SaveData } from './types'

/** 달 이름 길이. 구역 이름표·달력 머리에 한 줄로 들어가도록 */
export const TITLE_MAX = 20

/** 달(YYYY-MM)인지 */
export const isMonth = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(x)

/** 저장해도 되는 달 이름인지(빈 이름은 칸을 두지 않는다) */
const isMonthTitle = (x: unknown): x is string =>
  typeof x === 'string' && x === cleanName(x) && x.length > 0 && [...x].length <= TITLE_MAX

export type TitleCheck = { ok: true; title: string } | { ok: false; reason: 'too-long' }

/** 앞뒤 빈칸을 지우고 가운데 빈칸은 하나로. 빈 이름은 "이름 걷기"다 */
export function checkMonthTitle(raw: string): TitleCheck {
  const title = cleanName(raw)
  if ([...title].length > TITLE_MAX) return { ok: false, reason: 'too-long' }
  return { ok: true, title }
}

/** 그달에 붙인 이름. 없으면 null */
export const monthTitleOf = (save: SaveData, month: string): string | null => save.monthTitles?.[month] ?? null

/** 달 이름을 붙이거나 고친다. 비우면 걷는다. 달 이름 칸 말고는 건드리지 않는다 */
export function setMonthTitle(save: SaveData, month: string, input: string): { ok: true; save: SaveData } | { ok: false } {
  const checked = checkMonthTitle(input)
  if (!checked.ok || !isMonth(month)) return { ok: false }
  const titles: Record<string, string> = { ...save.monthTitles }
  delete titles[month]
  if (checked.title) titles[month] = checked.title
  const next: SaveData = { ...save }
  delete next.monthTitles
  if (Object.keys(titles).length) next.monthTitles = sortTitles(titles)
  return { ok: true, save: next }
}

const sortTitles = (titles: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(titles).sort(([a], [b]) => a.localeCompare(b)))

/** 저장에서 달 이름을 읽는다. 이상한 칸은 그 칸만 버린다 */
export function readMonthTitles(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const titles: Record<string, string> = {}
  for (const [month, title] of Object.entries(raw)) if (isMonth(month) && isMonthTitle(title)) titles[month] = title
  return sortTitles(titles)
}

/** 백업 가져오기: 두 쪽을 합치고, 같은 달은 폰의 이름을 지킨다 */
export const mergeMonthTitles = (phone: Record<string, string> = {}, backup: Record<string, string> = {}): Record<string, string> =>
  sortTitles({ ...backup, ...phone })
