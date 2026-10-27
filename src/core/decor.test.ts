import { describe, expect, it } from 'vitest'
import { addDays } from './date'
import { DECORS, decorBook, decorNote, nextDecor, reachedDecors, unlockedDecors } from './decor'
import { LANDMARKS } from './landmark'
import { STAGES } from './stage'
import type { Dated } from './types'

const days = (n: number, from = '2026-01-01'): Dated[] => Array.from({ length: n }, (_, i) => ({ date: addDays(from, i) }))

describe('꾸밈 소품', () => {
  it('소품은 12종이고, 이름·아이콘·날 수가 겹치지 않으며 날 수 순서다', () => {
    expect(DECORS).toHaveLength(12)
    expect(new Set(DECORS.map((d) => d.id)).size).toBe(12)
    expect(new Set(DECORS.map((d) => d.name)).size).toBe(12)
    expect(new Set(DECORS.map((d) => d.icon)).size).toBe(12)
    const ns = DECORS.map((d) => d.days)
    expect(ns).toEqual([...ns].sort((a, b) => a - b))
    expect(new Set(ns).size).toBe(12)
  })

  it('명소·마을 단계가 서는 날과 겹치지 않아 축하가 한 날에 몰리지 않는다', () => {
    const big = new Set([...LANDMARKS.map((l) => l.days), ...STAGES.map((s) => s.days)])
    for (const d of DECORS) expect(big.has(d.days)).toBe(false)
  })

  it('누적 날 수로 열린다(빈 마을은 없음, 띄엄띄엄 써도 같은 날 수면 같다)', () => {
    expect(unlockedDecors([])).toEqual([])
    const first = DECORS[0]
    expect(unlockedDecors(days(first.days - 1))).toEqual([])
    expect(unlockedDecors(days(first.days)).map((d) => d.id)).toEqual([first.id])
    const sparse = Array.from({ length: DECORS[2].days }, (_, i) => ({ date: addDays('2026-01-01', i * 9) }))
    expect(unlockedDecors(sparse)).toEqual(unlockedDecors(days(DECORS[2].days)))
    expect(unlockedDecors(days(400))).toHaveLength(12)
  })

  it('같은 날이 두 번 있어도 하루로 센다', () => {
    const twice = [{ date: '2026-01-01' }, { date: '2026-01-01' }]
    expect(unlockedDecors(twice)).toEqual(unlockedDecors([{ date: '2026-01-01' }]))
  })

  it('다음 소품과 남은 날 수, 모두 열면 null', () => {
    expect(nextDecor([])).toEqual({ decor: DECORS[0], left: DECORS[0].days })
    expect(nextDecor(days(DECORS[0].days))).toEqual({ decor: DECORS[1], left: DECORS[1].days - DECORS[0].days })
    expect(nextDecor(days(DECORS[11].days))).toBeNull()
  })

  it('before → after 로 새로 열린 소품만 찾는다(고치기는 날 수가 그대로라 없다)', () => {
    const n = DECORS[1].days
    expect(reachedDecors(days(n - 1), days(n)).map((d) => d.id)).toEqual([DECORS[1].id])
    expect(reachedDecors(days(n), days(n))).toEqual([])
    expect(reachedDecors([], days(DECORS[3].days)).map((d) => d.id)).toEqual(DECORS.slice(0, 4).map((d) => d.id))
  })

  it('수첩 목록: 열린 소품은 열림, 아직이면 남은 날 수', () => {
    const book = decorBook(days(DECORS[1].days))
    expect(book.map((b) => b.decor.id)).toEqual(DECORS.map((d) => d.id))
    expect(book[1]).toMatchObject({ unlocked: true, left: 0 })
    expect(book[2]).toMatchObject({ unlocked: false, left: DECORS[2].days - DECORS[1].days })
  })

  it('열린 소품 알림 문구(받침에 맞춰 이/가)', () => {
    expect(decorNote([])).toBeNull()
    const bench = DECORS.find((d) => d.id === 'bench')!
    const lamp = DECORS.find((d) => d.id === 'lamp')!
    expect(decorNote([bench])).toBe('🪑 꾸밈 소품 벤치가 열렸어요')
    expect(decorNote([lamp])).toBe('🏮 꾸밈 소품 가로등이 열렸어요')
    expect(decorNote([bench, lamp])).toBe('🎁 꾸밈 소품 2개가 열렸어요')
  })
})
