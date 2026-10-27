// 마을 보기: 손가락으로 끌어서 둘러본다. 짧게 누르면(움직임이 거의 없으면) 누름으로 본다
export type View = { x: number; y: number; w: number; h: number }

export function createCamera(svg: SVGSVGElement, onTap: (target: Element) => void) {
  let view: View = { x: 0, y: 0, w: 100, h: 100 }
  let start: { px: number; py: number; view: View; id: number } | null = null
  let moved = false

  const apply = () => svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`)
  /** 화면 1px 이 viewBox 로 몇인지(preserveAspectRatio meet 기준) */
  const unit = () => Math.max(view.w / svg.clientWidth, view.h / svg.clientHeight) || 1

  svg.addEventListener('pointerdown', (e) => {
    start = { px: e.clientX, py: e.clientY, view: { ...view }, id: e.pointerId }
    moved = false
  })
  window.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return
    const dx = e.clientX - start.px
    const dy = e.clientY - start.py
    if (!moved && Math.hypot(dx, dy) < 8) return
    moved = true
    svg.classList.add('dragging')
    const u = unit()
    view = { ...start.view, x: start.view.x - dx * u, y: start.view.y - dy * u }
    apply()
  })
  const end = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return
    start = null
    svg.classList.remove('dragging')
  }
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  svg.addEventListener('click', (e) => {
    if (moved) return
    onTap(e.target as Element)
  })

  return {
    show(v: View) {
      view = v
      apply()
    },
  }
}
