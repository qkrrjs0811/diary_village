import { describe, expect, it } from 'vitest'
import { addDays } from './date'
import { LANDMARKS, PLAZA } from './landmark'
import { canPlace, decorSpots, decorsOnMap, moveDecor, placeDecor, removeDecor } from './placing'
import type { Entry, PlacedDecor, SaveData } from './types'
import { buildVillage } from './village'

const TODAY = '2026-10-27'
const e = (date: string): Entry => ({ date, text: '한 줄', mood: 'calm', writtenAt: 1 })
/** 10월 1일부터 n일 동안 쓴 기록 */
const wrote = (n: number, from = '2026-10-01'): SaveData => ({ version: 1, entries: Array.from({ length: n }, (_, i) => e(addDays(from, i))) })
const villageOf = (s: SaveData) => buildVillage(s.entries, TODAY, (s.erased ?? []).map((x) => x.date))
/** 2026년 10월은 목요일(4)에 시작한다. 날짜 → 그달 구역 칸 */
const cell = (date: string) => {
  const d = Number(date.slice(8)) - 1 + 4
  return { at: '2026-10', col: d % 7, row: Math.floor(d / 7) }
}

describe('소품 놓을 자리', () => {
  it('집이 선 칸·오늘·어제 칸에는 놓지 않고, 지난 빈 날과 달력 밖 칸에는 놓는다', () => {
    const s = wrote(5)
    const v = villageOf(s)
    expect(canPlace(v, TODAY, s, cell('2026-10-03'))).toBe(false) // 집
    expect(canPlace(v, TODAY, s, cell(TODAY))).toBe(false) // 오늘(아직 쓸 수 있다)
    expect(canPlace(v, TODAY, s, cell('2026-10-26'))).toBe(false) // 어제(아직 쓸 수 있다)
    expect(canPlace(v, TODAY, s, cell('2026-10-12'))).toBe(true) // 지난 빈 날
    expect(canPlace(v, TODAY, s, { at: '2026-10', col: 0, row: 0 })).toBe(true) // 9월 칸(달력 밖)
  })

  it('지운 날은 빈 땅이라 놓을 수 있다', () => {
    const s: SaveData = { ...wrote(5), erased: [{ date: '2026-10-08', erasedAt: 9 }] }
    expect(canPlace(villageOf(s), TODAY, s, cell('2026-10-08'))).toBe(true)
  })

  it('없는 구역·판 밖·소수 칸에는 놓지 않는다', () => {
    const s = wrote(5)
    const v = villageOf(s)
    expect(canPlace(v, TODAY, s, { at: '2026-09', col: 0, row: 0 })).toBe(false)
    expect(canPlace(v, TODAY, s, { at: '2026-10', col: 7, row: 0 })).toBe(false)
    expect(canPlace(v, TODAY, s, { at: '2026-10', col: 0, row: 6 })).toBe(false)
    expect(canPlace(v, TODAY, s, { at: '2026-10', col: 0.5, row: 0 })).toBe(false)
  })

  it('광장에서는 명소 자리(아직 안 선 곳도)·가운데 돌길·모서리 나무를 피한다', () => {
    const s = wrote(5)
    const v = villageOf(s)
    for (const l of LANDMARKS) expect(canPlace(v, TODAY, s, { at: 'plaza', col: l.col, row: l.row })).toBe(false)
    for (let row = 0; row < PLAZA.h; row++) expect(canPlace(v, TODAY, s, { at: 'plaza', col: 3, row })).toBe(false)
    for (let col = 0; col < PLAZA.w; col++) {
      expect(canPlace(v, TODAY, s, { at: 'plaza', col, row: 2 })).toBe(false)
      expect(canPlace(v, TODAY, s, { at: 'plaza', col, row: 3 })).toBe(false)
    }
    for (const [col, row] of [[0, 0], [6, 0], [0, 5]]) expect(canPlace(v, TODAY, s, { at: 'plaza', col, row })).toBe(false)
    expect(canPlace(v, TODAY, s, { at: 'plaza', col: 2, row: 0 })).toBe(true)
    expect(canPlace(v, TODAY, s, { at: 'plaza', col: 5, row: 5 })).toBe(true)
  })

  it('다른 소품이 있는 칸에는 놓지 않는다', () => {
    const s: SaveData = { ...wrote(5), decor: [{ id: 'pot', ...cell('2026-10-12') }] }
    expect(canPlace(villageOf(s), TODAY, s, cell('2026-10-12'))).toBe(false)
  })

  it('놓을 수 있는 자리 목록은 모두 canPlace 를 지나고 마을 칸 좌표가 붙는다', () => {
    const s = wrote(5)
    const v = villageOf(s)
    const spots = decorSpots(v, TODAY, s)
    expect(spots.length).toBeGreaterThan(20)
    for (const p of spots) expect(canPlace(v, TODAY, s, p)).toBe(true)
    const plaza = spots.find((p) => p.at === 'plaza' && p.col === 2 && p.row === 0)!
    expect([plaza.gx, plaza.gy]).toEqual([PLAZA.gx + 2, PLAZA.gy])
  })
})

describe('소품 놓기·옮기기·치우기', () => {
  it('열린 소품만 빈 자리에 놓고, 기록은 그대로다', () => {
    const s = wrote(5) // 화분(2일)·벤치(4일)가 열렸다
    const v = villageOf(s)
    const r = placeDecor(s, v, TODAY, 'bench', cell('2026-10-12'))
    if (!r.ok) throw new Error(r.reason)
    expect(r.save.decor).toEqual([{ id: 'bench', ...cell('2026-10-12') }])
    expect(r.save.entries).toEqual(s.entries)
    expect(s.decor).toBeUndefined() // 원래 기록은 바꾸지 않는다
    expect(placeDecor(s, v, TODAY, 'pond', cell('2026-10-12'))).toEqual({ ok: false, reason: 'locked' })
    expect(placeDecor(s, v, TODAY, 'pot', cell('2026-10-03'))).toEqual({ ok: false, reason: 'spot' })
  })

  it('같은 소품을 여러 개 놓을 수 있다', () => {
    const s = wrote(5)
    const v = villageOf(s)
    const a = placeDecor(s, v, TODAY, 'pot', cell('2026-10-12'))
    if (!a.ok) throw new Error()
    const b = placeDecor(a.save, v, TODAY, 'pot', cell('2026-10-13'))
    if (!b.ok) throw new Error()
    expect(b.save.decor).toHaveLength(2)
  })

  it('지운 날도 날 수에 들어가 소품이 잠기지 않는다', () => {
    const s: SaveData = { version: 1, entries: [e('2026-10-01'), e('2026-10-02'), e('2026-10-03')], erased: [{ date: '2026-10-04', erasedAt: 1 }] }
    expect(placeDecor(s, villageOf(s), TODAY, 'bench', cell('2026-10-12')).ok).toBe(true)
  })

  it('놓은 소품을 옮기고(제자리는 비운 셈), 치운다', () => {
    const s: SaveData = { ...wrote(5), decor: [{ id: 'pot', ...cell('2026-10-12') }, { id: 'bench', ...cell('2026-10-13') }] }
    const v = villageOf(s)
    const m = moveDecor(s, v, TODAY, 0, cell('2026-10-14'))
    if (!m.ok) throw new Error()
    expect(m.save.decor![0]).toEqual({ id: 'pot', ...cell('2026-10-14') })
    expect(moveDecor(s, v, TODAY, 0, cell('2026-10-12')).ok).toBe(true) // 제자리
    expect(moveDecor(s, v, TODAY, 0, cell('2026-10-13'))).toEqual({ ok: false, reason: 'spot' })
    expect(moveDecor(s, v, TODAY, 5, cell('2026-10-14'))).toEqual({ ok: false, reason: 'missing' })
    const r = removeDecor(s, 0)
    expect(r.decor).toEqual([{ id: 'bench', ...cell('2026-10-13') }])
    expect(removeDecor({ ...wrote(1), decor: [{ id: 'pot', ...cell('2026-10-12') }] }, 0).decor).toBeUndefined()
  })
})

describe('마을에 그릴 소품', () => {
  it('마을 칸 좌표를 붙이고, 잠긴 소품·없는 구역·집이 선 칸의 소품은 그리지 않되 저장에는 남긴다', () => {
    const placed: PlacedDecor[] = [
      { id: 'pot', ...cell('2026-10-12') },
      { id: 'tent', ...cell('2026-10-13') }, // 90일 소품(잠김)
      { id: 'bench', at: '2025-01', col: 0, row: 0 }, // 없는 구역
      { id: 'bench', ...cell('2026-10-02') }, // 백업으로 집이 생긴 칸
      { id: 'bench', at: 'plaza', col: 2, row: 0 },
    ]
    const s: SaveData = { ...wrote(5), decor: placed }
    const shown = decorsOnMap(villageOf(s), TODAY, s)
    expect(shown.map((d) => [d.id, d.index])).toEqual([
      ['pot', 0],
      ['bench', 4],
    ])
    expect(shown[1]).toMatchObject({ gx: PLAZA.gx + 2, gy: PLAZA.gy })
    const block = villageOf(s).blocks[0]
    const lot = block.lots.find((l) => l.date === '2026-10-12')!
    expect([shown[0].gx, shown[0].gy]).toEqual([lot.gx, lot.gy])
  })

  it('앞선 달을 백업으로 가져와 구역 자리가 바뀌어도 소품은 그달 그 칸에 남는다', () => {
    const s: SaveData = { ...wrote(5), decor: [{ id: 'pot', ...cell('2026-10-12') }] }
    const more: SaveData = { ...s, entries: [e('2026-09-10'), ...s.entries] }
    const v = villageOf(more)
    const lot = v.blocks.find((b) => b.month === '2026-10')!.lots.find((l) => l.date === '2026-10-12')!
    const [d] = decorsOnMap(v, TODAY, more)
    expect([d.gx, d.gy]).toEqual([lot.gx, lot.gy])
  })
})
