import { describe, expect, it } from 'vitest'
import { addDays } from './date'
import { DECORS } from './decor'
import { FIRST_GIFTS, firstSignDate, giftCard, reachedGifts } from './gift'
import { LANDMARKS } from './landmark'
import { STAGES } from './stage'
import type { Dated } from './types'

const days = (n: number, from = '2026-01-01'): Dated[] => Array.from({ length: n }, (_, i) => ({ date: addDays(from, i) }))

describe('첫 주 선물', () => {
  it('1·2·3·5일째에 선물이 열린다: 첫 집 기념 팻말, 화분, 벤치, 꽃밭', () => {
    expect(FIRST_GIFTS.map((g) => g.days)).toEqual([1, 2, 3, 5])
    expect(FIRST_GIFTS.map((g) => g.id)).toEqual(['firstSign', 'pot', 'bench', 'flowerbed'])
    expect(FIRST_GIFTS[0].decor).toBeNull()
    for (const g of FIRST_GIFTS.slice(1)) expect(DECORS.find((d) => d.id === g.decor)!.days).toBe(g.days)
  })

  it('명소·마을 단계가 서는 날과 겹치지 않는다', () => {
    const big = new Set([...LANDMARKS.map((l) => l.days), ...STAGES.map((s) => s.days)])
    for (const g of FIRST_GIFTS) expect(big.has(g.days)).toBe(false)
  })

  it('누적 날 수로 열린다(띄엄띄엄 써도, 같은 날이 두 번이어도)', () => {
    expect(reachedGifts([], days(1)).map((g) => g.id)).toEqual(['firstSign'])
    expect(reachedGifts(days(1), days(2)).map((g) => g.id)).toEqual(['pot'])
    expect(reachedGifts(days(3), days(4))).toEqual([])
    const sparse = Array.from({ length: 5 }, (_, i) => ({ date: addDays('2026-01-01', i * 10) }))
    expect(reachedGifts(sparse.slice(0, 4), sparse).map((g) => g.id)).toEqual(['flowerbed'])
    expect(reachedGifts(days(1), [...days(1), ...days(1)])).toEqual([])
    expect(reachedGifts(days(5), days(30))).toEqual([])
  })

  it('첫 집 기념 팻말은 처음 집을 지은 날 자리에 선다(쓴 날이 없으면 없음)', () => {
    expect(firstSignDate([])).toBeNull()
    expect(firstSignDate([{ date: '2026-10-05' }, { date: '2026-10-02' }])).toBe('2026-10-02')
  })

  it('축하 카드: 첫날은 기념 팻말, 소품 선물은 놓으러 가기, 다음 선물을 알려 준다', () => {
    const first = giftCard(reachedGifts([], days(1)), days(1))!
    expect(first.title).toBe('🎁 첫 선물이 왔어요!')
    expect(first.body).toBe('첫 집을 지었어요. 집 옆에 🪧 기념 팻말을 세웠어요.')
    expect(first.next).toBe('다음 선물은 1일 더 쓰면 화분이에요')
    expect(first.icons).toEqual(['🪧'])
    expect(first.decor).toBeNull()

    const bench = giftCard(reachedGifts(days(2), days(3)), days(3))!
    expect(bench.title).toBe('🎁 선물이 왔어요!')
    expect(bench.body).toBe('한 줄을 3일 남겼어요. 꾸밈 소품 🪑 벤치를 받았어요. 마음에 드는 자리에 놓아 보세요.')
    expect(bench.next).toBe('다음 선물은 2일 더 쓰면 꽃밭이에요')
    expect(bench.decor).toBe('bench')

    // 마지막 첫 주 선물 다음은 광장의 첫 명소를 알려 준다
    const bed = giftCard(reachedGifts(days(4), days(5)), days(5))!
    expect(bed.body).toBe('한 줄을 5일 남겼어요. 꾸밈 소품 🌼 꽃밭을 받았어요. 마음에 드는 자리에 놓아 보세요.')
    expect(bed.next).toBe('2일 더 쓰면 광장에 우물이 생겨요')
  })

  it('선물이 없으면 카드도 없다. 한꺼번에 여럿이면 마지막 소품으로 간다', () => {
    expect(giftCard([], days(4))).toBeNull()
    const many = giftCard(reachedGifts([], days(3)), days(3))!
    expect(many.title).toBe('🎁 선물 3개가 왔어요!')
    expect(many.icons).toEqual(['🪧', '🪴', '🪑'])
    expect(many.decor).toBe('bench')
  })
})
