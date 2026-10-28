// 마을 보기 계산: 확대·축소와 그 한계. 화면 없이 viewBox 숫자만 다룬다.
export type View = { x: number; y: number; w: number; h: number }
export type Size = { w: number; h: number }
export type Pt = { x: number; y: number }

/** 가장 가까이: 화면 1px = 0.3 (칸 하나가 약 160px) */
export const MIN_UNIT = 0.3
/** 가장 멀리: 화면 1px = 3 (칸 하나가 16px, 여러 달이 한눈에) */
export const MAX_UNIT = 3
/** 처음 열 때: 칸 하나가 약 80px 로 집이 또렷이 보인다 */
export const START_UNIT = 0.6

/** 집을 지을 때 다가가는 거리: 칸 하나가 약 107px */
export const BUILD_UNIT = 0.45
/** 짓는 연출 시간(ms): 다가가기 → 머물기(쑥 올라옴·반짝임) → 돌아오기 */
export const SHOW = { go: 800, hold: 1800, back: 900 }

/** 화면 1px 이 viewBox 로 몇인지(preserveAspectRatio meet 기준) */
export function unitOf(view: View, screen: Size): number {
  return Math.max(view.w / screen.w, view.h / screen.h)
}

/** center 를 가운데에 두고 화면 크기에 맞춘 보기 */
export function viewAround(center: Pt, unit: number, screen: Size): View {
  const w = screen.w * unit
  const h = screen.h * unit
  return { x: center.x - w / 2, y: center.y - h / 2, w, h }
}

/**
 * boxes(viewBox 상자들)가 모두 화면 안쪽 여백(inset, 화면 px) 안에 들어오는 보기.
 * near 보다 더 다가가지 않고 MAX_UNIT 보다 멀어지지 않는다. 상자 묶음은 남은 자리 가운데에 둔다
 */
export function fitBoxes(boxes: View[], near: number, screen: Size, inset: { side: number; top: number; bottom: number }): View {
  const left = Math.min(...boxes.map((b) => b.x))
  const right = Math.max(...boxes.map((b) => b.x + b.w))
  const top = Math.min(...boxes.map((b) => b.y))
  const bottom = Math.max(...boxes.map((b) => b.y + b.h))
  const roomW = Math.max(1, screen.w - 2 * inset.side)
  const roomH = Math.max(1, screen.h - inset.top - inset.bottom)
  const unit = Math.min(MAX_UNIT, Math.max(near, (right - left) / roomW, (bottom - top) / roomH))
  const w = screen.w * unit
  const h = screen.h * unit
  const roomMid = (inset.top + screen.h - inset.bottom) / 2
  return { x: (left + right) / 2 - w / 2, y: (top + bottom) / 2 - roomMid * unit, w, h }
}

/**
 * 처음 열 때 보기: 오늘 자리(center)를 보되, 그달 구역(area, 섬)이 보기보다 작은 쪽은 섬을 가운데에 두고,
 * 큰 쪽은 섬 끝 밖의 빈 하늘이 보이지 않게 끝에 맞춘다
 */
export function startView(center: Pt, unit: number, screen: Size, area: View): View {
  const v = viewAround(center, unit, screen)
  const fit = (at: number, size: number, from: number, span: number) =>
    span <= size ? from + span / 2 - size / 2 : Math.min(from + span - size, Math.max(from, at))
  return { ...v, x: fit(v.x, v.w, area.x, area.w), y: fit(v.y, v.h, area.y, area.h) }
}

/** 집이 몇 채 없을 때 처음 보기에서 가장 가까이: 칸 하나가 약 100px(지을 때 다가가는 거리보다 조금 멀리) */
export const FEW_UNIT = 0.48

/**
 * 처음 열 때 보기. 집이 있고 그 집들과 오늘 자리(boxes)가 처음 보기(unit)보다 가까이에서 다 들어오면
 * 그 상자들이 화면에 꽉 차게 본다(FEW_UNIT 보다 다가가지 않음). 아니면 startView 그대로
 */
export function openingView(center: Pt, unit: number, screen: Size, area: View, boxes: View[], houses: number, inset: { side: number; top: number; bottom: number }): View {
  const start = startView(center, unit, screen, area)
  if (houses <= 0 || boxes.length === 0) return start
  const fit = fitBoxes(boxes, FEW_UNIT, screen, inset)
  return unitOf(fit, screen) < unit - 1e-9 ? fit : start
}

/** 가장 멀리 볼 때 마을 둘레에 비워 둘 화면 여백(px). 위는 날씨 칩 자리, 아래도 같게 해 마을이 화면 한가운데 온다 */
export const FAR_INSET = { side: 20, top: 56, bottom: 56 }
/** 마을이 작아도 이만큼은 멀리 볼 수 있다(칸 하나가 약 48px) */
export const FAR_MIN = 1

/**
 * 가장 멀리 보기: 마을 전체(world)가 여백 안에 꽉 차게 화면 한가운데 온다(FAR_MIN 보다 가깝지 않다).
 * 마을이 너무 커서 MAX_UNIT 에서도 다 안 들어오면 null(그땐 MAX_UNIT 까지 자유롭게 본다)
 */
export function farView(world: View, screen: Size): View | null {
  const roomW = Math.max(1, screen.w - 2 * FAR_INSET.side)
  const roomH = Math.max(1, screen.h - FAR_INSET.top - FAR_INSET.bottom)
  const fit = Math.max(world.w / roomW, world.h / roomH)
  if (fit > MAX_UNIT) return null
  return viewAround({ x: world.x + world.w / 2, y: world.y + world.h / 2 }, Math.max(FAR_MIN, fit), screen)
}

/**
 * 줄일 때(base → next) 가장 멀리 보기에 다가간 만큼 마을 쪽으로 가운데를 옮긴다.
 * 끝까지 줄이면 farView 에서 멈춘다. 가까이 볼 때는 next 그대로(손가락 자리를 지킨다)
 */
export function settleZoom(base: View, next: View, world: View, screen: Size): View {
  const far = farView(world, screen)
  if (!far) return next
  const ub = unitOf(base, screen)
  const un = unitOf(next, screen)
  const uf = unitOf(far, screen)
  if (un <= ub + 1e-9) return next
  if (un >= uf - 1e-9 || ub >= uf) return far
  const t = (un - ub) / (uf - ub)
  const cx = next.x + next.w / 2 + (far.x + far.w / 2 - next.x - next.w / 2) * t
  const cy = next.y + next.h / 2 + (far.y + far.h / 2 - next.y - next.h / 2) * t
  return { ...next, x: cx - next.w / 2, y: cy - next.h / 2 }
}

/** anchor(viewBox 좌표)를 화면에서 제자리에 두고 factor 배로 넓게(>1) 또는 좁게(<1) 본다 */
export function zoomAt(view: View, factor: number, anchor: Pt, screen: Size): View {
  if (!(screen.w > 0 && screen.h > 0)) return view
  const unit = unitOf(view, screen)
  const target = Math.min(MAX_UNIT, Math.max(MIN_UNIT, unit * factor))
  const f = target / unit
  if (Math.abs(f - 1) < 1e-9) return view
  return {
    x: anchor.x - (anchor.x - view.x) * f,
    y: anchor.y - (anchor.y - view.y) * f,
    w: view.w * f,
    h: view.h * f,
  }
}

/** 천천히 시작해 천천히 멈추는 곡선(0~1) */
export function easeInOut(t: number): number {
  const s = Math.min(1, Math.max(0, t))
  return s < 0.5 ? 2 * s * s : 1 - (-2 * s + 2) ** 2 / 2
}

/** a → b 사이 t(0~1) 지점의 보기. 가운데는 곧게, 크기는 배율로 이어 확대가 고르게 느껴진다 */
export function tweenView(a: View, b: View, t: number): View {
  if (t <= 0) return a
  if (t >= 1) return b
  const cx = a.x + a.w / 2 + (b.x + b.w / 2 - a.x - a.w / 2) * t
  const cy = a.y + a.h / 2 + (b.y + b.h / 2 - a.y - a.h / 2) * t
  const w = a.w * (b.w / a.w) ** t
  const h = a.h * (b.h / a.h) ** t
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

/** 짓는 연출이 시작되고 ms 가 지났을 때의 보기 */
export function showView(from: View, near: View, ms: number): { view: View; done: boolean } {
  if (ms >= SHOW.go + SHOW.hold + SHOW.back) return { view: from, done: true }
  if (ms <= SHOW.go) return { view: tweenView(from, near, easeInOut(ms / SHOW.go)), done: false }
  if (ms <= SHOW.go + SHOW.hold) return { view: near, done: false }
  return { view: tweenView(near, from, easeInOut((ms - SHOW.go - SHOW.hold) / SHOW.back)), done: false }
}

/** 지을 때 다가갈 거리. 이미 더 가까이 보고 있었으면 그대로 */
export function buildUnit(current: number): number {
  return Math.min(current, BUILD_UNIT)
}
