import { addDays, dayKey } from './date'
import { mergeLetters } from './letter'
import { mergePhotos, photosShown, readPhotos, type Photos } from './photo'
import { parseSave, type KV } from './storage'
import { mergeMonthTitles } from './title'
import type { Erased, SaveData } from './types'

/** 내려받는 백업 파일 이름. 날짜를 넣어 여러 번 받아도 헷갈리지 않게 */
export const backupFileName = (today: string) => `diary-village-${today}.json`

/**
 * 백업 파일 내용. 저장 형식 그대로라 parseSave 로 다시 읽는다.
 * 사진은 따로 photos 칸에 담는다(글이 남은 날만, 없으면 칸을 두지 않는다). parseSave 는 이 칸을 모르고 지나간다
 */
export function backupText(save: SaveData, photos: Photos = {}): string {
  const shown = photosShown(save, photos)
  return JSON.stringify(Object.keys(shown).length ? { ...save, photos: shown } : save, null, 2)
}

/** 백업 파일의 사진 묶음. 사진이 없는 이전 백업이면 빈 묶음 */
function backupPhotos(text: string): Photos {
  try {
    return readPhotos((JSON.parse(text) as { photos?: unknown }).photos)
  } catch {
    return {}
  }
}

export type ImportPlan =
  | { ok: false }
  | {
      ok: true
      /** 가져온 뒤의 기록 */
      save: SaveData
      /** 백업에 있는 날 수 */
      total: number
      /** 새로 더해지는 날 수 */
      added: number
      /** 폰에 이미 있어서 그대로 둔 날 수 */
      kept: number
      /** 백업에만 있어 새로 더해지는 편지 수 */
      lettersAdded: number
      /** 가져온 뒤 폰에 둘 사진 전부(폰 사진은 그대로) */
      photos: Photos
      /** 백업에서 새로 붙는 사진 수 */
      photosAdded: number
      /** 폰에 사진을 담을 수 없어 가져오지 못하는 사진 수 */
      photosLeft: number
    }

/**
 * 백업을 지금 기록에 더한다. 쓴 글은 사라지지 않아야 하므로 바꿔치기하지 않는다:
 * 폰에 있는 날은 폰의 글을 그대로 두고, 폰에 없는 날만 백업에서 더한다
 */
export function planImport(current: SaveData, text: string, phonePhotos: Photos | null = {}): ImportPlan {
  const backup = parseSave(text)
  if (!backup) return { ok: false }
  const have = new Set(current.entries.map((e) => e.date))
  const fresh = backup.entries.filter((e) => !have.has(e.date))
  const entries = [...current.entries, ...fresh].sort((a, b) => a.date.localeCompare(b.date))
  const save: SaveData = { version: 1, entries }
  // 지운 날은 두 쪽을 합쳐 날 수를 지킨다. 폰에서 지운 날의 글이 백업에 있으면 그 글이 되살아난다(사용자가 고른 파일이다)
  const written = new Set(entries.map((e) => e.date))
  const erased = new Map<string, Erased>()
  for (const x of [...(current.erased ?? []), ...(backup.erased ?? [])]) if (!written.has(x.date) && !erased.has(x.date)) erased.set(x.date, x)
  if (erased.size) save.erased = [...erased.values()].sort((a, b) => a.date.localeCompare(b.date))
  // 마을 이름도 폰에 있는 이름을 지키고, 폰에 이름이 없을 때만 백업 이름을 쓴다
  const villageName = current.villageName ?? backup.villageName
  if (villageName) save.villageName = villageName
  // 놓은 소품도 폰에 놓은 것을 지키고, 폰에 하나도 없을 때만 백업의 자리를 쓴다(섞으면 칸이 겹친다)
  const decor = current.decor?.length ? current.decor : backup.decor
  if (decor?.length) save.decor = decor
  // 편지는 사용자가 쓴 글이라 두 쪽을 합친다. 폰에 있는 편지(읽은 표시 포함)는 그대로 둔다
  const letters = mergeLetters(current.letters ?? [], backup.letters ?? [])
  if (letters.length) save.letters = letters
  // 달 이름도 두 쪽을 합친다. 같은 달은 폰의 이름을 지킨다
  const monthTitles = mergeMonthTitles(current.monthTitles, backup.monthTitles)
  if (Object.keys(monthTitles).length) save.monthTitles = monthTitles
  const lettersAdded = letters.length - (current.letters?.length ?? 0)
  // 사진도 폰 사진을 지키고 폰에 없는 날만 더한다. 폰에 담을 수 없으면(null) 글만 가져온다
  const fromBackup = photosShown(save, backupPhotos(text))
  const photos = phonePhotos ? mergePhotos(phonePhotos, fromBackup, save) : {}
  const photosAdded = phonePhotos ? Object.keys(photos).filter((d) => !phonePhotos[d]).length : 0
  const photosLeft = phonePhotos ? 0 : Object.keys(fromBackup).length
  return { ok: true, save, total: backup.entries.length, added: fresh.length, kept: backup.entries.length - fresh.length, lettersAdded, photos, photosAdded, photosLeft }
}

/** 마지막으로 백업 파일을 내려받은 시각(ms). 사용자가 한 일이라 따로 둔다 */
export const BACKUP_KEY = 'diary-village:backup-at'

/** 백업한 뒤 이만큼 지나면 "백업해 둘까요?"를 묻는다 */
export const BACKUP_GAP_DAYS = 30

/** 처음이거나 이상한 값이거나 못 읽으면 null */
export function backedUpAt(kv: KV): number | null {
  try {
    const v = Number(kv.getItem(BACKUP_KEY) ?? NaN)
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

export function markBackedUp(kv: KV, now: number): void {
  kv.setItem(BACKUP_KEY, String(now))
}

/** 글이 마지막으로 바뀐 시각(쓰기·고치기·지우기·편지) */
function changedAt(save: SaveData): number {
  let t = 0
  for (const e of save.entries) t = Math.max(t, e.writtenAt, e.editedAt ?? 0)
  for (const x of save.erased ?? []) t = Math.max(t, x.erasedAt)
  for (const l of save.letters ?? []) t = Math.max(t, l.writtenAt)
  return t
}

/**
 * 백업해 둘까요? 지킬 글이 있고, 마지막 백업(없으면 첫 한 줄) 뒤 한 달이 지났고,
 * 백업한 뒤로 바뀐 것이 있을 때만 묻는다. 빠진 날과는 상관없다
 */
export function backupDue(save: SaveData, backedUp: number | null, today: string): boolean {
  if (!save.entries.length) return false
  if (backedUp !== null && changedAt(save) <= backedUp) return false
  const from = backedUp !== null ? dayKey(backedUp) : save.entries.reduce((a, e) => (e.date < a ? e.date : a), save.entries[0].date)
  return addDays(from, BACKUP_GAP_DAYS) <= today
}
