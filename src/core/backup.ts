import { parseSave } from './storage'
import type { SaveData } from './types'

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
  // 마을 이름도 폰에 있는 이름을 지키고, 폰에 이름이 없을 때만 백업 이름을 쓴다
  const villageName = current.villageName ?? backup.villageName
  if (villageName) save.villageName = villageName
  return { ok: true, save, total: backup.entries.length, added: fresh.length, kept: backup.entries.length - fresh.length }
}
