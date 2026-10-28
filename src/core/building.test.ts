import { describe, expect, it } from 'vitest'
import { BUILDINGS, EXTRA_WORDS, NEW_BUILDINGS, buildingNote, buildingOf, findBuilding } from './building'
import { LANDMARKS } from './landmark'
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
    expect(findBuilding('저녁에 산책했다')?.id).not.toBe('bookstore') // '책'이 들어 있지만 책이 아니다
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
    expect(buildingNote(null, 3)).toBeNull()
  })

  it('두 번째부터는 몇 번째로 생겼는지 한 마디를 더한다(첫 번째는 그대로)', () => {
    expect(buildingNote({ id: 'cafe', word: '커피' }, 1)).toBe("☕ '커피'를 찾아 카페가 생겼어요")
    expect(buildingNote({ id: 'cafe', word: '라떼' }, 3)).toBe("☕ '라떼'를 찾아 카페가 세 번째로 생겼어요")
    expect(buildingNote({ id: 'bookstore', word: '책' }, 2)).toBe("📚 '책'을 찾아 책방이 두 번째로 생겼어요")
    expect(buildingNote({ id: 'cafe', word: '커피' }, null)).toBe("☕ '커피'를 찾아 카페가 생겼어요")
  })
})

describe('새 건물 여섯 종(로드맵 R3)', () => {
  const OLD = ['cafe', 'bookstore', 'field', 'catHouse', 'dogHouse', 'flowerShop', 'bakery', 'lighthouse', 'musicHall', 'cinema']
  const NEW = ['restaurant', 'park', 'school', 'station', 'gallery', 'farm']

  it('건물은 16종이고 원래 10종 뒤에 새 여섯 종이 온다', () => {
    expect(BUILDINGS.map((b) => b.id)).toEqual([...OLD, ...NEW])
    expect(NEW_BUILDINGS).toEqual(NEW)
  })

  it('건물 id는 명소 id와 겹치지 않는다(수첩의 칸 이름이 같아지지 않게)', () => {
    for (const l of LANDMARKS) expect(BUILDINGS.map((b) => b.id)).not.toContain(l.id)
  })

  it('흔한 하루의 말로 새 건물이 선다', () => {
    expect(findBuilding('점심에 김밥을 먹었다')).toEqual({ id: 'restaurant', word: '김밥' })
    expect(findBuilding('떡볶이 최고')?.id).toBe('restaurant')
    expect(findBuilding('저녁에 산책했다')).toEqual({ id: 'park', word: '산책' })
    expect(findBuilding('한강으로 소풍')?.id).toBe('park')
    expect(findBuilding('시험 공부를 했다')).toEqual({ id: 'school', word: '시험' })
    expect(findBuilding('기차 타고 여행')).toEqual({ id: 'station', word: '기차' })
    expect(findBuilding('지하철에서 졸았다')?.id).toBe('station')
    expect(findBuilding('전시를 보고 왔다')).toEqual({ id: 'gallery', word: '전시' })
    expect(findBuilding('사진을 많이 찍었다')?.id).toBe('gallery')
    expect(findBuilding('텃밭에 상추를 심었다')).toEqual({ id: 'farm', word: '텃밭' })
    expect(findBuilding('Took the KTX')?.id).toBe('station')
  })

  it('원래 10종의 말이 하나라도 있으면 원래 건물 그대로다(이미 선 건물이 바뀌지 않는다)', () => {
    const oldWords = BUILDINGS.filter((b) => OLD.includes(b.id)).flatMap((b) => b.words.map((w) => [b.id, w] as const))
    const newWords = BUILDINGS.filter((b) => NEW.includes(b.id)).flatMap((b) => b.words)
    expect(newWords.length).toBeGreaterThan(0)
    for (const [id, w] of oldWords) {
      expect(findBuilding(w)?.id).toBe(id)
      for (const n of newWords) {
        expect(findBuilding(`${n} 하고 ${w}`)?.id).toBe(id)
        expect(findBuilding(`${w} 하고 ${n}`)?.id).toBe(id)
      }
    }
    expect(findBuilding('산책하다 커피')?.id).toBe('cafe')
    expect(findBuilding('공원에서 고양이를 봤다')?.id).toBe('catHouse')
  })

  it('새 여섯 종끼리는 원래 규칙대로 먼저 나온 말이 이긴다', () => {
    expect(findBuilding('공부하고 산책')?.id).toBe('school')
    expect(findBuilding('산책하고 공부')?.id).toBe('park')
  })

  it('비슷하지만 다른 뜻의 말로는 새 건물을 정하지 않는다', () => {
    expect(findBuilding('나라면 그랬을 거야')).toBeNull()
    expect(findBuilding('내일이라면 좋겠다')).toBeNull()
    expect(findBuilding('그림자가 길었다')).toBeNull()
    expect(findBuilding('거리에서 버스킹을 봤다')).toBeNull()
    expect(findBuilding('라면 끓여 먹음')?.id).toBe('restaurant')
    expect(findBuilding('밥솥을 새로 샀다')?.id).toBe('restaurant')
  })

  it('알림은 받침에 맞게 붙는다', () => {
    expect(buildingNote({ id: 'restaurant', word: '라면' })).toBe("🍚 '라면'을 찾아 식당이 생겼어요")
    expect(buildingNote({ id: 'park', word: '산책' })).toBe("🌳 '산책'을 찾아 공원이 생겼어요")
    expect(buildingNote({ id: 'station', word: '여행' })).toBe("🚉 '여행'을 찾아 기차역이 생겼어요")
  })
})

describe('늘린 건물 단어(피드백 2026-10-28)', () => {
  const ALL_EXTRA = Object.entries(EXTRA_WORDS).flatMap(([id, ws]) => ws.map((w) => [id, w] as const))

  it('건물마다 말을 더해 단어가 크게 늘었다', () => {
    for (const b of BUILDINGS) expect(EXTRA_WORDS[b.id].length).toBeGreaterThanOrEqual(5)
    expect(ALL_EXTRA.length).toBeGreaterThanOrEqual(100)
  })

  it('더한 말끼리, 원래 말과도 겹치지 않는다', () => {
    const all = [...BUILDINGS.flatMap((b) => b.words), ...ALL_EXTRA.map(([, w]) => w)]
    expect(new Set(all).size).toBe(all.length)
  })

  it('더한 말 하나만 있어도 그 건물이 선다', () => {
    for (const [id, w] of ALL_EXTRA) expect(findBuilding(`오늘은 ${w} 했다`), w).toEqual({ id, word: w })
  })

  it('흔한 하루의 말로 건물이 선다', () => {
    expect(findBuilding('점심에 삼겹살')?.id).toBe('restaurant')
    expect(findBuilding('넷플릭스 정주행')?.id).toBe('cinema')
    expect(findBuilding('학원 끝나고 집')?.id).toBe('school')
    expect(findBuilding('드디어 휴가')?.id).toBe('station')
    expect(findBuilding('도넛 두 개')?.id).toBe('bakery')
    expect(findBuilding('집사 노릇 하루')?.id).toBe('catHouse')
    expect(findBuilding('단풍이 예뻤다')?.id).toBe('park')
    expect(findBuilding('배드민턴 쳤다')?.id).toBe('field')
  })

  it('원래 말이 하나라도 있으면 원래 건물 그대로다(이미 선 건물이 바뀌지 않는다)', () => {
    for (const b of BUILDINGS) {
      for (const w of b.words) {
        const before = findBuilding(w)
        for (const [, x] of ALL_EXTRA) {
          expect(findBuilding(`${x} 하고 ${w}`)).toEqual(before)
          expect(findBuilding(`${w} 하고 ${x}`)).toEqual(before)
        }
      }
    }
  })

  it('더한 말끼리는 먼저 나온 말이 이긴다', () => {
    expect(findBuilding('도넛 먹고 드라마')?.id).toBe('bakery')
    expect(findBuilding('드라마 보며 도넛')?.id).toBe('cinema')
  })

  it('비슷하지만 다른 뜻의 말로는 정하지 않는다', () => {
    expect(findBuilding('마음먹었다')).toBeNull()
    expect(findBuilding('겁먹었다')).toBeNull()
    expect(findBuilding('고기압이 왔다')).toBeNull()
    expect(findBuilding('그냥 평범한 하루')).toBeNull()
  })
})
