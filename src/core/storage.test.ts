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
