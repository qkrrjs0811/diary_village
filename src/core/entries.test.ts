import { describe, expect, it } from 'vitest'
import { checkText, MAX_TEXT, writeEntry, entryOn } from './entries'
import type { SaveData } from './types'

const empty: SaveData = { version: 1, entries: [] }
const now = Date.parse('2026-10-27T21:00:00+09:00')

describe('한 줄 쓰기', () => {
  it('오늘 한 줄을 쓰면 오늘 날짜로 기록이 생긴다', () => {
    const r = writeEntry(empty, { text: '  산책하다 고양이를 봤다 ', mood: 'great' }, now)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.save.entries).toEqual([{ date: '2026-10-27', text: '산책하다 고양이를 봤다', mood: 'great', writtenAt: now }])
    expect(entryOn(r.save, '2026-10-27')?.mood).toBe('great')
  })

  it('하루에 한 줄만 쓴다', () => {
    const first = writeEntry(empty, { text: '하나', mood: 'calm' }, now)
    if (!first.ok) throw new Error()
    const second = writeEntry(first.save, { text: '둘', mood: 'calm' }, now + 60_000)
    expect(second).toEqual({ ok: false, reason: 'already' })
  })

  it('빈 글과 너무 긴 글은 받지 않는다', () => {
    expect(checkText('   ')).toEqual({ ok: false, reason: 'empty' })
    expect(checkText('가'.repeat(MAX_TEXT))).toEqual({ ok: true, text: '가'.repeat(MAX_TEXT) })
    expect(checkText('가'.repeat(MAX_TEXT + 1))).toEqual({ ok: false, reason: 'long' })
  })

  it('줄바꿈은 빈칸 하나로 바꿔 한 줄로 만든다', () => {
    expect(checkText('아침\n\n 커피')).toEqual({ ok: true, text: '아침 커피' })
  })

  it('이모지도 한 글자로 센다', () => {
    expect(checkText('🐈'.repeat(MAX_TEXT)).ok).toBe(true)
  })

  it('기록은 날짜순으로 둔다', () => {
    const save: SaveData = { version: 1, entries: [{ date: '2026-10-28', text: 'a', mood: 'calm', writtenAt: 1 }] }
    const r = writeEntry(save, { text: 'b', mood: 'meh' }, now)
    if (!r.ok) throw new Error()
    expect(r.save.entries.map((e) => e.date)).toEqual(['2026-10-27', '2026-10-28'])
  })
})
