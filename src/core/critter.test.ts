import { describe, expect, it } from 'vitest'
import { birdFlock, critters } from './critter'
import { blockScenery } from './scenery'
import { buildVillage } from './village'
import type { Entry } from './types'

const e = (date: string): Entry => ({ date, text: date, mood: 'calm', writtenAt: 0 })

/** 2026년 3월~10월에 매달 몇 날씩 쓴 마을 */
const village = (today: string) => {
  const entries: Entry[] = []
  for (let m = 3; m <= 10; m++) for (const d of [3, 9, 15, 21]) entries.push(e(`2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`))
  return buildVillage(entries.filter((x) => x.date < today), today)
}

/** 여러 날에 걸쳐 모은 동물 */
const overDays = (dates: string[], part: 'day' | 'evening' | 'night' = 'day') =>
  dates.flatMap((d) => critters(village(d), d, part, 'sunny'))

const days = (month: string) => Array.from({ length: 20 }, (_, i) => `${month}-${String(i + 5).padStart(2, '0')}`)

describe('숲가 작은 동물과 나비', () => {
  it('토끼는 덤불 칸, 다람쥐는 나무 칸에만 앉는다(집·빈 날 칸이 아니다)', () => {
    const today = '2026-10-28'
    const v = village(today)
    const list = critters(v, today, 'day', 'sunny')
    expect(list.some((c) => c.kind === 'rabbit' || c.kind === 'squirrel')).toBe(true)
    for (const c of list.filter((x) => x.kind !== 'butterfly')) {
      const block = v.blocks.find((b) => b.month === c.block)!
      const s = blockScenery(block, today).find((x) => x.gx === c.cell.gx && x.gy === c.cell.gy)
      expect(s?.kind).toBe(c.kind === 'rabbit' ? 'bush' : 'tree')
    }
  })

  it('한 구역에 토끼·다람쥐는 많아야 하나, 나비는 많아야 둘이다', () => {
    for (const today of days('2026-05')) {
      const list = critters(village(today), today, 'day', 'sunny')
      const by = new Map<string, { ground: number; fly: number }>()
      for (const c of list) {
        const n = by.get(c.block) ?? { ground: 0, fly: 0 }
        if (c.kind === 'butterfly') n.fly++
        else n.ground++
        by.set(c.block, n)
      }
      for (const n of by.values()) {
        expect(n.ground).toBeLessThanOrEqual(1)
        expect(n.fly).toBeLessThanOrEqual(2)
      }
    }
  })

  it('나비는 봄·여름 낮에만, 꽃이 핀 칸 위를 난다', () => {
    const spring = overDays(days('2026-05'))
    const flies = spring.filter((c) => c.kind === 'butterfly')
    expect(flies.length).toBeGreaterThan(0)
    const today = '2026-05-10'
    const v = village(today)
    for (const c of critters(v, today, 'day', 'sunny').filter((x) => x.kind === 'butterfly')) {
      const block = v.blocks.find((b) => b.month === c.block)!
      expect(blockScenery(block, today).find((x) => x.gx === c.cell.gx && x.gy === c.cell.gy)?.kind).toBe('flowers')
    }
    expect(overDays(days('2026-10')).some((c) => c.kind === 'butterfly')).toBe(false)
    expect(overDays(days('2026-05'), 'evening').some((c) => c.kind === 'butterfly')).toBe(false)
  })

  it('밤과 비 오는 날에는 모두 쉬러 가고, 겨울엔 다람쥐가 겨울잠을 잔다', () => {
    expect(overDays(days('2026-10'), 'night')).toEqual([])
    for (const d of days('2026-05')) expect(critters(village(d), d, 'day', 'rain')).toEqual([])
    const winter = ['2026-12-05', '2026-12-12', '2026-12-19', '2027-01-09', '2027-01-16', '2027-02-06'].flatMap((d) => critters(village(d), d, 'day', 'sunny'))
    expect(winter.some((c) => c.kind === 'rabbit')).toBe(true)
    expect(winter.some((c) => c.kind === 'squirrel')).toBe(false)
  })

  it('같은 날·때에는 늘 같고, 날이 바뀌면 자리가 바뀐다', () => {
    const v = village('2026-10-28')
    expect(critters(v, '2026-10-28', 'day', 'sunny')).toEqual(critters(v, '2026-10-28', 'day', 'sunny'))
    const spots = new Set(days('2026-10').map((d) => JSON.stringify(critters(village(d), d, 'day', 'sunny').map((c) => c.cell))))
    expect(spots.size).toBeGreaterThan(5)
  })

  it('소품을 놓은 칸에는 앉지 않는다', () => {
    const today = '2026-10-28'
    const v = village(today)
    const list = critters(v, today, 'day', 'sunny')
    const taken = new Set(list.map((c) => `${c.cell.gx},${c.cell.gy}`))
    expect(taken.size).toBeGreaterThan(0)
    for (const c of critters(v, today, 'day', 'sunny', taken)) expect(taken.has(`${c.cell.gx},${c.cell.gy}`)).toBe(false)
  })

  it('쓴 날 수·기분과 무관하다: 오늘 한 줄을 써도 다른 구역 동물은 그대로다', () => {
    const today = '2026-10-28'
    const before = critters(village(today), today, 'day', 'sunny').filter((c) => c.block !== '2026-10')
    const after = critters(buildVillage([...village(today).blocks.flatMap((b) => b.lots.flatMap((l) => (l.entry ? [l.entry] : []))), e(today)], today), today, 'day', 'sunny').filter((c) => c.block !== '2026-10')
    expect(after).toEqual(before)
  })
})

describe('하늘을 가로지르는 새 떼', () => {
  it('낮·저녁에 사흘 중 이틀쯤 날아가고, 밤과 비 오는 날에는 없다', () => {
    const dates = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 3, 1 + i)).toISOString().slice(0, 10))
    const flying = dates.filter((d) => birdFlock(d, 'day', 'sunny'))
    expect(flying.length).toBeGreaterThan(25)
    expect(flying.length).toBeLessThan(55)
    expect(dates.some((d) => birdFlock(d, 'evening', 'partly'))).toBe(true)
    for (const d of dates) {
      expect(birdFlock(d, 'night', 'starry')).toBeNull()
      expect(birdFlock(d, 'day', 'rain')).toBeNull()
    }
  })

  it('새는 3~5마리, 하늘 위쪽(해·구름 높이)을 지나고 날짜마다 같다', () => {
    for (let i = 1; i <= 28; i++) {
      const d = `2026-04-${String(i).padStart(2, '0')}`
      const f = birdFlock(d, 'day', 'sunny')
      expect(f).toEqual(birdFlock(d, 'day', 'sunny'))
      if (!f) continue
      expect(f.birds.length).toBeGreaterThanOrEqual(3)
      expect(f.birds.length).toBeLessThanOrEqual(5)
      expect(f.y).toBeGreaterThanOrEqual(6)
      expect(f.y).toBeLessThanOrEqual(30)
      expect([1, -1]).toContain(f.dir)
      expect(f.delay).toBeGreaterThanOrEqual(0)
      expect(f.delay).toBeLessThanOrEqual(1)
    }
  })
})
