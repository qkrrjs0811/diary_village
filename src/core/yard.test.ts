import { describe, expect, it } from 'vitest'
import { BUILDINGS, EXTRA_WORDS, findBuilding } from './building'
import type { Entry, MoodId } from './types'
import { YARD_TRACES, findYardTrace, yardNote, yardOf, yardTraceInfo } from './yard'

const entry = (text: string, date = '2026-10-28', mood: MoodId = 'calm', more?: string): Entry => ({
  date,
  text,
  mood,
  writtenAt: 0,
  ...(more ? { more } : {}),
})

describe('마당 흔적', () => {
  it('흔적은 8종 이상이고 이름·그림 글자·말이 있으며 id가 겹치지 않는다', () => {
    expect(YARD_TRACES.length).toBeGreaterThanOrEqual(8)
    expect(new Set(YARD_TRACES.map((t) => t.id)).size).toBe(YARD_TRACES.length)
    for (const t of YARD_TRACES) {
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.icon.length).toBeGreaterThan(0)
      expect(t.words.length).toBeGreaterThan(0)
    }
    const ids = YARD_TRACES.map((t) => t.id)
    for (const id of ['bicycle', 'laundry', 'umbrella', 'kite', 'snowman', 'basket']) expect(ids).toContain(id)
  })

  it('건물이 없는 날 한 줄에 나온 말로 흔적 하나가 생긴다', () => {
    expect(findYardTrace('따릉이 타고 출근했다')).toEqual({ id: 'bicycle', word: '따릉이' })
    expect(findYardTrace('이불 빨래를 했다')).toEqual({ id: 'laundry', word: '이불' })
    expect(findYardTrace('하루 종일 장마')).toEqual({ id: 'umbrella', word: '장마' })
    expect(findYardTrace('바람이 많이 불었다')).toEqual({ id: 'kite', word: '바람' })
    expect(findYardTrace('첫눈이 왔다')).toEqual({ id: 'snowman', word: '첫눈' })
    expect(findYardTrace('마트에서 장을 봤다')).toEqual({ id: 'basket', word: '마트' })
    expect(findYardTrace('택배가 왔다')?.id).toBe('mail')
    expect(findYardTrace('친구랑 수다 떨었다')).toEqual({ id: 'chairs', word: '친구' })
    expect(findYardTrace('낮잠을 푹 잤다')?.id).toBe('hammock')
    expect(findYardTrace('오래 걸었다')?.id).toBe('shoes')
  })

  it('여러 말이 맞으면 글에서 먼저 나온 말이 이긴다', () => {
    expect(findYardTrace('친구랑 마트에 갔다')?.id).toBe('chairs')
    expect(findYardTrace('마트에서 친구를 만났다')?.id).toBe('basket')
  })

  it('다른 뜻인 말로는 흔적이 생기지 않는다', () => {
    expect(findYardTrace('준비가 오래 걸렸다')).toBeNull()
    expect(findYardTrace('스마트폰을 바꿨다')).toBeNull()
    expect(findYardTrace('청소년 시절 생각')).toBeNull()
    expect(findYardTrace('바람직한 하루')).toBeNull()
    expect(findYardTrace('엄청 바쁜 날')).toBeNull()
    expect(findYardTrace('그냥 평범한 하루')).toBeNull()
  })

  it('건물이 서는 날에는 흔적이 없다', () => {
    expect(yardOf(entry('비 오는 날 카페에 갔다'))).toBeNull()
    expect(yardOf(entry('자전거 탔다'))).toBeNull() // 자전거는 운동장
    for (const b of BUILDINGS) {
      for (const w of [...b.words, ...EXTRA_WORDS[b.id]]) {
        const e = entry(`친구랑 ${w} 이야기`)
        if (findBuilding(e.text)) expect(yardOf(e)).toBeNull()
      }
    }
  })

  it('건물이 없고 말이 맞으면 그 흔적', () => {
    expect(yardOf(entry('우산을 잃어버렸다'))).toEqual({ id: 'umbrella', word: '우산' })
  })

  it('맞는 말이 없으면 날짜로 고른 작은 흔적이거나 없다(같은 날은 늘 같다)', () => {
    const seen = new Set<string>()
    let none = 0
    for (let d = 1; d <= 28; d++) {
      const date = `2026-02-${String(d).padStart(2, '0')}`
      const a = yardOf(entry('그냥 평범한 하루', date))
      const b = yardOf(entry('아무 일 없었다', date))
      expect(a).toEqual(b)
      if (a) {
        expect(a.word).toBeUndefined()
        seen.add(a.id)
      } else none++
    }
    expect(seen.size).toBeGreaterThanOrEqual(2)
    expect(none).toBeGreaterThan(0)
  })

  it('기분·글 길이·더 쓴 글은 흔적을 바꾸지 않는다', () => {
    const moods: MoodId[] = ['great', 'calm', 'meh', 'blue', 'tired']
    for (const text of ['우산을 챙겼다', '그냥 평범한 하루']) {
      const base = yardOf(entry(text))
      for (const m of moods) expect(yardOf(entry(text, '2026-10-28', m))).toEqual(base)
      expect(yardOf(entry(text, '2026-10-28', 'calm', '친구랑 마트에서 따릉이 타고 왔다'))).toEqual(base)
    }
    expect(yardOf(entry('우산을 챙겼다 그리고 오늘은 정말 길고 길고 길게 써 본다'))).toEqual(yardOf(entry('우산')))
  })

  it('알림 문장: 찾은 말이 있을 때만 알려 준다', () => {
    expect(yardNote({ id: 'bicycle', word: '따릉이' })).toBe("🚲 '따릉이'를 찾아 마당에 자전거가 놓였어요")
    expect(yardNote({ id: 'umbrella', word: '우산' })).toBe("☂️ '우산'을 찾아 마당에 우산이 놓였어요")
    expect(yardNote({ id: 'laundry' })).toBeNull()
    expect(yardNote(null)).toBeNull()
    expect(yardTraceInfo('kite').name).toBe('연')
  })
})
