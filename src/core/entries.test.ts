import { describe, expect, it } from 'vitest'
import { checkText, MAX_TEXT, writeEntry, entryOn, yesterdayOpen, editEntry, eraseEntry, builtDays, neighborDays } from './entries'
import { earnedLandmarks } from './landmark'
import { stageOf } from './stage'
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

describe('어제 한 줄 쓰기', () => {
  it('어제를 안 썼으면 어제 자리가 열려 있다', () => {
    expect(yesterdayOpen(empty, now)).toBe('2026-10-26')
  })

  it('어제를 이미 썼으면 열려 있지 않다', () => {
    const save: SaveData = { version: 1, entries: [{ date: '2026-10-26', text: 'a', mood: 'calm', writtenAt: 1 }] }
    expect(yesterdayOpen(save, now)).toBeNull()
  })

  it('어제 날짜로 쓰고, 쓴 시각은 지금으로 남긴다', () => {
    const r = writeEntry(empty, { text: '늦게 남기는 어제', mood: 'tired' }, now, 'yesterday')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.entry).toEqual({ date: '2026-10-26', text: '늦게 남기는 어제', mood: 'tired', writtenAt: now })
    expect(yesterdayOpen(r.save, now)).toBeNull()
    // 오늘 자리는 그대로 비어 있다
    expect(entryOn(r.save, '2026-10-27')).toBeUndefined()
  })

  it('어제도 하루에 한 줄만 쓴다', () => {
    const first = writeEntry(empty, { text: '하나', mood: 'calm' }, now, 'yesterday')
    if (!first.ok) throw new Error()
    expect(writeEntry(first.save, { text: '둘', mood: 'calm' }, now, 'yesterday')).toEqual({ ok: false, reason: 'already' })
  })

  it('달이 바뀐 첫날에도 지난달 마지막 날을 어제로 쓴다', () => {
    const nov1 = Date.parse('2026-11-01T00:30:00+09:00')
    expect(yesterdayOpen(empty, nov1)).toBe('2026-10-31')
    const r = writeEntry(empty, { text: '자정 넘어 쓰는 핼러윈', mood: 'great' }, nov1, 'yesterday')
    expect(r.ok && r.entry.date).toBe('2026-10-31')
  })
})

describe('쓴 글 고치기', () => {
  const written: SaveData = {
    version: 1,
    entries: [
      { date: '2026-10-20', text: '처음 쓴 글', mood: 'blue', writtenAt: 100 },
      { date: '2026-10-26', text: '어제 글', mood: 'calm', writtenAt: 200 },
    ],
  }

  it('글과 기분을 바꾸고, 처음 쓴 시각은 그대로 두고 고친 시각을 남긴다', () => {
    const r = editEntry(written, '2026-10-20', { text: '  다시 보니 좋은 날 ', mood: 'great' }, now)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.changed).toBe(true)
    expect(r.entry).toEqual({ date: '2026-10-20', text: '다시 보니 좋은 날', mood: 'great', writtenAt: 100, editedAt: now })
    expect(r.save.entries).toHaveLength(2)
    expect(entryOn(r.save, '2026-10-26')).toEqual(written.entries[1])
    // 원래 기록은 건드리지 않는다
    expect(written.entries[0].text).toBe('처음 쓴 글')
  })

  it('오래전 날도 고칠 수 있다', () => {
    const r = editEntry(written, '2026-10-26', { text: '어제 글', mood: 'tired' }, now)
    expect(r.ok && r.entry.mood).toBe('tired')
  })

  it('빈 글이나 너무 긴 글로는 고치지 않는다(원래 글을 지킨다)', () => {
    expect(editEntry(written, '2026-10-20', { text: '  ', mood: 'calm' }, now)).toEqual({ ok: false, reason: 'empty' })
    expect(editEntry(written, '2026-10-20', { text: '가'.repeat(MAX_TEXT + 1), mood: 'calm' }, now)).toEqual({ ok: false, reason: 'long' })
  })

  it('쓰지 않은 날은 고칠 수 없다', () => {
    expect(editEntry(written, '2026-10-21', { text: '새 글', mood: 'calm' }, now)).toEqual({ ok: false, reason: 'missing' })
  })

  it('바뀐 게 없으면 고친 시각을 남기지 않는다', () => {
    const r = editEntry(written, '2026-10-20', { text: '처음 쓴 글 ', mood: 'blue' }, now)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.changed).toBe(false)
    expect(r.entry).toEqual(written.entries[0])
  })
})

describe('쓴 글 지우기', () => {
  const written: SaveData = {
    version: 1,
    entries: [
      { date: '2026-10-20', text: '지울 글', mood: 'blue', writtenAt: 100 },
      { date: '2026-10-26', text: '남길 글', mood: 'calm', writtenAt: 200 },
    ],
  }

  it('글은 남기지 않고 날짜와 지운 시각만 남긴다', () => {
    const r = eraseEntry(written, '2026-10-20', now)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.save.entries).toEqual([written.entries[1]])
    expect(r.save.erased).toEqual([{ date: '2026-10-20', erasedAt: now }])
    expect(JSON.stringify(r.save)).not.toContain('지울 글')
    // 원래 기록은 건드리지 않는다
    expect(written.entries).toHaveLength(2)
  })

  it('쓰지 않은 날은 지울 수 없다', () => {
    expect(eraseEntry(written, '2026-10-21', now)).toEqual({ ok: false, reason: 'missing' })
  })

  it('지운 날도 집을 지었던 날로 세어 명소·마을 단계를 빼앗지 않는다', () => {
    const many: SaveData = {
      version: 1,
      entries: Array.from({ length: 10 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, text: '한 줄', mood: 'calm' as const, writtenAt: i })),
    }
    const r = eraseEntry(many, '2026-10-03', now)
    if (!r.ok) throw new Error()
    const days = builtDays(r.save)
    expect(days).toHaveLength(10)
    expect(earnedLandmarks(days).map((l) => l.id)).toEqual(['well'])
    expect(stageOf(days).name).toBe('마을')
  })

  it('지운 날(오늘·어제)에 다시 쓰면 지운 표시는 사라지고 날 수는 그대로다', () => {
    const today: SaveData = { version: 1, entries: [{ date: '2026-10-27', text: '오늘 글', mood: 'calm', writtenAt: 1 }] }
    const erased = eraseEntry(today, '2026-10-27', now)
    if (!erased.ok) throw new Error()
    expect(erased.save.entries).toEqual([])
    expect(builtDays(erased.save)).toHaveLength(1)
    const again = writeEntry(erased.save, { text: '다시 쓴 글', mood: 'great' }, now + 1)
    if (!again.ok) throw new Error()
    expect(again.save.erased).toBeUndefined()
    expect(builtDays(again.save)).toHaveLength(1)
  })

  it('지운 날이 없으면 기록 날짜만 센다', () => {
    expect(builtDays(written).map((d) => d.date)).toEqual(['2026-10-20', '2026-10-26'])
  })
})

describe('앞뒤 날 넘겨 읽기', () => {
  const at = (date: string) => ({ date, text: date, mood: 'calm' as const, writtenAt: now })
  // 저장 순서가 섞여 있어도 날짜 순서로 본다
  const entries = [at('2026-10-20'), at('2026-10-03'), at('2026-10-12'), at('2026-09-30')]

  it('쓴 날 중 바로 앞·뒤 날을 찾고, 빈 날은 건너뛴다', () => {
    expect(neighborDays(entries, '2026-10-12')).toEqual({ prev: '2026-10-03', next: '2026-10-20' })
    expect(neighborDays(entries, '2026-10-03')).toEqual({ prev: '2026-09-30', next: '2026-10-12' })
  })

  it('처음 날엔 앞 날이, 마지막 날엔 뒷 날이 없다', () => {
    expect(neighborDays(entries, '2026-09-30')).toEqual({ prev: null, next: '2026-10-03' })
    expect(neighborDays(entries, '2026-10-20')).toEqual({ prev: '2026-10-12', next: null })
    expect(neighborDays([at('2026-10-27')], '2026-10-27')).toEqual({ prev: null, next: null })
  })

  it('지운 날은 건너뛴다', () => {
    const save: SaveData = { version: 1, entries: [at('2026-10-25'), at('2026-10-26'), at('2026-10-27')] }
    const r = eraseEntry(save, '2026-10-26', now)
    if (!r.ok) throw new Error()
    expect(neighborDays(r.save.entries, '2026-10-25')).toEqual({ prev: null, next: '2026-10-27' })
    expect(neighborDays(r.save.entries, '2026-10-27')).toEqual({ prev: '2026-10-25', next: null })
  })

  it('쓰지 않은 날에서도 그 앞·뒤 쓴 날을 찾는다', () => {
    expect(neighborDays(entries, '2026-10-10')).toEqual({ prev: '2026-10-03', next: '2026-10-12' })
  })
})
