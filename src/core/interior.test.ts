import { describe, expect, it } from 'vitest'
import { BUILDINGS } from './building'
import { COZY_ITEMS, FLOORS, roomOf, SIGNATURE, WALLPAPERS } from './interior'
import { MOODS } from './mood'
import type { Entry } from './types'
import { houseLook } from './village'

const e = (date: string, text = '오늘도 무사히', mood: Entry['mood'] = 'calm'): Entry => ({ date, text, mood, writtenAt: 0 })

describe('집 안 방', () => {
  it('같은 날은 언제 열어도 같은 방이다', () => {
    expect(roomOf(e('2026-10-28'))).toEqual(roomOf(e('2026-10-28')))
  })

  it('가구는 모든 날 세 개이고 서로 겹치지 않는다', () => {
    for (let d = 1; d <= 31; d++) {
      const date = `2026-10-${String(d).padStart(2, '0')}`
      for (const b of [null, ...BUILDINGS]) {
        const room = roomOf(e(date, b ? b.words[0] : '그냥 하루'))
        expect(room.items).toHaveLength(3)
        expect(new Set(room.items).size).toBe(3)
      }
    }
  })

  it('건물마다 대표 가구가 첫 자리에 놓이고, 건물마다 다르다', () => {
    const sigs = BUILDINGS.map((b) => {
      const room = roomOf(e('2026-10-28', b.words[0]))
      expect(room.items[0]).toBe(SIGNATURE[b.id])
      return room.items[0]
    })
    expect(new Set(sigs).size).toBe(BUILDINGS.length)
  })

  it('보통 집은 날짜로 고른 아늑한 가구가 첫 자리에 놓인다', () => {
    const firsts = new Set<string>()
    for (let d = 1; d <= 28; d++) {
      const room = roomOf(e(`2026-10-${String(d).padStart(2, '0')}`))
      expect(COZY_ITEMS).toContain(room.items[0])
      firsts.add(room.items[0])
    }
    expect(firsts.size).toBeGreaterThan(3)
  })

  it('글 길이는 방을 바꾸지 않는다', () => {
    expect(roomOf(e('2026-10-28', '하루'))).toEqual(roomOf(e('2026-10-28', '하루가 아주 길고 길어서 한참을 적어 내려간 날이었다'.repeat(2))))
    expect(roomOf(e('2026-10-28', '커피'))).toEqual(roomOf(e('2026-10-28', '아침에 커피를 마시고 길게 이야기를 나눴다')))
  })

  it('기분은 커튼 색만 바꾸고(지붕 색과 같다) 가구·벽지·바닥은 그대로다', () => {
    const rooms = MOODS.map((m) => roomOf(e('2026-10-28', '책 읽은 날', m.id)))
    for (const [i, r] of rooms.entries()) {
      expect(r.curtain).toBe(houseLook(e('2026-10-28', '책 읽은 날', MOODS[i].id)).roof)
      expect({ ...r, curtain: '' }).toEqual({ ...rooms[0], curtain: '' })
    }
  })

  it('글을 고쳐 건물이 바뀌면 대표 가구만 바뀐다', () => {
    const before = roomOf(e('2026-10-28', '커피 한 잔'))
    const after = roomOf(e('2026-10-28', '빵 한 조각'))
    expect(before.items[0]).toBe(SIGNATURE.cafe)
    expect(after.items[0]).toBe(SIGNATURE.bakery)
    expect(after.items.slice(1)).toEqual(before.items.slice(1))
    expect({ ...after, items: [] }).toEqual({ ...before, items: [] })
  })

  it('벽지·바닥은 날짜로 정하고, 이웃한 날 방이 닮지 않는다', () => {
    for (let d = 1; d < 28; d++) {
      const a = roomOf(e(`2026-10-${String(d).padStart(2, '0')}`))
      const b = roomOf(e(`2026-10-${String(d + 1).padStart(2, '0')}`))
      expect(WALLPAPERS).toContain(a.wall)
      expect(FLOORS).toContain(a.floor)
      expect(a.wall).not.toBe(b.wall)
    }
  })

  it('창밖은 그날 계절이다', () => {
    expect(roomOf(e('2026-04-10')).view).toBe('spring')
    expect(roomOf(e('2026-07-10')).view).toBe('summer')
    expect(roomOf(e('2026-10-10')).view).toBe('autumn')
    expect(roomOf(e('2026-01-10')).view).toBe('winter')
  })
})
