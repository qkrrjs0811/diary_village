import { describe, expect, it } from 'vitest'
import { loadSave, parseSave, SAVE_KEY, writeSave, type KV } from './storage'

const memory = (init: Record<string, string> = {}): KV => {
  const m = new Map(Object.entries(init))
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}

describe('저장', () => {
  it('같은 사이트의 다른 앱과 겹치지 않는 키를 쓴다', () => {
    expect(SAVE_KEY.startsWith('diary-village:')).toBe(true)
  })

  it('처음이면 빈 기록', () => {
    expect(loadSave(memory())).toEqual({ version: 1, entries: [] })
  })

  it('저장하고 다시 읽는다', () => {
    const kv = memory()
    const save = { version: 1 as const, entries: [{ date: '2026-10-27', text: '안녕', mood: 'calm' as const, writtenAt: 5 }] }
    writeSave(kv, save)
    expect(loadSave(kv)).toEqual(save)
  })

  it('형식이 틀리면 거절한다', () => {
    expect(parseSave('not json')).toBeNull()
    expect(parseSave(JSON.stringify({ version: 2, entries: [] }))).toBeNull()
    expect(parseSave(JSON.stringify({ version: 1, entries: [{ date: '2026-13-01', text: 'a', mood: 'calm', writtenAt: 1 }] }))).toBeNull()
    expect(parseSave(JSON.stringify({ version: 1, entries: [{ date: '2026-10-01', text: 'a', mood: 'angry', writtenAt: 1 }] }))).toBeNull()
  })

  it('같은 날짜가 두 번 있으면 거절한다', () => {
    const e = { date: '2026-10-01', text: 'a', mood: 'calm', writtenAt: 1 }
    expect(parseSave(JSON.stringify({ version: 1, entries: [e, e] }))).toBeNull()
  })

  it('읽을 수 없는 저장은 덮어쓰지 않도록 알린다', () => {
    expect(() => loadSave(memory({ [SAVE_KEY]: '{broken' }))).toThrow()
  })
})

describe('고친 기록 저장', () => {
  it('고친 시각을 저장하고 다시 읽는다', () => {
    const kv = memory()
    const save = { version: 1 as const, entries: [{ date: '2026-10-27', text: '고친 글', mood: 'calm' as const, writtenAt: 5, editedAt: 9 }] }
    writeSave(kv, save)
    expect(loadSave(kv)).toEqual(save)
  })

  it('고친 시각이 없는 이전 기록도 그대로 읽는다', () => {
    const old = { version: 1, entries: [{ date: '2026-10-27', text: '안녕', mood: 'calm', writtenAt: 5 }] }
    expect(parseSave(JSON.stringify(old))).toEqual(old)
  })

  it('고친 시각이 이상해도 글은 버리지 않는다', () => {
    const odd = { version: 1, entries: [{ date: '2026-10-27', text: '안녕', mood: 'calm', writtenAt: 5, editedAt: 'x' }] }
    expect(parseSave(JSON.stringify(odd))).toEqual({ version: 1, entries: [{ date: '2026-10-27', text: '안녕', mood: 'calm', writtenAt: 5 }] })
  })
})

describe('지운 날 읽기', () => {
  const entry = { date: '2026-10-27', text: '안녕', mood: 'calm' as const, writtenAt: 5 }

  it('지운 날(날짜·지운 시각)을 함께 저장하고 다시 읽는다', () => {
    const save = { version: 1 as const, entries: [entry], erased: [{ date: '2026-10-20', erasedAt: 9 }] }
    expect(parseSave(JSON.stringify(save))).toEqual(save)
  })

  it('지운 날 칸이 없는 이전 저장도 그대로 읽는다', () => {
    expect(parseSave(JSON.stringify({ version: 1, entries: [entry] }))).toEqual({ version: 1, entries: [entry] })
  })

  it('지운 날 칸이 이상하면 그 칸만 버리고 글은 지킨다', () => {
    expect(parseSave(JSON.stringify({ version: 1, entries: [entry], erased: 'x' }))).toEqual({ version: 1, entries: [entry] })
    const odd = {
      version: 1,
      entries: [entry],
      erased: [
        { date: 'nope', erasedAt: 1 },
        { date: '2026-10-20', erasedAt: 2, text: '글' },
        { date: '2026-10-27', erasedAt: 3 },
        { date: '2026-10-20', erasedAt: 4 },
      ],
    }
    // 날짜가 틀린 칸·글이 있는 날·겹친 날은 빼고, 날짜와 지운 시각만 읽는다
    expect(parseSave(JSON.stringify(odd))).toEqual({ version: 1, entries: [entry], erased: [{ date: '2026-10-20', erasedAt: 2 }] })
  })
})
