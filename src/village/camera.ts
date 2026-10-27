// 마을 보기: 한 손가락으로 끌어서 둘러보고, 두 손가락(또는 마우스 휠)으로 확대·축소한다.
// 짧게 누르면(움직임이 거의 없으면) 누름으로 본다
import { unitOf, viewAround, zoomAt, type Pt, type View } from '../core/view'

export type { View }

type Gesture =
  | { kind: 'drag'; id: number; px: number; py: number; view: View }
  | { kind: 'pinch'; dist: number; mid: Pt; anchor: Pt; view: View }

export function createCamera(svg: SVGSVGElement, onTap: (target: Element) => void) {
  let view: View = { x: 0, y: 0, w: 100, h: 100 }
  const pointers = new Map<number, Pt>()
  let gesture: Gesture | null = null
  let moved = false

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

  svg.addEventListener('pointerdown', (e) => {
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
      view = { ...z, x: z.x - (mid.x - gesture.mid.x) * u, y: z.y - (mid.y - gesture.mid.y) * u }
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
    onTap(e.target as Element)
  })
  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      view = zoomAt(view, Math.exp(Math.max(-100, Math.min(100, step)) * 0.002), toView({ x: e.clientX, y: e.clientY }, view), screen())
      apply()
    },
    { passive: false },
  )

  return {
    show(v: View) {
      view = v
      apply()
    },
    /** center 를 가운데에 두고 화면 1px = unit 으로 본다 */
    focus(center: Pt, u: number) {
      const s = screen()
      if (!(s.w > 0 && s.h > 0)) return false
      view = viewAround(center, u, s)
      apply()
      return true
    },
  }
}
