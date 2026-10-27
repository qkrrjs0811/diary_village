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
    expect(r).toEqual({ ok: true, save: backup, total: 2, added: 2, kept: 0, lettersAdded: 0 })
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

describe('지운 날과 백업', () => {
  it('지운 날도 백업에 담겨 다시 읽힌다', () => {
    const s: SaveData = { version: 1, entries: [e('2026-10-02', '남은 줄')], erased: [{ date: '2026-10-01', erasedAt: 7 }] }
    expect(parseSave(backupText(s))).toEqual(s)
  })

  it('백업의 지운 날은 날 수에 더하고, 폰에서 지운 날의 글이 백업에 있으면 그 글을 되살린다', () => {
    const phone: SaveData = { version: 1, entries: [e('2026-10-03', '폰')], erased: [{ date: '2026-10-01', erasedAt: 7 }] }
    const backup: SaveData = { version: 1, entries: [e('2026-10-01', '백업 글')], erased: [{ date: '2026-10-05', erasedAt: 8 }] }
    const plan = planImport(phone, backupText(backup))
    if (!plan.ok) throw new Error()
    expect(plan.save.entries.map((x) => x.text)).toEqual(['백업 글', '폰'])
    expect(plan.save.erased).toEqual([{ date: '2026-10-05', erasedAt: 8 }])
    expect(plan.added).toBe(1)
  })
})

describe('놓은 소품과 백업', () => {
  it('놓은 소품도 백업에 담겨 다시 읽힌다', () => {
    const s: SaveData = { version: 1, entries: [e('2026-10-02', '한 줄')], decor: [{ id: 'pot', at: '2026-10', col: 1, row: 0 }] }
    expect(parseSave(backupText(s))).toEqual(s)
  })

  it('폰에 놓은 소품이 있으면 그대로 두고, 없을 때만 백업의 소품을 쓴다', () => {
    const mine: SaveData = { version: 1, entries: [e('2026-10-02', '폰')], decor: [{ id: 'pot', at: '2026-10', col: 1, row: 0 }] }
    const backup: SaveData = { version: 1, entries: [e('2026-10-03', '백업')], decor: [{ id: 'bench', at: 'plaza', col: 2, row: 0 }] }
    const a = planImport(mine, backupText(backup))
    const b = planImport(save(), backupText(backup))
    if (!a.ok || !b.ok) throw new Error()
    expect(a.save.decor).toEqual(mine.decor)
    expect(b.save.decor).toEqual(backup.decor)
  })
})
