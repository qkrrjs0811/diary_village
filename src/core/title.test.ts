import { describe, expect, it } from 'vitest'
import { TITLE_MAX, checkMonthTitle, isMonth, monthTitleOf, setMonthTitle } from './title'
import { planImport } from './backup'
import { editEntry, eraseEntry, writeEntry } from './entries'
import { writeLetter } from './letter'
import { renameVillage } from './name'
import { removeDecor } from './placing'
import { parseSave } from './storage'
import type { SaveData } from './types'

const entry = { date: '2026-10-27', text: '안녕', mood: 'calm' as const, writtenAt: 5 }
const save = (monthTitles?: Record<string, string>): SaveData => ({ version: 1, entries: [entry], ...(monthTitles ? { monthTitles } : {}) })

describe('달 이름', () => {
  it('달은 YYYY-MM 만 받는다', () => {
    expect(isMonth('2026-10')).toBe(true)
    expect(isMonth('2026-01')).toBe(true)
    for (const odd of ['2026-13', '2026-00', '2026-1', '2026-10-01', 3, '']) expect(isMonth(odd)).toBe(false)
  })

  it('이름을 다듬고 길이를 본다', () => {
    expect(checkMonthTitle('  이사한   10월 ')).toEqual({ ok: true, title: '이사한 10월' })
    expect(checkMonthTitle('   ')).toEqual({ ok: true, title: '' })
    expect(checkMonthTitle('가'.repeat(TITLE_MAX))).toMatchObject({ ok: true })
    expect(checkMonthTitle('가'.repeat(TITLE_MAX + 1))).toEqual({ ok: false, reason: 'too-long' })
  })

  it('이름이 없으면 null', () => {
    expect(monthTitleOf(save(), '2026-10')).toBeNull()
    expect(monthTitleOf(save({ '2026-10': '이사한 달' }), '2026-10')).toBe('이사한 달')
    expect(monthTitleOf(save({ '2026-10': '이사한 달' }), '2026-09')).toBeNull()
  })

  it('이름을 붙이고 고치고, 비우면 걷는다', () => {
    const a = setMonthTitle(save(), '2026-10', ' 이사한 달 ')
    expect(a).toEqual({ ok: true, save: save({ '2026-10': '이사한 달' }) })
    const b = setMonthTitle(a.ok ? a.save : save(), '2026-09', '바빴던 달')
    expect(b.ok && b.save.monthTitles).toEqual({ '2026-09': '바빴던 달', '2026-10': '이사한 달' })
    const c = setMonthTitle(save({ '2026-10': '이사한 달' }), '2026-10', '웃은 달')
    expect(c.ok && c.save.monthTitles).toEqual({ '2026-10': '웃은 달' })
    // 하나 남은 이름을 비우면 칸 자체를 두지 않는다
    expect(setMonthTitle(save({ '2026-10': '이사한 달' }), '2026-10', '  ')).toEqual({ ok: true, save: save() })
    const d = setMonthTitle(save({ '2026-09': '가을', '2026-10': '이사한 달' }), '2026-10', '')
    expect(d.ok && d.save.monthTitles).toEqual({ '2026-09': '가을' })
  })

  it('너무 긴 이름·이상한 달은 붙이지 않는다', () => {
    expect(setMonthTitle(save(), '2026-10', '가'.repeat(TITLE_MAX + 1))).toEqual({ ok: false })
    expect(setMonthTitle(save(), '2026-13', '이름')).toEqual({ ok: false })
  })

  it('이름을 붙여도 기록·지운 날·소품·편지·마을 이름은 그대로', () => {
    const full: SaveData = {
      ...save(),
      erased: [{ date: '2026-10-20', erasedAt: 9 }],
      villageName: '햇살 마을',
      decor: [{ id: 'bench', at: '2026-10', col: 1, row: 2 }],
      letters: [{ writtenOn: '2026-10-27', writtenAt: 7, opensOn: '2027-10-27', text: '안녕, 내년의 나' }],
    }
    const r = setMonthTitle(full, '2026-10', '이사한 달')
    expect(r).toEqual({ ok: true, save: { ...full, monthTitles: { '2026-10': '이사한 달' } } })
  })

  it('다른 저장(쓰기·고치기·지우기·마을 이름·소품 걷기·편지)이 달 이름을 지우지 않는다', () => {
    const titles = { '2026-10': '이사한 달' }
    const base: SaveData = { ...save(titles), decor: [{ id: 'bench', at: '2026-10', col: 1, row: 2 }] }
    const now = new Date('2026-10-28T12:00:00+09:00').getTime()
    const w = writeEntry(base, { text: '새 하루', mood: 'great' }, now)
    expect(w.ok && w.save.monthTitles).toEqual(titles)
    const e = editEntry(base, '2026-10-27', { text: '고친 글', mood: 'calm' }, now)
    expect(e.ok && e.save.monthTitles).toEqual(titles)
    // 그달의 글을 모두 지워도 달 이름은 사용자가 지울 때까지 남는다
    const x = eraseEntry(base, '2026-10-27', now)
    expect(x.ok && x.save.monthTitles).toEqual(titles)
    const n = renameVillage(base, '꽃길')
    expect(n.ok && n.save.monthTitles).toEqual(titles)
    expect(removeDecor(base, 0).monthTitles).toEqual(titles)
    const l = writeLetter(base, { text: '안녕', wait: 'year' }, now)
    expect(l.ok && l.save.monthTitles).toEqual(titles)
  })
})

describe('달 이름 저장', () => {
  it('달 이름 칸이 없는 이전 저장도 그대로 읽는다', () => {
    expect(parseSave(JSON.stringify({ version: 1, entries: [entry] }))).toEqual(save())
  })

  it('달 이름을 저장하고 다시 읽는다', () => {
    const s = save({ '2026-09': '가을', '2026-10': '이사한 달' })
    expect(parseSave(JSON.stringify(s))).toEqual(s)
  })

  it('이상한 칸만 버리고 글과 다른 달 이름은 지킨다', () => {
    const raw = {
      version: 1,
      entries: [entry],
      monthTitles: { '2026-10': '이사한 달', '2026-13': '없는 달', '2026-09': 3, '2026-08': '   ', '2026-07': '가'.repeat(TITLE_MAX + 1), '2026-06': ' 빈칸 ' },
    }
    expect(parseSave(JSON.stringify(raw))).toEqual(save({ '2026-10': '이사한 달' }))
    for (const odd of [3, 'x', [], null, ['이름']]) {
      expect(parseSave(JSON.stringify({ version: 1, entries: [entry], monthTitles: odd }))).toEqual(save())
    }
  })

  it('가져오기는 두 쪽을 합치고, 같은 달은 폰의 이름을 지킨다', () => {
    const backup = JSON.stringify({ version: 1, entries: [{ ...entry, date: '2026-09-01' }], monthTitles: { '2026-09': '백업 가을', '2026-10': '백업 10월' } })
    const r = planImport(save({ '2026-10': '폰 10월' }), backup)
    expect(r.ok && r.save.monthTitles).toEqual({ '2026-09': '백업 가을', '2026-10': '폰 10월' })
    const none = planImport(save(), JSON.stringify({ version: 1, entries: [] }))
    expect(none.ok && 'monthTitles' in none.save).toBe(false)
  })
})
