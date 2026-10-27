import { describe, expect, it } from 'vitest'
import { BUILDINGS, buildingNote, buildingOf, findBuilding } from './building'
import type { Entry } from './types'

describe('글 단어로 건물 정하기', () => {
  it('건물은 8종 이상이고 이름·단어가 있으며 id가 겹치지 않는다', () => {
    expect(BUILDINGS.length).toBeGreaterThanOrEqual(8)
    expect(new Set(BUILDINGS.map((b) => b.id)).size).toBe(BUILDINGS.length)
    for (const b of BUILDINGS) {
      expect(b.name.length).toBeGreaterThan(0)
      expect(b.words.length).toBeGreaterThan(0)
      expect(b.icon.length).toBeGreaterThan(0)
    }
    const ids = BUILDINGS.map((b) => b.id)
    for (const id of ['cafe', 'bookstore', 'field', 'catHouse', 'flowerShop', 'bakery', 'lighthouse', 'musicHall']) {
      expect(ids).toContain(id)
    }
  })

  it('기획서의 예시 단어로 건물이 정해진다', () => {
    expect(findBuilding('오늘 커피가 맛있었다')).toEqual({ id: 'cafe', word: '커피' })
    expect(findBuilding('카페에서 쉬었다')?.id).toBe('cafe')
    expect(findBuilding('책을 다 읽었다')).toEqual({ id: 'bookstore', word: '책' })
    expect(findBuilding('아침에 운동했다')?.id).toBe('field')
    expect(findBuilding('한강에서 달리기')?.id).toBe('field')
    expect(findBuilding('고양이가 무릎에 앉았다')).toEqual({ id: 'catHouse', word: '고양이' })
    expect(findBuilding('바다를 보고 왔다')).toEqual({ id: 'lighthouse', word: '바다' })
    expect(findBuilding('꽃 한 송이를 샀다')?.id).toBe('flowerShop')
    expect(findBuilding('갓 구운 빵 냄새')?.id).toBe('bakery')
    expect(findBuilding('좋아하는 노래를 들었다')?.id).toBe('musicHall')
  })

  it('조사가 붙어도, 띄어쓰기가 달라도 찾는다', () => {
    expect(findBuilding('커피를')?.id).toBe('cafe')
    expect(findBuilding('고양이랑 놀았다')?.id).toBe('catHouse')
  })

  it('맞는 말이 없으면 보통 집(null)', () => {
    expect(findBuilding('그냥 평범한 하루')).toBeNull()
    expect(findBuilding('')).toBeNull()
  })

  it('비슷하지만 다른 뜻의 말로는 정하지 않는다', () => {
    expect(findBuilding('저녁에 산책했다')).toBeNull() // '책'이 들어 있지만 책이 아니다
    expect(findBuilding('책임감이 무거웠다')).toBeNull()
    expect(findBuilding('산책하다 책방에 들렀다')).toEqual({ id: 'bookstore', word: '책방' })
  })

  it('영어 단어는 대소문자를 가리지 않는다', () => {
    expect(findBuilding('Coffee time')).toEqual({ id: 'cafe', word: 'coffee' })
  })

  it('여러 개가 맞으면 글에서 먼저 나온 말이 이긴다', () => {
    expect(findBuilding('고양이 보고 커피 마심')?.id).toBe('catHouse')
    expect(findBuilding('커피 마시고 고양이 봄')?.id).toBe('cafe')
  })

  it('같은 자리에서 시작하면 더 긴 말이 이긴다', () => {
    // '빵'과 '빵집'이 같은 자리 → 더 긴 '빵집'
    expect(findBuilding('빵집 들렀다')).toEqual({ id: 'bakery', word: '빵집' })
  })

  it('글 길이는 건물에 영향을 주지 않는다(같은 단어면 같은 건물)', () => {
    const short = findBuilding('커피')
    const long = findBuilding('커피' + ' 정말 길게 쓴 하루'.repeat(5))
    expect(long).toEqual(short)
  })

  it('기분은 건물을 바꾸지 않는다', () => {
    const base: Entry = { date: '2026-10-27', text: '책 읽은 날', mood: 'great', writtenAt: 0 }
    expect(buildingOf({ ...base, mood: 'blue' })).toEqual(buildingOf(base))
    expect(buildingOf(base)?.id).toBe('bookstore')
  })

  it('고친 글에 맞게 건물이 바뀐다(기록에서 계산하므로)', () => {
    const before: Entry = { date: '2026-10-27', text: '커피 한 잔', mood: 'calm', writtenAt: 0 }
    const after: Entry = { ...before, text: '바다 보러 감', editedAt: 1 }
    expect(buildingOf(before)?.id).toBe('cafe')
    expect(buildingOf(after)?.id).toBe('lighthouse')
  })

  it('단어 목록끼리 같은 말이 두 건물에 들어 있지 않다', () => {
    const all = BUILDINGS.flatMap((b) => b.words)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('건물이 생겼다는 알림', () => {
  it('찾은 말과 건물 이름으로 알려 준다', () => {
    expect(buildingNote({ id: 'cafe', word: '커피' })).toBe("☕ '커피'를 찾아 카페가 생겼어요")
    expect(buildingNote({ id: 'lighthouse', word: '바다' })).toBe("🌊 '바다'를 찾아 등대가 생겼어요")
  })

  it('받침에 맞게 을/를, 이/가를 붙인다', () => {
    expect(buildingNote({ id: 'bookstore', word: '책' })).toBe("📚 '책'을 찾아 책방이 생겼어요")
    expect(buildingNote({ id: 'field', word: '운동' })).toBe("⚽ '운동'을 찾아 운동장이 생겼어요")
    expect(buildingNote({ id: 'catHouse', word: '고양이' })).toBe("🐱 '고양이'를 찾아 고양이 집이 생겼어요")
    expect(buildingNote({ id: 'cafe', word: 'coffee' })).toBe("☕ 'coffee'를 찾아 카페가 생겼어요")
  })

  it('맞는 말이 없으면 알림이 없다', () => {
    expect(buildingNote(null)).toBeNull()
  })
})
