import { describe, expect, it } from 'vitest'
import { echoNote, echoOf, echoTag, echoWords } from './echo'
import type { Entry } from './types'

const e = (date: string, text: string, more?: string): Entry => ({
  date,
  text,
  mood: 'calm',
  writtenAt: 0,
  ...(more ? { more } : {}),
})

describe('메아리로 쓸 말 고르기', () => {
  it('띄어쓰기·문장부호로 나누고 흔한 조사를 뗀다', () => {
    expect(echoWords('엄마랑 바다에서, 떡볶이를 먹었다!')).toEqual(['엄마', '바다', '떡볶이'])
  })

  it('한 글자 말과 오늘·너무·정말·그냥·진짜 같은 흔한 말은 빼고, 같은 말은 한 번만', () => {
    expect(echoWords('오늘 너무 정말 그냥 진짜 비 커피 커피는')).toEqual(['커피'])
  })

  it('조사를 떼면 한 글자가 되는 말은 그대로 둔다', () => {
    expect(echoWords('포도 사과 휴가')).toEqual(['포도', '사과', '휴가'])
  })

  it('이름 끝의 "이"는 떼지 않고, 들·과는 뗀다', () => {
    expect(echoWords('고양이 친구들과')).toEqual(['고양이', '친구'])
  })

  it('세 글자 넘는 풀이말(했다·좋아요·갔는데)은 쓰지 않는다', () => {
    expect(echoWords('산책했다 좋았어요 갔는데 바다')).toEqual(['바다'])
  })

  it('영어는 소문자로, 이모지·숫자만 있는 말은 버린다', () => {
    expect(echoWords('Coffee 🌊 2026 cafe')).toEqual(['coffee', 'cafe'])
  })
})

describe('말의 메아리', () => {
  const list = [
    e('2026-09-01', '바다 보러 갔다'),
    e('2026-09-03', '엄마랑 바다에서 놀았다'),
    e('2026-09-10', '커피 한 잔'),
    e('2026-10-01', '바다가 또 보고 싶다'),
  ]

  it('그날 한 줄의 말을 그 이전에 쓴 가장 최근 날과 쓴 날 수를 찾는다', () => {
    expect(echoOf(list, '2026-10-01')).toEqual({ word: '바다', last: '2026-09-03', days: 2 })
  })

  it('여러 말이 맞으면 한 줄에서 먼저 나온 말', () => {
    const more = [...list, e('2026-10-02', '커피 마시며 바다 생각')]
    expect(echoOf(more, '2026-10-02')).toEqual({ word: '커피', last: '2026-09-10', days: 1 })
  })

  it('먼저 나온 말이 지난날에 없으면 다음 말을 본다', () => {
    const more = [...list, e('2026-10-02', '떡볶이 먹고 바다')]
    expect(echoOf(more, '2026-10-02')).toEqual({ word: '바다', last: '2026-10-01', days: 3 })
  })

  it('지난날의 긴 글에서도 찾는다', () => {
    const more = [e('2026-09-05', '산책', '저녁에 동생이랑 떡볶이를 먹었다'), e('2026-10-02', '떡볶이 최고')]
    expect(echoOf(more, '2026-10-02')).toEqual({ word: '떡볶이', last: '2026-09-05', days: 1 })
  })

  it('그날 이후의 날·같은 날은 꺼내지 않는다', () => {
    expect(echoOf(list, '2026-09-01')).toBeUndefined()
    const later = [e('2026-09-01', '커피'), e('2026-09-02', '커피')]
    expect(echoOf(later, '2026-09-01')).toBeUndefined()
  })

  it('그날 글이 없거나(지운 날 포함) 맞는 말이 없으면 없다', () => {
    expect(echoOf(list, '2026-10-05')).toBeUndefined()
    expect(echoOf([e('2026-09-01', '산'), e('2026-09-02', '오늘 너무 좋다')], '2026-09-02')).toBeUndefined()
  })

  it('기분·글 길이와 무관하다', () => {
    const a = echoOf(list, '2026-10-01')
    const moody = list.map((x) => ({ ...x, mood: 'blue' as const, more: '아주 길게 쓴 긴 글'.repeat(20) }))
    expect(echoOf(moody, '2026-10-01')).toEqual(a)
  })
})

describe('echoNote', () => {
  it('짓는 알림 한 줄: 말과 가장 최근에 쓴 날', () => {
    expect(echoNote({ word: '바다', last: '2026-09-03', days: 2 }, '2026-10-01')).toBe("🔁 '바다' — 9월 3일에도 썼어요")
  })

  it('해가 다르면 해도 붙인다', () => {
    expect(echoNote({ word: '눈사람', last: '2025-12-24', days: 1 }, '2026-01-02')).toBe("🔁 '눈사람' — 2025년 12월 24일에도 썼어요")
  })
})

describe('echoTag', () => {
  const list = [
    e('2026-09-03', '바다 보러 갔다'),
    e('2026-10-01', '바다가 또 보고 싶다'),
    e('2026-10-05', '바다 사진 정리'),
  ]

  it('읽기 창 꼬리표: 메아리 말과 그 말을 쓴 날 수(그날·뒷날 포함, 찾기 창과 같은 수)', () => {
    expect(echoTag(list, '2026-10-01')).toEqual({ word: '바다', days: 3, text: "🔁 '바다'를 쓴 날 3일" })
  })

  it('받침이 있는 말은 을', () => {
    const cats = [e('2026-09-01', '사진 찍기'), e('2026-09-02', '사진 한 장')]
    expect(echoTag(cats, '2026-09-02')?.text).toBe("🔁 '사진'을 쓴 날 2일")
  })

  it('그날 이전에 같은 말이 없으면 없다', () => {
    expect(echoTag(list, '2026-09-03')).toBeUndefined()
    expect(echoTag(list, '2026-10-09')).toBeUndefined()
  })
})
