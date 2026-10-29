import { describe, expect, it } from 'vitest'
import { monthChapter } from './chapter'
import type { Entry, MoodId, SaveData } from './types'

const e = (date: string, text = '그냥 하루', mood: MoodId = 'calm', extra: Partial<Entry> = {}): Entry => ({
  date,
  text,
  mood,
  writtenAt: 0,
  ...extra,
})
const save = (entries: Entry[], extra: Partial<SaveData> = {}): SaveData => ({ version: 1, entries, ...extra })

describe('한 달 이어 읽기', () => {
  it('그달에 쓴 날을 날짜 순으로 늘어놓고 건물 아이콘·긴 글·소중한 날을 붙인다', () => {
    const s = save([
      e('2026-10-12', '카페에서 커피', 'great', { more: '길게 썼다', treasured: true }),
      e('2026-10-03', '그냥 쉬었다', 'blue'),
      e('2026-09-30', '책 읽기'),
      e('2026-11-01', '빵'),
    ])
    const c = monthChapter(s, '2026-10')
    expect(c.month).toBe('2026-10')
    expect(c.heading).toBe('10월')
    expect(c.written).toBe(2)
    expect(c.days).toEqual([
      { date: '2026-10-03', day: 3, mood: 'blue', text: '그냥 쉬었다', icon: '🏠', more: false, treasured: false },
      { date: '2026-10-12', day: 12, mood: 'great', text: '카페에서 커피', icon: '☕', more: true, treasured: true },
    ])
  })

  it('달 이름이 있으면 장 제목에 붙인다', () => {
    const s = save([e('2026-10-01')], { monthTitles: { '2026-10': '이사한 달' } })
    expect(monthChapter(s, '2026-10').heading).toBe('10월 · 이사한 달')
  })

  it('지운 날은 넣지 않고 빠진 날도 드러내지 않는다', () => {
    const s = save([e('2026-10-01'), e('2026-10-20')], { erased: [{ date: '2026-10-10', erasedAt: 1 }] })
    const c = monthChapter(s, '2026-10')
    expect(c.days.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-20'])
    expect(c.written).toBe(2)
  })

  it('쓴 날이 있는 가장 가까운 지난달·다음 달을 알려 준다(지운 날만 있는 달은 건너뛴다)', () => {
    const s = save([e('2026-06-05'), e('2026-08-01'), e('2026-10-01'), e('2027-01-09')], {
      erased: [{ date: '2026-09-02', erasedAt: 1 }],
    })
    expect(monthChapter(s, '2026-10')).toMatchObject({ prev: '2026-08', next: '2027-01' })
    expect(monthChapter(s, '2026-06')).toMatchObject({ prev: null, next: '2026-08' })
    expect(monthChapter(s, '2027-01')).toMatchObject({ prev: '2026-10', next: null })
  })

  it('쓴 날이 없는 달은 빈 장이다', () => {
    const c = monthChapter(save([e('2026-08-01')]), '2026-10')
    expect(c.written).toBe(0)
    expect(c.days).toEqual([])
    expect(c.prev).toBe('2026-08')
  })

  it('기분·글 길이와 무관하게 모든 날이 같은 모양이다', () => {
    const c = monthChapter(save([e('2026-10-01', '짧', 'great'), e('2026-10-02', '아주 '.repeat(30), 'tired')]), '2026-10')
    expect(Object.keys(c.days[0])).toEqual(Object.keys(c.days[1]))
  })

  it('저장을 바꾸지 않는다', () => {
    const s = save([e('2026-10-02'), e('2026-10-01')])
    const before = JSON.stringify(s)
    monthChapter(s, '2026-10')
    expect(JSON.stringify(s)).toBe(before)
  })
})
