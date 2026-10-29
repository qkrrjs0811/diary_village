import { describe, expect, it } from 'vitest'
import { NOTE_ORDER, NOTE_PAGE, noteCells, notePages, noteStay } from './note'

describe('짓는 알림 칸', () => {
  it('정해 둔 차례로 늘어놓고 빈 줄은 뺀다', () => {
    const cells = noteCells({
      guest: '콩이: “좋은 하루였네요”',
      decor: '🪑 꾸밈 소품 벤치가 열렸어요',
      building: "☕ '커피'를 찾아 카페가 생겼어요",
      neighbor: null,
      friend: undefined,
      anniversary: false,
    })
    expect(cells.map((c) => c.kind)).toEqual(['building', 'decor', 'guest'])
    expect(NOTE_ORDER).toEqual(['building', 'neighbor', 'friend', 'anniversary', 'decor', 'guest'])
  })

  it('앞 그림글자는 아이콘으로 떼고 글은 그대로 둔다', () => {
    const [a, b] = noteCells({
      friend: '💛 보리와 친한 이웃, 달래와 안녕 이웃이 되었어요',
      anniversary: '🎉 콩이가 이사 온 지 100일 되는 날이에요',
    })
    expect(a).toEqual({ kind: 'friend', icon: '💛', text: '보리와 친한 이웃, 달래와 안녕 이웃이 되었어요' })
    expect(b).toEqual({ kind: 'anniversary', icon: '🎉', text: '콩이가 이사 온 지 100일 되는 날이에요' })
  })

  it('이어 붙은 그림글자(변형 선택자)도 한 아이콘으로 뗀다', () => {
    const [c] = noteCells({ decor: '⛲️ 작은 시설 분수가 열렸어요' })
    expect(c.icon).toBe('⛲️')
    expect(c.text).toBe('작은 시설 분수가 열렸어요')
  })

  it('그림글자가 없는 줄(손님 맞장구)은 종류의 아이콘을 쓰고 글은 다 남긴다', () => {
    const [c] = noteCells({ guest: '콩이: “좋은 하루였네요”' })
    expect(c).toEqual({ kind: 'guest', icon: '💬', text: '콩이: “좋은 하루였네요”' })
  })

  it('한 장에 세 칸씩 나눈다', () => {
    expect(NOTE_PAGE).toBe(3)
    expect(notePages([1, 2, 3, 4, 5, 6, 7])).toEqual([[1, 2, 3], [4, 5, 6], [7]])
    expect(notePages([1, 2, 3])).toEqual([[1, 2, 3]])
    expect(notePages([1])).toEqual([[1]])
  })

  it('칸이 없어도 버튼을 둘 한 장은 있다', () => {
    expect(notePages([])).toEqual([[]])
  })

  it('보이는 시간은 칸 수에 맞춰 조금 늘고 버튼이 있으면 더 길다', () => {
    expect(noteStay(1, false)).toBe(2500)
    expect(noteStay(1, true)).toBe(5000)
    expect(noteStay(0, true)).toBe(5000)
    expect(noteStay(3, false)).toBeGreaterThan(noteStay(2, false))
    expect(noteStay(2, false)).toBeGreaterThan(noteStay(1, false))
    // 칸이 아무리 많아도 한 장 몫까지만 늘린다(넘기면 다시 센다)
    expect(noteStay(6, false)).toBe(noteStay(NOTE_PAGE, false))
  })
})
