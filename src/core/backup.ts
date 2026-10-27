import { mergeLetters } from './letter'
import { parseSave } from './storage'
import type { Erased, SaveData } from './types'

/** 내려받는 백업 파일 이름. 날짜를 넣어 여러 번 받아도 헷갈리지 않게 */
export const backupFileName = (today: string) => `diary-village-${today}.json`

/** 백업 파일 내용. 저장 형식 그대로라 parseSave 로 다시 읽는다 */
export const backupText = (save: SaveData) => JSON.stringify(save, null, 2)

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
    }

/**
 * 백업을 지금 기록에 더한다. 쓴 글은 사라지지 않아야 하므로 바꿔치기하지 않는다:
 * 폰에 있는 날은 폰의 글을 그대로 두고, 폰에 없는 날만 백업에서 더한다
 */
export function planImport(current: SaveData, text: string): ImportPlan {
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
  return { ok: true, save, total: backup.entries.length, added: fresh.length, kept: backup.entries.length - fresh.length }
}
