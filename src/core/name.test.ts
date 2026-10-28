import { describe, expect, it } from 'vitest'
import { DEFAULT_NAME, NAME_MAX, cleanName, renameVillage, villageTitle } from './name'
import { planImport } from './backup'
import { editEntry, writeEntry } from './entries'
import { parseSave } from './storage'
import type { SaveData } from './types'

const entry = { date: '2026-10-27', text: '안녕', mood: 'calm' as const, writtenAt: 5 }
const save = (villageName?: string): SaveData => ({ version: 1, entries: [entry], ...(villageName ? { villageName } : {}) })

describe('마을 이름', () => {
  it('이름이 없으면 기본 이름', () => {
    expect(villageTitle(save())).toBe(DEFAULT_NAME)
    expect(villageTitle(save('햇살 마을'))).toBe('햇살 마을')
  })

  it('앞뒤 빈칸을 지우고 가운데 빈칸은 하나로', () => {
    expect(cleanName('  햇살   마을 ')).toBe('햇살 마을')
  })

  it('이름을 짓고, 비우면 기본 이름으로 돌아간다', () => {
    expect(renameVillage(save(), ' 햇살 마을 ')).toEqual({ ok: true, save: save('햇살 마을') })
    expect(renameVillage(save('햇살 마을'), '   ')).toEqual({ ok: true, save: save() })
  })

  it(`${NAME_MAX}자가 넘는 이름은 짓지 않는다`, () => {
    expect(renameVillage(save(), '가'.repeat(NAME_MAX))).toMatchObject({ ok: true })
    expect(renameVillage(save(), '가'.repeat(NAME_MAX + 1))).toEqual({ ok: false })
  })

  it('한 줄을 쓰거나 고쳐도 이름은 그대로', () => {
    const today = new Date('2026-10-28T12:00:00+09:00').getTime()
    const w = writeEntry(save('햇살 마을'), { text: '새 하루', mood: 'great' }, today)
    expect(w.ok && w.save.villageName).toBe('햇살 마을')
    const e = editEntry(save('햇살 마을'), '2026-10-27', { text: '고친 글', mood: 'calm' }, today)
    expect(e.ok && e.save.villageName).toBe('햇살 마을')
  })

  it('이름을 지어도 기록은 그대로', () => {
    const r = renameVillage(save(), '꽃길')
    expect(r.ok && r.save.entries).toEqual([entry])
  })

  it('이름을 짓거나 비워도 지운 날·놓은 소품·편지는 그대로', () => {
    const full: SaveData = {
      ...save('햇살 마을'),
      erased: [{ date: '2026-10-20', erasedAt: 9 }],
      decor: [{ id: 'bench', at: '2026-10', col: 1, row: 2 }],
      letters: [{ writtenOn: '2026-10-27', writtenAt: 7, opensOn: '2027-10-27', text: '안녕, 내년의 나' }],
    }
    for (const input of ['꽃길', '  ']) {
      const r = renameVillage(full, input)
      expect(r.ok && r.save.erased).toEqual(full.erased)
      expect(r.ok && r.save.decor).toEqual(full.decor)
      expect(r.ok && r.save.letters).toEqual(full.letters)
    }
  })
})

describe('마을 이름 저장', () => {
  it('이름 칸이 없는 이전 저장도 그대로 읽는다', () => {
    expect(parseSave(JSON.stringify({ version: 1, entries: [entry] }))).toEqual(save())
  })

  it('이름을 저장하고 다시 읽는다', () => {
    expect(parseSave(JSON.stringify(save('햇살 마을')))).toEqual(save('햇살 마을'))
  })

  it('이름이 이상해도 글은 버리지 않고 이름 칸만 버린다', () => {
    for (const odd of [3, '', '   ', '가'.repeat(NAME_MAX + 1)]) {
      expect(parseSave(JSON.stringify({ version: 1, entries: [entry], villageName: odd }))).toEqual(save())
    }
  })

  it('가져오기는 폰의 이름을 지키고, 폰에 이름이 없을 때만 백업 이름을 쓴다', () => {
    const backup = JSON.stringify({ version: 1, entries: [{ ...entry, date: '2026-10-26' }], villageName: '백업 마을' })
    const keep = planImport(save('폰 마을'), backup)
    expect(keep.ok && keep.save.villageName).toBe('폰 마을')
    const take = planImport(save(), backup)
    expect(take.ok && take.save.villageName).toBe('백업 마을')
    const none = planImport(save(), JSON.stringify({ version: 1, entries: [] }))
    expect(none.ok && 'villageName' in none.save).toBe(false)
  })
})
