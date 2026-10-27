import { describe, expect, it } from 'vitest'
import { MAX_UNIT, MIN_UNIT, unitOf, viewAround, zoomAt } from './view'

const screen = { w: 360, h: 480 }

describe('마을 보기 확대·축소', () => {
  it('화면 1px 이 viewBox 몇인지 계산한다(가로·세로 중 큰 쪽)', () => {
    expect(unitOf({ x: 0, y: 0, w: 720, h: 480 }, screen)).toBe(2)
    expect(unitOf({ x: 0, y: 0, w: 360, h: 960 }, screen)).toBe(2)
  })

  it('한 점을 중심으로 보기를 화면 크기에 맞춰 만든다', () => {
    const v = viewAround({ x: 100, y: 50 }, 0.5, screen)
    expect(v).toEqual({ x: 10, y: -70, w: 180, h: 240 })
  })

  it('확대해도 손가락(기준점) 아래의 자리는 그대로 있다', () => {
    const v = { x: 0, y: 0, w: 360, h: 480 }
    const z = zoomAt(v, 0.5, { x: 90, y: 120 }, screen)
    expect(z).toEqual({ x: 45, y: 60, w: 180, h: 240 })
    // 기준점의 상대 위치(25%, 25%)가 같다
    expect((90 - z.x) / z.w).toBeCloseTo(0.25)
    expect((120 - z.y) / z.h).toBeCloseTo(0.25)
  })

  it('너무 가까이·너무 멀리는 가지 않는다', () => {
    const v = { x: 0, y: 0, w: 360, h: 480 }
    const near = zoomAt(v, 0.001, { x: 0, y: 0 }, screen)
    expect(unitOf(near, screen)).toBeCloseTo(MIN_UNIT)
    const far = zoomAt(v, 1000, { x: 0, y: 0 }, screen)
    expect(unitOf(far, screen)).toBeCloseTo(MAX_UNIT)
  })

  it('이미 한계면 그 방향으로는 움직이지 않는다', () => {
    const v = viewAround({ x: 0, y: 0 }, MIN_UNIT, screen)
    expect(zoomAt(v, 0.5, { x: 30, y: 30 }, screen)).toEqual(v)
  })

  it('화면 크기를 모르면(0) 보기를 바꾸지 않는다', () => {
    const v = { x: 1, y: 2, w: 3, h: 4 }
    expect(zoomAt(v, 0.5, { x: 0, y: 0 }, { w: 0, h: 0 })).toEqual(v)
  })
})
