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
