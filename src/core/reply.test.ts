import { describe, expect, it } from 'vitest'
import { ALL_REPLIES, REPLY_KINDS, replyKind, replyOf } from './reply'
import type { Entry, MoodId } from './types'

const e = (text: string, extra: Partial<Entry> = {}): Entry => ({ date: '2026-10-28', text, mood: 'calm', writtenAt: 0, ...extra })
const days = Array.from({ length: 40 }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10))

describe('맞장구 갈래', () => {
  it('글 단어로 갈래를 찾는다', () => {
    expect(replyKind('오늘 너무 피곤해서 일찍 잘래')).toBe('rest')
    expect(replyKind('떡볶이 먹었는데 맛있었다')).toBe('food')
    expect(replyKind('엄마랑 통화했다')).toBe('together')
    expect(replyKind('비가 와서 우산을 썼다')).toBe('weather')
    expect(replyKind('첫눈이 왔다')).toBe('weather')
    expect(replyKind('회의가 길었다')).toBe('effort')
    expect(replyKind('시험 끝!')).toBe('effort')
    expect(replyKind('하루 종일 웃었다')).toBe('joy')
    expect(replyKind('조금 속상한 날')).toBe('comfort')
  })

  it('다른 뜻인 말에는 맞장구 갈래가 생기지 않는다', () => {
    expect(replyKind('비밀 이야기를 준비했다')).toBeNull()
    expect(replyKind('잠깐 눈치를 봤다')).toBeNull()
    expect(replyKind('똑같이 흘러간 하루')).toBeNull()
    expect(replyKind('일요일')).toBeNull()
  })

  it('여러 갈래가 맞으면 정해진 순서로 하나만 고른다(글 속 순서와 무관)', () => {
    expect(replyKind('친구랑 맛있는 거 먹었는데 속상했다')).toBe('comfort')
    expect(replyKind('속상했는데 친구랑 맛있는 거 먹었다')).toBe('comfort')
    expect(replyKind('맛있는 거 먹고 친구랑 웃었다')).toBe(replyKind('친구랑 웃고 맛있는 거 먹었다'))
    expect(REPLY_KINDS[0]).toBe('comfort')
  })

  it('맞는 말이 없으면 null', () => {
    expect(replyKind('그냥 그런 하루')).toBeNull()
    expect(replyKind('')).toBeNull()
  })
})

describe('맞장구 한마디', () => {
  it('지운 날(글 없음)은 말이 없다', () => {
    expect(replyOf(null)).toBeNull()
    expect(replyOf(undefined)).toBeNull()
  })

  it('같은 글은 같은 말, 고치면 따라 바뀐다', () => {
    const a = e('오늘 너무 피곤했다')
    expect(replyOf(a)).toBe(replyOf({ ...a, writtenAt: 99, editedAt: 100, treasured: true }))
    const b = { ...a, text: '친구랑 놀았다' }
    expect(replyOf(b)).not.toBe(replyOf(a))
  })

  it('갈래마다 말결이 맞다', () => {
    expect(replyOf(e('피곤해'))).toMatch(/쉬|잠|자/)
    expect(replyOf(e('속상해'))).toMatch(/곁|괜찮|토닥|안아/)
  })

  it('맞는 말이 없으면 건물이나 기분에 맞춘 다정한 말이다', () => {
    const moods: MoodId[] = ['great', 'calm', 'meh', 'blue', 'tired']
    for (const mood of moods) {
      const r = replyOf(e('그냥 그런 하루', { mood }))
      expect(r).toBeTruthy()
    }
    // 건물이 있으면 건물 말: 커피(카페)는 갈래 말이 아니다
    expect(replyOf(e('아메리카노 한 잔'))).toMatch(/카페|커피/)
  })

  it('글 길이와 무관하다(긴 글이 더 받지 않는다)', () => {
    for (const d of days) {
      const short = e('피곤해', { date: d })
      const long = e(`피곤해 ${'그리고 그냥 '.repeat(15)}`.slice(0, 100), { date: d })
      expect(replyOf(long)).toBe(replyOf(short))
      expect(replyOf(e('그냥', { date: d }))).toBe(replyOf(e('그냥 그냥 그냥 그냥 그냥 그냥', { date: d })))
    }
  })

  it('말은 언제나 정해진 말 목록 안에 있다(글 조각을 옮기지 않는다)', () => {
    const texts = ['피곤해 김치찌개', '친구 철수랑 커피', '비 오는 날 우산', '시험 망했다', '행복해 ㅎㅎ', '울었다', '그냥 하루', '고양이 냥냥', 'abc xyz']
    const moods: MoodId[] = ['great', 'calm', 'meh', 'blue', 'tired']
    for (const d of days) for (const t of texts) for (const mood of moods) {
      const r = replyOf(e(t, { date: d, mood }))!
      expect(ALL_REPLIES).toContain(r)
      expect(r).not.toContain('철수')
      expect(r).not.toContain('김치찌개')
    }
  })

  it('날짜에 따라 갈래 안에서 여러 말을 고르게 쓴다', () => {
    const seen = new Set(days.map((d) => replyOf(e('피곤해', { date: d }))))
    expect(seen.size).toBeGreaterThan(1)
  })

  it('평가·재촉·연속 기록 말이 없고, 말풍선에 들어가게 짧다', () => {
    for (const r of ALL_REPLIES) {
      expect(r).not.toMatch(/잘했|더 써|더 많이|연속|빠졌|빼먹|내일도 써|매일|열심히 해/)
      expect(r.length).toBeLessThanOrEqual(28)
      expect(r.length).toBeGreaterThan(0)
    }
  })

  it('기분은 말결만 바꾸고 갈래가 맞으면 기분과 무관하게 같은 갈래 말이다', () => {
    const a = replyOf(e('친구랑 놀았다', { mood: 'great' }))
    const b = replyOf(e('친구랑 놀았다', { mood: 'blue' }))
    expect(a).toBe(b)
  })
})
