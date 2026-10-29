import { describe, expect, it } from 'vitest'
import { buildVillage, houseLook } from './village'
import { SIGN_H, SIGN_MAX, SIGN_MIN, signLift, signReach } from './sign'
import type { Entry } from './types'

const e = (date: string, text = '산책했다'): Entry => ({ date, text, mood: 'calm', writtenAt: 0 })

/** 화면 좌표(render.ts의 iso와 같은 칸 크기 48×24) */
const at = (gx: number, gy: number) => ({ x: ((gx - gy) * 48) / 2, y: ((gx + gy) * 24) / 2 })

/** 팻말판 상자가 그 집 상자(지붕 끝까지)와 겹치는지 */
function hits(lift: number, width: number, gx0: number, gy0: number, lot: { gx: number; gy: number; entry?: Entry }) {
  const foot = at(gx0 - 0.5, gy0 - 0.5)
  const c = at(lot.gx + 0.5, lot.gy + 0.5)
  const reach = signReach(lot.entry!)
  const sx = [foot.x - width / 2, foot.x + width / 2]
  const sy = [foot.y - lift - SIGN_H, foot.y - lift]
  return sx[0] < c.x + 28 && c.x - 28 < sx[1] && sy[0] < c.y + 8 && c.y - reach < sy[1]
}

describe('구역 팻말 높이', () => {
  it('집이 없는 구역은 가장 짧은 기둥이다', () => {
    const v = buildVillage([], '2026-10-27')
    expect(signLift(v, v.blocks[0], 40)).toBe(SIGN_MIN)
  })

  it('팻말에서 먼 앞쪽에만 집이 있으면 짧은 기둥 그대로다', () => {
    // 10월 27일(화, 다섯째 주)은 앞쪽 끝이다
    const v = buildVillage([e('2026-10-27'), e('2026-10-31')])
    expect(signLift(v, v.blocks[0], 40)).toBe(SIGN_MIN)
  })

  it('뒤쪽 모서리 가까이 집이 서면 그 지붕보다 조금 위로 올라가되 가장 높아도 예전 높이를 넘지 않는다', () => {
    // 2026년 11월 1일은 일요일이라 뒤쪽 모서리 첫 칸에 집이 선다
    const low = buildVillage([e('2026-11-01')])
    const tower = buildVillage([e('2026-11-01', '바닷가 등대')])
    const a = signLift(low, low.blocks[0], 40)
    const b = signLift(tower, tower.blocks[0], 40)
    expect(a).toBeGreaterThan(SIGN_MIN)
    expect(b).toBeGreaterThan(a) // 등대가 더 높다
    expect(b).toBeLessThanOrEqual(SIGN_MAX)
    expect(hits(a, 40, 0, 0, low.blocks[0].lots[0])).toBe(false)
    expect(hits(b, 40, 0, 0, tower.blocks[0].lots[0])).toBe(false)
  })

  it('높이 표는 단층집 < 이층집 < 등대 순이다', () => {
    const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']
    const one = days.find((d) => houseLook(e(d)).floors === 1)!
    const two = days.find((d) => houseLook(e(d)).floors === 2)!
    expect(signReach(e(two))).toBeGreaterThan(signReach(e(one)))
    expect(signReach(e(two, '바닷가'))).toBeGreaterThan(signReach(e(two)))
  })

  it('달 이름을 붙여 팻말판이 넓어지면 옆자리 지붕까지 비켜 올라간다', () => {
    // 11월 3일(화)은 뒤쪽 첫 줄 셋째 칸: 좁은 팻말은 닿지 않고 넓은 팻말은 닿는다
    const v = buildVillage([e('2026-11-03', '바닷가')])
    const narrow = signLift(v, v.blocks[0], 40)
    const wide = signLift(v, v.blocks[0], 140)
    expect(narrow).toBe(SIGN_MIN)
    expect(wide).toBeGreaterThan(narrow)
    expect(hits(wide, 140, 0, 0, v.blocks[0].lots.find((l) => l.date === '2026-11-03')!)).toBe(false)
  })

  it('날마다 쓴 달도 그 구역 집 지붕을 가리지 않고, 높이는 늘 짧은 기둥과 예전 높이 사이다', () => {
    for (const month of ['2026-09', '2026-10', '2026-11', '2027-02', '2027-08']) {
      const days = Array.from({ length: 28 }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
      const v = buildVillage(days.map((d, i) => e(d, i % 3 === 0 ? '바다' : '산책')))
      const [block] = v.blocks
      for (const width of [40, 90]) {
        const lift = signLift(v, block, width)
        expect(lift).toBeGreaterThanOrEqual(SIGN_MIN)
        expect(lift).toBeLessThanOrEqual(SIGN_MAX)
        const gx0 = block.bx * 8
        const gy0 = block.by * 7
        for (const lot of block.lots.filter((l) => l.entry)) expect(hits(lift, width, gx0, gy0, lot)).toBe(false)
      }
    }
  })

  it('뒤 구역 집이 바로 위에 있어도 제 구역 집 지붕은 가리지 않는다', () => {
    // 9월(구역 0) 앞쪽 집 아래로 11월(구역 2)의 팻말이 선다
    const v = buildVillage([e('2026-09-25'), e('2026-09-26'), e('2026-10-01'), e('2026-11-01'), e('2026-11-02', '바다')])
    const nov = v.blocks[2]
    const lift = signLift(v, nov, 40)
    expect(lift).toBeLessThanOrEqual(SIGN_MAX)
    for (const lot of nov.lots.filter((l) => l.entry)) expect(hits(lift, 40, nov.bx * 8, nov.by * 7, lot)).toBe(false)
  })

  it('같은 기록이면 늘 같은 높이다(저장하지 않고 계산한다)', () => {
    const v = buildVillage([e('2026-11-01'), e('2026-11-02')])
    expect(signLift(v, v.blocks[0], 40)).toBe(signLift(buildVillage([e('2026-11-02'), e('2026-11-01')]), v.blocks[0], 40))
  })
})
