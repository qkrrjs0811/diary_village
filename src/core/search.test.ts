import { describe, expect, it } from 'vitest'
import { searchEntries, searchWords } from './search'
import type { Entry } from './types'

const e = (date: string, text: string): Entry => ({ date, text, mood: 'calm', writtenAt: 0 })

describe('단어로 지난 글 찾기', () => {
  it('찾을 말은 띄어쓰기로 나누고, 앞뒤 빈칸과 빈 말은 버린다', () => {
    expect(searchWords('  커피   산책 ')).toEqual(['커피', '산책'])
    expect(searchWords('   ')).toEqual([])
  })

  it('빈 말로는 아무것도 찾지 않는다', () => {
    expect(searchEntries([e('2026-10-01', '커피')], '  ')).toEqual([])
  })

  it('그 말이 들어간 글을 최근 날부터 찾는다', () => {
    const list = [e('2026-10-01', '아침 커피'), e('2026-10-05', '비 오는 날'), e('2026-10-09', '커피를 두 잔')]
    expect(searchEntries(list, '커피').map((h) => h.entry.date)).toEqual(['2026-10-09', '2026-10-01'])
  })

  it('여러 말을 쓰면 모두 들어간 글만 찾고, 영어는 대소문자를 가리지 않는다', () => {
    const list = [e('2026-10-01', 'Coffee 한 잔과 산책'), e('2026-10-02', 'coffee만'), e('2026-10-03', '산책만')]
    expect(searchEntries(list, 'COFFEE 산책').map((h) => h.entry.date)).toEqual(['2026-10-01'])
  })

  it('찾은 말이 있는 곳을 나누어 알려 준다(겹치거나 붙은 곳은 하나로)', () => {
    const [hit] = searchEntries([e('2026-10-01', '커피커피 마시고 Coffee')], '커피 coffee')
    expect(hit.parts).toEqual([
      { text: '커피커피', hit: true },
      { text: ' 마시고 ', hit: false },
      { text: 'Coffee', hit: true },
    ])
  })

  it('못 찾으면 빈 목록이다', () => {
    expect(searchEntries([e('2026-10-01', '아침 커피')], '바다')).toEqual([])
  })
})
