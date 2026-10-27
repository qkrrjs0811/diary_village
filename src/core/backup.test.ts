import { describe, expect, it } from 'vitest'
import { backupFileName, backupText, planImport } from './backup'
import { parseSave } from './storage'
import type { Entry, SaveData } from './types'

const e = (date: string, text: string, extra: Partial<Entry> = {}): Entry => ({ date, text, mood: 'calm', writtenAt: 1, ...extra })
const save = (...entries: Entry[]): SaveData => ({ version: 1, entries })

describe('백업 내보내기', () => {
  it('파일 이름에 그날 날짜를 넣는다', () => {
    expect(backupFileName('2026-10-27')).toBe('diary-village-2026-10-27.json')
  })

  it('내보낸 글은 그대로 다시 읽힌다', () => {
    const s = save(e('2026-10-01', '첫 줄'), e('2026-10-02', '고친 줄', { editedAt: 9 }))
    expect(parseSave(backupText(s))).toEqual(s)
  })
})

describe('백업 가져오기', () => {
  it('형식이 틀린 파일은 거절한다', () => {
    expect(planImport(save(), 'hello')).toEqual({ ok: false })
    expect(planImport(save(), JSON.stringify({ version: 1, entries: [{ date: 'x' }] }))).toEqual({ ok: false })
  })

  it('빈 폰에 가져오면 모든 기록이 들어온다', () => {
    const backup = save(e('2026-10-01', '가'), e('2026-10-02', '나'))
    const r = planImport(save(), backupText(backup))
    expect(r).toEqual({ ok: true, save: backup, total: 2, added: 2, kept: 0 })
  })

  it('폰에 있는 글은 지우지 않고 없는 날만 더한다', () => {
    const now = save(e('2026-10-02', '폰의 글'), e('2026-10-05', '백업에 없는 날'))
    const backup = save(e('2026-10-01', '가'), e('2026-10-02', '백업의 글'))
    const r = planImport(now, backupText(backup))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.save.entries.map((x) => [x.date, x.text])).toEqual([
      ['2026-10-01', '가'],
      ['2026-10-02', '폰의 글'],
      ['2026-10-05', '백업에 없는 날'],
    ])
    expect([r.total, r.added, r.kept]).toEqual([2, 1, 1])
  })

  it('새로 더할 게 없으면 added 가 0', () => {
    const now = save(e('2026-10-01', '가'))
    const r = planImport(now, backupText(now))
    expect(r).toMatchObject({ ok: true, added: 0, kept: 1 })
  })
})
