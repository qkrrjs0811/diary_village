// 마을 보기: 한 손가락으로 끌어서 둘러보고, 두 손가락(또는 마우스 휠)으로 확대·축소한다.
// 짧게 누르면(움직임이 거의 없으면) 누름으로 본다
import { SHOW, buildUnit, easeInOut, fitBoxes, openingView, settleZoom, showView, startView, tweenView, unitOf, viewAround, zoomAt, type Pt, type View } from '../core/view'

export type { View }

/** 여러 상자를 다 보이게 다가갈 때 비워 둘 화면 가장자리(px). 위는 날씨 칩 자리 */
const INSET = { side: 12, top: 44, bottom: 12 }

type Gesture =
  | { kind: 'drag'; id: number; px: number; py: number; view: View }
  | { kind: 'pinch'; dist: number; mid: Pt; anchor: Pt; view: View }

/**
 * onTap: 짧게 누른 곳(눌린 요소와 화면 좌표).
 * grab: 누르기 시작할 때 true 를 돌려주면 그 손가락은 화면을 끌지 않는다(꾸미기 중 소품 끌기)
 */
export function createCamera(svg: SVGSVGElement, onTap: (target: Element, at: Pt) => void, grab?: (e: PointerEvent) => boolean) {
  let view: View = { x: 0, y: 0, w: 100, h: 100 }
  const pointers = new Map<number, Pt>()
  let gesture: Gesture | null = null
  let moved = false
  /** 마을(섬 전체) 자리. 멀리 줄일수록 이 마을을 화면 가운데로 데려온다 */
  let world: View | null = null
  const settle = (base: View, next: View) => (world ? settleZoom(base, next, world, screen()) : next)

  const apply = () => svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`)
  const screen = () => {
    const r = svg.getBoundingClientRect()
    return { w: r.width, h: r.height }
  }
  /** 화면 좌표 → viewBox 좌표 */
  const toView = (p: Pt, v: View): Pt => {
    const r = svg.getBoundingClientRect()
    const u = unitOf(v, screen()) || 1
    return { x: v.x + v.w / 2 + (p.x - r.left - r.width / 2) * u, y: v.y + v.h / 2 + (p.y - r.top - r.height / 2) * u }
  }

  /** 지금 누른 손가락 수에 맞춰 몸짓을 새로 시작한다(손가락이 늘거나 줄어도 튀지 않게) */
  const restart = () => {
    const list = [...pointers.entries()]
    if (list.length >= 2) {
      const [a, b] = [list[0][1], list[1][1]]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      gesture = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid, anchor: toView(mid, view), view: { ...view } }
    } else if (list.length === 1) {
      const [id, p] = list[0]
      gesture = { kind: 'drag', id, px: p.x, py: p.y, view: { ...view } }
    } else {
      gesture = null
    }
  }

  /** 짓는 연출로 움직이는 중이면 그 번호. 손을 대면 멈추고 그 자리에 둔다 */
  let showFrame = 0
  const stopShow = () => {
    if (showFrame) cancelAnimationFrame(showFrame)
    showFrame = 0
  }

  svg.addEventListener('pointerdown', (e) => {
    stopShow()
    // 잡은 손가락의 누름·끌기는 grab 쪽이 맡는다(뒤따르는 click 은 누름으로 보지 않는다)
    if (pointers.size === 0 && grab?.(e)) return void (moved = true)
    if (pointers.size === 0) moved = false
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    restart()
  })
  window.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (gesture.kind === 'drag') {
      if (e.pointerId !== gesture.id) return
      const dx = e.clientX - gesture.px
      const dy = e.clientY - gesture.py
      if (!moved && Math.hypot(dx, dy) < 8) return
      moved = true
      svg.classList.add('dragging')
      const u = unitOf(gesture.view, screen()) || 1
      view = { ...gesture.view, x: gesture.view.x - dx * u, y: gesture.view.y - dy * u }
    } else {
      const [a, b] = [...pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      moved = true
      // 처음 두 손가락 가운데 있던 자리가 지금 두 손가락 가운데로 따라온다
      const z = zoomAt(gesture.view, gesture.dist / dist, gesture.anchor, screen())
      const u = unitOf(z, screen()) || 1
      view = settle(gesture.view, { ...z, x: z.x - (mid.x - gesture.mid.x) * u, y: z.y - (mid.y - gesture.mid.y) * u })
    }
    apply()
  })
  const end = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return
    restart()
    if (!gesture) svg.classList.remove('dragging')
  }
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  svg.addEventListener('click', (e) => {
    if (moved) return
    onTap(e.target as Element, { x: e.clientX, y: e.clientY })
  })
  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      stopShow()
      const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      view = settle(view, zoomAt(view, Math.exp(Math.max(-100, Math.min(100, step)) * 0.002), toView({ x: e.clientX, y: e.clientY }, view), screen()))
      apply()
    },
    { passive: false },
  )

  return {
    /** 화면 좌표 → 마을 그림(viewBox) 좌표 */
    toVillage: (p: Pt) => toView(p, view),
    /** 지금 화면 1px 이 마을 그림에서 몇인지 */
    unit: () => unitOf(view, screen()) || 1,
    /** 마을(섬 전체) 자리를 알려 준다(그릴 때마다) */
    setWorld(v: View | null) {
      world = v
    },
    show(v: View) {
      stopShow()
      view = v
      apply()
    },
    /** center 를 가운데에 두고 화면 1px = unit 으로 본다. area(섬)를 주면 섬이 화면에 알맞게 오도록 맞춘다 */
    focus(center: Pt, u: number, area?: View) {
      const s = screen()
      if (!(s.w > 0 && s.h > 0)) return false
      stopShow()
      view = area ? startView(center, u, s, area) : viewAround(center, u, s)
      apply()
      return true
    },
    /** 처음 열 때: 집이 몇 채 없으면 그 집들과 오늘 자리(boxes)가 꽉 차게, 아니면 focus 와 같이 본다 */
    open(center: Pt, u: number, area: View, boxes: View[], houses: number) {
      const s = screen()
      if (!(s.w > 0 && s.h > 0)) return false
      stopShow()
      view = openingView(center, u, s, area, boxes, houses, INSET)
      apply()
      return true
    },
    /** center 로(상자들을 주면 그 상자들이 모두 보이게) 부드럽게 옮겨 가서 그대로 머문다(명소 보러 가기) */
    glide(center: Pt | View[], u: number) {
      const s = screen()
      if (!(s.w > 0 && s.h > 0)) return
      stopShow()
      const from = { ...view }
      const to = Array.isArray(center) ? fitBoxes(center, u, s, INSET) : viewAround(center, u, s)
      const start = performance.now()
      const step = () => {
        const t = (performance.now() - start) / SHOW.go
        view = tweenView(from, to, easeInOut(t))
        apply()
        showFrame = t >= 1 ? 0 : requestAnimationFrame(step)
      }
      showFrame = requestAnimationFrame(step)
    },
    /** 새 집(center)으로(상자들을 주면 그 상자들이 모두 보이게) 부드럽게 다가가 잠시 머문 뒤 원래 보기로 돌아온다 */
    visit(center: Pt | View[]) {
      const s = screen()
      if (!(s.w > 0 && s.h > 0)) return
      stopShow()
      const from = { ...view }
      const u = buildUnit(unitOf(from, s))
      const near = Array.isArray(center) ? fitBoxes(center, u, s, INSET) : viewAround(center, u, s)
      const start = performance.now()
      const step = () => {
        const r = showView(from, near, performance.now() - start)
        view = r.view
        apply()
        showFrame = r.done ? 0 : requestAnimationFrame(step)
      }
      showFrame = requestAnimationFrame(step)
    },
  }
}
