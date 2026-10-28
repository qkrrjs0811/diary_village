import { describe, expect, it } from 'vitest'
import { BUILD_UNIT, FAR_INSET, FAR_MIN, FEW_UNIT, MAX_UNIT, MIN_UNIT, SHOW, START_UNIT, buildUnit, easeInOut, farView, fitBoxes, openingView, settleZoom, showView, startView, tweenView, unitOf, viewAround, zoomAt, type View } from './view'

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

describe('짓는 연출 보기', () => {
  const from = { x: 0, y: 0, w: 400, h: 400 }
  const near = { x: 300, y: 100, w: 100, h: 100 }

  it('천천히 시작해 천천히 멈춘다', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.1)).toBeLessThan(0.1)
    expect(easeInOut(-1)).toBe(0)
    expect(easeInOut(2)).toBe(1)
  })

  it('두 보기 사이를 가운데는 곧게, 크기는 배율로 잇는다', () => {
    expect(tweenView(from, near, 0)).toEqual(from)
    expect(tweenView(from, near, 1)).toEqual(near)
    const mid = tweenView(from, near, 0.5)
    expect(mid.x + mid.w / 2).toBeCloseTo(275) // 가운데 200 → 350 의 절반
    expect(mid.y + mid.h / 2).toBeCloseTo(175)
    expect(mid.w).toBeCloseTo(200) // 400 과 100 의 배율 가운데
  })

  it('원래 보기 → 새 집 가까이 → 잠시 머묾 → 원래 보기로 돌아온다', () => {
    expect(showView(from, near, 0)).toEqual({ view: from, done: false })
    expect(showView(from, near, SHOW.go).view).toEqual(near)
    expect(showView(from, near, SHOW.go + SHOW.hold / 2).view).toEqual(near)
    const back = showView(from, near, SHOW.go + SHOW.hold + SHOW.back / 2).view
    expect(back.w).toBeGreaterThan(near.w)
    expect(back.w).toBeLessThan(from.w)
    expect(showView(from, near, SHOW.go + SHOW.hold + SHOW.back)).toEqual({ view: from, done: true })
    expect(showView(from, near, 99999)).toEqual({ view: from, done: true })
  })

  it('이미 더 가까이 보고 있었으면 멀어지지 않는다', () => {
    expect(buildUnit(0.6)).toBe(BUILD_UNIT)
    expect(buildUnit(0.35)).toBe(0.35)
  })
})

describe('처음 열 때 보기', () => {
  // 화면 360×480, 1px = 1 이면 보기도 360×480
  it('구역(섬)이 보기보다 작은 쪽은 섬을 가운데에 둔다', () => {
    const area = { x: 0, y: 0, w: 600, h: 200 }
    const v = startView({ x: 100, y: 180 }, 1, screen, area)
    expect(v.w).toBe(360)
    expect(v.h).toBe(480)
    expect(v.y + v.h / 2).toBe(100) // 섬 세로 가운데
  })

  it('섬이 보기보다 큰 쪽은 오늘 자리를 가운데 두되 섬 밖 빈 하늘이 생기지 않게 끝에 맞춘다', () => {
    const area = { x: 0, y: 0, w: 600, h: 200 }
    expect(startView({ x: 300, y: 100 }, 1, screen, area).x).toBe(120) // 가운데
    expect(startView({ x: 50, y: 100 }, 1, screen, area).x).toBe(0) // 왼쪽 끝에 맞춤
    expect(startView({ x: 580, y: 100 }, 1, screen, area).x).toBe(240) // 오른쪽 끝에 맞춤
  })

  it('오늘 자리는 늘 보기 안에 있다', () => {
    const area = { x: -200, y: -50, w: 900, h: 700 }
    for (const p of [{ x: -190, y: -40 }, { x: 690, y: 640 }, { x: 250, y: 300 }]) {
      const v = startView(p, 1, screen, area)
      expect(p.x).toBeGreaterThanOrEqual(v.x)
      expect(p.x).toBeLessThanOrEqual(v.x + v.w)
      expect(p.y).toBeGreaterThanOrEqual(v.y)
      expect(p.y).toBeLessThanOrEqual(v.y + v.h)
    }
  })
})

describe('여러 상자가 다 보이게 다가가기', () => {
  const phone = { w: 366, h: 630 }
  const inset = { side: 12, top: 44, bottom: 12 }
  const inside = (v: View, b: View) => {
    const u = unitOf(v, phone)
    const l = (b.x - v.x) / u
    const r = (b.x + b.w - v.x) / u
    const t = (b.y - v.y) / u
    const d = (b.y + b.h - v.y) / u
    const e = 1e-6
    return l >= inset.side - e && r <= phone.w - inset.side + e && t >= inset.top - e && d <= phone.h - inset.bottom + e
  }

  it('상자들이 모두 안쪽 여백 안에 들어온다(위는 날씨 칩만큼 비운다)', () => {
    const boxes = [
      { x: -200, y: 300, w: 60, h: 20 },
      { x: 150, y: 260, w: 90, h: 40 },
      { x: 0, y: 200, w: 10, h: 10 },
    ]
    const v = fitBoxes(boxes, BUILD_UNIT, phone, inset)
    for (const b of boxes) expect(inside(v, b)).toBe(true)
    expect(v.w / v.h).toBeCloseTo(phone.w / phone.h)
  })

  it('상자가 작으면 정한 거리(near)보다 더 다가가지 않고 상자를 가운데에 둔다', () => {
    const b = { x: 0, y: 0, w: 20, h: 20 }
    const v = fitBoxes([b], BUILD_UNIT, phone, inset)
    expect(unitOf(v, phone)).toBeCloseTo(BUILD_UNIT)
    expect(v.x + v.w / 2).toBeCloseTo(10)
    expect(inside(v, b)).toBe(true)
  })

  it('아무리 커도 가장 먼 거리를 넘지 않는다', () => {
    const v = fitBoxes([{ x: 0, y: 0, w: 1e5, h: 10 }], BUILD_UNIT, phone, inset)
    expect(unitOf(v, phone)).toBeCloseTo(MAX_UNIT)
  })
})

describe('집이 몇 채 없을 때 처음 보기', () => {
  const phone = { w: 366, h: 630 }
  const inset = { side: 12, top: 44, bottom: 12 }
  const area = { x: -600, y: -100, w: 1200, h: 800 }
  const today = { x: 40, y: 300 }
  const todayBox = { x: 10, y: 250, w: 60, h: 64 }

  it('집이 없으면 지금처럼 오늘 자리 쪽으로 본다', () => {
    expect(openingView(today, START_UNIT, phone, area, [todayBox], 0, inset)).toEqual(startView(today, START_UNIT, phone, area))
  })

  it('집 몇 채와 오늘 자리가 화면에 꽉 차게 처음 보기보다 가까이 본다', () => {
    const boxes = [{ x: -60, y: 200, w: 56, h: 80 }, { x: 60, y: 230, w: 56, h: 80 }, todayBox]
    const v = openingView(today, START_UNIT, phone, area, boxes, 2, inset)
    expect(unitOf(v, phone)).toBeLessThan(START_UNIT)
    expect(v).toEqual(fitBoxes(boxes, FEW_UNIT, phone, inset))
  })

  it('집 하나여도 너무 가까이 가지 않는다', () => {
    const v = openingView(today, START_UNIT, phone, area, [todayBox], 1, inset)
    expect(unitOf(v, phone)).toBeCloseTo(FEW_UNIT)
    expect(FEW_UNIT).toBeGreaterThanOrEqual(BUILD_UNIT)
    expect(v.x + v.w / 2).toBeCloseTo(40)
  })

  it('집이 넓게 퍼져 처음 보기보다 멀리 봐야 하면 지금처럼 오늘 자리 쪽으로 본다', () => {
    const wide = [{ x: -500, y: 0, w: 56, h: 80 }, { x: 500, y: 600, w: 56, h: 80 }, todayBox]
    expect(openingView(today, START_UNIT, phone, area, wide, 2, inset)).toEqual(startView(today, START_UNIT, phone, area))
  })
})

describe('가장 멀리 보기', () => {
  const phone = { w: 366, h: 568 }
  // 마을(섬 전체)이 원점에서 한쪽으로 치우쳐 있다
  const world = { x: 100, y: -50, w: 400, h: 260 }
  const mid = (v: View) => ({ x: v.x + v.w / 2, y: v.y + v.h / 2 })

  it('마을 전체가 여백 안에 다 들어오고 화면 가운데에 온다', () => {
    const v = farView(world, phone)!
    expect(mid(v).x).toBeCloseTo(300)
    expect(mid(v).y).toBeCloseTo(80)
    const u = unitOf(v, phone)
    expect(world.w / u).toBeLessThanOrEqual(phone.w - 2 * FAR_INSET.side + 1e-6)
    expect(world.h / u).toBeLessThanOrEqual(phone.h - FAR_INSET.top - FAR_INSET.bottom + 1e-6)
    // 한쪽은 여백까지 꽉 찬다(너무 작지 않다)
    expect(world.w / u).toBeCloseTo(phone.w - 2 * FAR_INSET.side)
  })

  it('마을이 작아도 어느 정도는 멀리 볼 수 있다', () => {
    const v = farView({ x: 0, y: 0, w: 60, h: 40 }, phone)!
    expect(unitOf(v, phone)).toBeCloseTo(FAR_MIN)
    expect(FAR_MIN).toBeGreaterThan(START_UNIT)
  })

  it('마을이 너무 커서 가장 멀리서도 다 안 들어오면 따로 맞추지 않는다', () => {
    const huge = { x: 0, y: 0, w: 5000, h: 3000 }
    expect(farView(huge, phone)).toBeNull()
    const base = viewAround({ x: 0, y: 0 }, 1, phone)
    const next = zoomAt(base, 2, { x: 0, y: 0 }, phone)
    expect(settleZoom(base, next, huge, phone)).toEqual(next)
  })

  it('끝까지 줄이면 마을 가운데의 가장 멀리 보기에서 멈춘다', () => {
    const base = viewAround({ x: -300, y: 400 }, START_UNIT, phone)
    const next = zoomAt(base, 100, { x: -300, y: 400 }, phone)
    const v = settleZoom(base, next, world, phone)
    const far = farView(world, phone)!
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(v[k]).toBeCloseTo(far[k])
  })

  it('반쯤 줄이면 마을 쪽으로 반쯤 다가온다', () => {
    const far = farView(world, phone)!
    const base = viewAround({ x: -300, y: 400 }, START_UNIT, phone)
    const half = (START_UNIT + unitOf(far, phone)) / 2
    const next = zoomAt(base, half / START_UNIT, mid(base), phone)
    const v = settleZoom(base, next, world, phone)
    expect(unitOf(v, phone)).toBeCloseTo(half)
    expect(mid(v).x).toBeCloseTo((-300 + 300) / 2)
    expect(mid(v).y).toBeCloseTo((400 + 80) / 2)
  })

  it('조금씩 여러 번 줄여도 마지막엔 마을 가운데에 닿는다', () => {
    let v = viewAround({ x: -300, y: 400 }, START_UNIT, phone)
    for (let i = 0; i < 40; i++) v = settleZoom(v, zoomAt(v, 1.2, { x: v.x, y: v.y }, phone), world, phone)
    const far = farView(world, phone)!
    expect(mid(v).x).toBeCloseTo(mid(far).x)
    expect(mid(v).y).toBeCloseTo(mid(far).y)
    expect(unitOf(v, phone)).toBeCloseTo(unitOf(far, phone))
  })

  it('가까이 볼 때는 손가락 자리를 그대로 지킨다', () => {
    const base = viewAround({ x: -300, y: 400 }, 1, phone)
    const next = zoomAt(base, 0.5, { x: -250, y: 380 }, phone)
    expect(settleZoom(base, next, world, phone)).toEqual(next)
  })
})
