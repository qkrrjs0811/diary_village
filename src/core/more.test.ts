import { describe, expect, it } from 'vitest'
import { backupText, planImport } from './backup'
import { buildingOf } from './building'
import { checkMore, editEntry, eraseEntry, MAX_MORE, writeEntry } from './entries'
import { replyOf } from './reply'
import { searchEntries } from './search'
import { parseSave } from './storage'
import type { Entry, SaveData } from './types'

const empty: SaveData = { version: 1, entries: [] }
const now = Date.parse('2026-10-27T21:00:00+09:00')

describe('더 쓰기(긴 글) 다듬기', () => {
  it('앞뒤 빈칸을 걷고 줄바꿈은 그대로 둔다', () => {
    expect(checkMore('  첫 줄\r\n\n둘째 줄  ')).toEqual({ ok: true, more: '첫 줄\n\n둘째 줄' })
  })

  it('세 줄 넘게 빈 줄은 두 줄로 줄인다', () => {
    expect(checkMore('가\n\n\n\n\n나')).toEqual({ ok: true, more: '가\n\n나' })
  })

  it('비어 있으면 긴 글이 없다', () => {
    expect(checkMore(' \n ')).toEqual({ ok: true, more: undefined })
    expect(checkMore(undefined)).toEqual({ ok: true, more: undefined })
  })

  it('너무 길면 받지 않는다(이모지도 한 글자)', () => {
    expect(checkMore('🐈'.repeat(MAX_MORE)).ok).toBe(true)
    expect(checkMore('가'.repeat(MAX_MORE + 1))).toEqual({ ok: false, reason: 'moreLong' })
  })
})

describe('더 쓰기로 쓰고 고치기', () => {
  it('한 줄과 함께 긴 글을 쓴다', () => {
    const r = writeEntry(empty, { text: '바다에 갔다', mood: 'calm', more: '파도가 컸다.\n발이 젖었다.' }, now)
    if (!r.ok) throw new Error()
    expect(r.entry).toEqual({ date: '2026-10-27', text: '바다에 갔다', mood: 'calm', writtenAt: now, more: '파도가 컸다.\n발이 젖었다.' })
  })

  it('긴 글이 비어 있으면 칸을 두지 않는다', () => {
    const r = writeEntry(empty, { text: '하나', mood: 'calm', more: '   ' }, now)
    if (!r.ok) throw new Error()
    expect('more' in r.entry).toBe(false)
  })

  it('긴 글만 있고 한 줄이 비면 쓰지 않는다(한 줄이 집이다)', () => {
    expect(writeEntry(empty, { text: ' ', mood: 'calm', more: '긴 이야기' }, now)).toEqual({ ok: false, reason: 'empty' })
  })

  it('긴 글이 너무 길면 쓰지 않는다', () => {
    expect(writeEntry(empty, { text: '하나', mood: 'calm', more: '가'.repeat(MAX_MORE + 1) }, now)).toEqual({ ok: false, reason: 'moreLong' })
  })

  const written = (() => {
    const r = writeEntry(empty, { text: '바다', mood: 'calm', more: '긴 이야기' }, now)
    if (!r.ok) throw new Error()
    return r.save
  })()

  it('고칠 때 긴 글을 건네지 않으면 긴 글은 그대로 남는다', () => {
    const r = editEntry(written, '2026-10-27', { text: '바다 산책', mood: 'calm' }, now + 1)
    if (!r.ok) throw new Error()
    expect(r.entry.more).toBe('긴 이야기')
  })

  it('긴 글만 고쳐도 고친 것이다', () => {
    const r = editEntry(written, '2026-10-27', { text: '바다', mood: 'calm', more: '다시 쓴 이야기' }, now + 1)
    if (!r.ok) throw new Error()
    expect(r.changed).toBe(true)
    expect(r.entry).toMatchObject({ more: '다시 쓴 이야기', editedAt: now + 1 })
  })

  it('같은 긴 글이면 고친 것이 아니다', () => {
    const r = editEntry(written, '2026-10-27', { text: '바다', mood: 'calm', more: ' 긴 이야기 ' }, now + 1)
    expect(r.ok && r.changed).toBe(false)
  })

  it('사용자가 긴 글을 비우면 그 칸을 걷는다', () => {
    const r = editEntry(written, '2026-10-27', { text: '바다', mood: 'calm', more: '' }, now + 1)
    if (!r.ok) throw new Error()
    expect('more' in r.entry).toBe(false)
  })

  it('지우면 긴 글도 남기지 않는다', () => {
    const r = eraseEntry(written, '2026-10-27', now + 1)
    if (!r.ok) throw new Error()
    expect(JSON.stringify(r.save)).not.toContain('긴 이야기')
  })
})

describe('긴 글 저장과 백업', () => {
  const entry: Entry = { date: '2026-10-27', text: '안녕', mood: 'calm', writtenAt: 5, more: '첫 줄\n둘째 줄' }

  it('긴 글을 저장하고 다시 읽는다', () => {
    const save: SaveData = { version: 1, entries: [entry] }
    expect(parseSave(JSON.stringify(save))).toEqual(save)
  })

  it('긴 글 칸이 없는 이전 저장도 그대로 읽는다', () => {
    const old = { version: 1, entries: [{ date: '2026-10-27', text: '안녕', mood: 'calm', writtenAt: 5 }] }
    expect(parseSave(JSON.stringify(old))).toEqual(old)
  })

  it('긴 글 칸이 이상하면 그 칸만 버리고 한 줄은 지킨다', () => {
    const odd = { version: 1, entries: [{ ...entry, more: 3 }] }
    expect(parseSave(JSON.stringify(odd))?.entries[0]).toEqual({ date: '2026-10-27', text: '안녕', mood: 'calm', writtenAt: 5 })
  })

  it('한도보다 긴 긴 글도 읽을 때는 버리지 않는다(쓴 글은 사라지지 않는다)', () => {
    const long = { version: 1, entries: [{ ...entry, more: '가'.repeat(MAX_MORE + 50) }] }
    expect(parseSave(JSON.stringify(long))?.entries[0].more).toHaveLength(MAX_MORE + 50)
  })

  it('백업 파일에 긴 글이 들어가고 가져오면 되살아난다', () => {
    const text = backupText({ version: 1, entries: [entry] })
    const plan = planImport(empty, text)
    expect(plan.ok && plan.save.entries[0].more).toBe('첫 줄\n둘째 줄')
  })
})

describe('긴 글은 마을에 영향을 주지 않는다', () => {
  const plain: Entry = { date: '2026-10-27', text: '오늘은 그냥 걸었다', mood: 'blue', writtenAt: 5 }
  const long: Entry = { ...plain, more: '커피 한 잔, 바다, 고양이, 책, 빵, 운동, 꽃, 음악, 쉬었다, 맛있는 밥' }

  it('건물은 한 줄에서만 찾는다', () => {
    expect(buildingOf(long)).toEqual(buildingOf(plain))
    expect(buildingOf(long)).toBeNull()
  })

  it('맞장구도 한 줄에서만 정한다', () => {
    expect(replyOf(long)).toBe(replyOf(plain))
  })
})

describe('긴 글에서도 찾기', () => {
  const e = (date: string, text: string, more?: string): Entry => ({ date, text, mood: 'calm', writtenAt: 0, ...(more ? { more } : {}) })

  it('긴 글에 든 말로도 찾는다', () => {
    const list = [e('2026-10-01', '아침', '오후에 커피를 마셨다'), e('2026-10-02', '저녁')]
    expect(searchEntries(list, '커피').map((h) => h.entry.date)).toEqual(['2026-10-01'])
  })

  it('여러 말이 한 줄과 긴 글에 나뉘어 있어도 찾는다', () => {
    expect(searchEntries([e('2026-10-01', '바다', '커피')], '바다 커피')).toHaveLength(1)
  })

  it('긴 글에서 찾으면 그 말 둘레 조각을 함께 준다', () => {
    const more = '가'.repeat(50) + '커피' + '나'.repeat(50)
    const [hit] = searchEntries([e('2026-10-01', '아침', more)], '커피')
    expect(hit.parts).toEqual([{ text: '아침', hit: false }])
    const joined = hit.more!.map((p) => p.text).join('')
    expect(joined.startsWith('…')).toBe(true)
    expect(joined.endsWith('…')).toBe(true)
    expect(hit.more!.filter((p) => p.hit).map((p) => p.text)).toEqual(['커피'])
    expect([...joined].length).toBeLessThan(70)
  })

  it('긴 글 조각은 줄바꿈을 빈칸으로 보인다', () => {
    const [hit] = searchEntries([e('2026-10-01', '아침', '첫 줄\n커피')], '커피')
    expect(hit.more!.map((p) => p.text).join('')).toBe('첫 줄 커피')
  })

  it('긴 글에 말이 없으면 조각이 없다', () => {
    const [hit] = searchEntries([e('2026-10-01', '커피', '긴 이야기')], '커피')
    expect(hit.more).toBeUndefined()
  })
})
