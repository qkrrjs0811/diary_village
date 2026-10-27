import { describe, expect, it } from 'vitest'
import { builtDays, editEntry, entryOn, eraseEntry, writeEntry } from './entries'
import { buildingOf } from './building'
import { earnedLandmarks } from './landmark'
import { residentsOf } from './resident'
import { stageOf } from './stage'
import { unlockedDecors } from './decor'
import { parseSave } from './storage'
import { isTreasured, toggleTreasured, treasuredDays } from './treasure'
import { buildVillage, houseLook } from './village'
import type { SaveData } from './types'

const now = Date.parse('2026-10-28T21:00:00+09:00')
const save: SaveData = {
  version: 1,
  entries: [
    { date: '2026-10-26', text: '바다 보러 감', mood: 'great', writtenAt: 300 },
    { date: '2026-10-20', text: '합격한 날', mood: 'great', writtenAt: 100 },
    { date: '2026-10-22', text: '커피 한 잔', mood: 'calm', writtenAt: 200 },
  ],
}

describe('소중한 날 표시', () => {
  it('누르면 소중한 날이 되고, 다시 누르면 풀린다', () => {
    const on = toggleTreasured(save, '2026-10-22')
    expect(on.ok).toBe(true)
    if (!on.ok) return
    expect(on.treasured).toBe(true)
    expect(entryOn(on.save, '2026-10-22')?.treasured).toBe(true)
    expect(isTreasured(on.save, '2026-10-22')).toBe(true)
    // 원래 기록은 건드리지 않는다
    expect(entryOn(save, '2026-10-22')?.treasured).toBeUndefined()

    const off = toggleTreasured(on.save, '2026-10-22')
    if (!off.ok) throw new Error()
    expect(off.treasured).toBe(false)
    // 푼 날은 칸을 남기지 않아 처음 기록과 같다
    expect(entryOn(off.save, '2026-10-22')).toEqual(entryOn(save, '2026-10-22'))
    expect(isTreasured(off.save, '2026-10-22')).toBe(false)
  })

  it('표시해도 글·기분·쓴 시각·고친 시각은 그대로다', () => {
    const r = toggleTreasured(save, '2026-10-20')
    if (!r.ok) throw new Error()
    const { treasured, ...rest } = entryOn(r.save, '2026-10-20')!
    expect(treasured).toBe(true)
    expect(rest).toEqual(entryOn(save, '2026-10-20'))
    expect(entryOn(r.save, '2026-10-20')?.editedAt).toBeUndefined()
  })

  it('쓰지 않은 날·지운 날은 표시할 수 없다', () => {
    expect(toggleTreasured(save, '2026-10-21')).toEqual({ ok: false, reason: 'missing' })
    const erased = eraseEntry(save, '2026-10-22', now)
    if (!erased.ok) throw new Error()
    expect(toggleTreasured(erased.save, '2026-10-22')).toEqual({ ok: false, reason: 'missing' })
  })

  it('소중한 날 목록은 날짜 순이고 지운 날은 없다', () => {
    let s = save
    for (const d of ['2026-10-26', '2026-10-20', '2026-10-22']) {
      const r = toggleTreasured(s, d)
      if (!r.ok) throw new Error()
      s = r.save
    }
    expect(treasuredDays(s).map((e) => e.date)).toEqual(['2026-10-20', '2026-10-22', '2026-10-26'])
    const erased = eraseEntry(s, '2026-10-22', now)
    if (!erased.ok) throw new Error()
    expect(treasuredDays(erased.save).map((e) => e.date)).toEqual(['2026-10-20', '2026-10-26'])
    expect(treasuredDays(save)).toEqual([])
  })

  it('고치기는 표시를 그대로 두고, 지우기는 표시도 함께 지운다', () => {
    const on = toggleTreasured(save, '2026-10-20')
    if (!on.ok) throw new Error()
    const edited = editEntry(on.save, '2026-10-20', { text: '다시 읽어도 좋은 합격한 날', mood: 'calm' }, now)
    if (!edited.ok) throw new Error()
    expect(edited.entry.treasured).toBe(true)
    expect(isTreasured(edited.save, '2026-10-20')).toBe(true)

    const erased = eraseEntry(edited.save, '2026-10-20', now)
    if (!erased.ok) throw new Error()
    expect(erased.save.erased).toEqual([{ date: '2026-10-20', erasedAt: now }])
    expect(JSON.stringify(erased.save)).not.toContain('합격')
    // 지운 날에 다시 쓰면 표시 없이 새로 시작한다
    const again = writeEntry(erased.save, { text: '새 글', mood: 'calm' }, Date.parse('2026-10-20T21:00:00+09:00'))
    if (!again.ok) throw new Error()
    expect(again.entry.treasured).toBeUndefined()
    expect(isTreasured(again.save, '2026-10-20')).toBe(false)
  })

  it('표시해도 집 모양·건물·명소·단계·주민·소품은 달라지지 않는다', () => {
    let s = save
    for (const d of ['2026-10-26', '2026-10-20']) {
      const r = toggleTreasured(s, d)
      if (!r.ok) throw new Error()
      s = r.save
    }
    for (const e of s.entries) {
      const plain = entryOn(save, e.date)!
      expect(houseLook(e)).toEqual(houseLook(plain))
      expect(buildingOf(e)).toEqual(buildingOf(plain))
    }
    const strip = (v: ReturnType<typeof buildVillage>) => JSON.stringify(v, (k, x) => (k === 'treasured' ? undefined : x))
    expect(strip(buildVillage(s.entries, '2026-10-28'))).toEqual(strip(buildVillage(save.entries, '2026-10-28')))
    const days = builtDays(s)
    expect(days).toEqual(builtDays(save))
    expect(earnedLandmarks(days)).toEqual(earnedLandmarks(builtDays(save)))
    expect(stageOf(days)).toEqual(stageOf(builtDays(save)))
    expect(residentsOf(days)).toEqual(residentsOf(builtDays(save)))
    expect(unlockedDecors(days)).toEqual(unlockedDecors(builtDays(save)))
  })
})

describe('소중한 날 저장 읽기', () => {
  const entry = { date: '2026-10-27', text: '안녕', mood: 'calm' as const, writtenAt: 5 }

  it('소중한 날 표시를 저장하고 다시 읽는다', () => {
    const s = { version: 1 as const, entries: [{ ...entry, treasured: true }] }
    expect(parseSave(JSON.stringify(s))).toEqual(s)
  })

  it('표시 칸이 없는 이전 저장·백업도 그대로 읽는다', () => {
    expect(parseSave(JSON.stringify({ version: 1, entries: [entry] }))).toEqual({ version: 1, entries: [entry] })
  })

  it('표시 칸이 이상하면 그 칸만 버리고 글은 지킨다', () => {
    for (const odd of ['yes', 1, null, false, {}]) {
      const s = { version: 1, entries: [{ ...entry, treasured: odd }] }
      expect(parseSave(JSON.stringify(s))).toEqual({ version: 1, entries: [entry] })
    }
  })
})
