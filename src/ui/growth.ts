import { growthDelays, growthEnd, growthNote, type GrowthStep } from '../core/growth'
import { dateLabel } from './format'

/** 끝 문장을 보여 주는 시간(ms). 그 뒤 지금 마을로 돌아온다 */
const END_MS = 2600
/** 축하 한 줄이 떠 있는 시간(ms). 다음 축하 날이 오면 바로 바뀐다 */
const NOTE_MS = 1800

/**
 * 마을이 자라 온 길: 지금 마을 그림을 "그날까지"로 걸러, 첫 집부터 쓴 날 순서대로 집이 하나씩 올라오는 장면.
 * 그림은 다시 그리지 않고 아직 오지 않은 날의 집·명소·이웃을 감췄다가 차례로 보인다(기록·꾸밈 소품은 건드리지 않는다).
 * 화면 어디를 누르거나 "건너뛰기"로 언제든 끝난다
 */
export function createGrowth(handlers: {
  /** 장면을 시작할 때(마을을 멀리 보기로 물린다) */
  onStart: () => void
  /** 끝날 때(다 봤거나 건너뛰었을 때). 지금 마을로 돌아온다 */
  onEnd: () => void
}) {
  const root = document.createElement('div')
  root.className = 'growth'
  root.dataset.testid = 'growth'
  root.hidden = true
  root.innerHTML = `
    <div class="growth-top">
      <div class="growth-caption" data-testid="growth-caption" aria-live="polite"><b></b><span></span></div>
      <div class="growth-note" data-testid="growth-note" role="status" hidden></div>
    </div>
    <div class="growth-end" data-testid="growth-end" role="status" hidden></div>
    <button type="button" class="growth-skip" data-testid="growth-skip">건너뛰기 ⏭</button>`
  const caption = root.querySelector<HTMLElement>('.growth-caption')!
  const note = root.querySelector<HTMLElement>('.growth-note')!
  const end = root.querySelector<HTMLElement>('.growth-end')!
  let svg: SVGSVGElement | null = null
  let timer = 0
  let noteTimer = 0

  function finish() {
    if (root.hidden) return
    clearTimeout(timer)
    clearTimeout(noteTimer)
    root.hidden = true
    svg?.classList.remove('growing')
    svg = null
    handlers.onEnd()
  }
  // 어디를 눌러도(건너뛰기 포함) 끝난다
  root.addEventListener('click', finish)

  /** 그날 생긴 것(집·연기·깃발·마당 흔적·첫 집 팻말, 명소, 이사 온 이웃)을 보인다 */
  function grow(step: GrowthStep) {
    if (!svg) return
    const nodes = [
      ...svg.querySelectorAll<SVGElement>(`[data-date="${step.date}"]`),
      ...step.landmarks.flatMap((l) => [...svg!.querySelectorAll<SVGElement>(`.landmark[data-landmark="${l.id}"]`)]),
      ...step.arrivals.flatMap((r) => [...svg!.querySelectorAll<SVGElement>(`.resident[data-resident="${r.id}"]`)]),
    ]
    for (const n of nodes) {
      n.classList.add('grown')
      if (n.classList.contains('house') || n.classList.contains('landmark')) {
        n.style.setProperty('--delay', '0ms')
        n.classList.remove('pop')
        void n.getBoundingClientRect()
        n.classList.add('pop')
      }
    }
    caption.querySelector('b')!.textContent = dateLabel(step.date).replace(/ .요일$/, '')
    caption.querySelector('span')!.textContent = step.house === null ? '' : step.house === 1 ? '첫 집' : `${step.house}번째 집`
    const text = growthNote(step)
    if (text) {
      clearTimeout(noteTimer)
      note.textContent = text
      note.hidden = false
      noteTimer = window.setTimeout(() => (note.hidden = true), NOTE_MS)
    }
  }

  return {
    root,
    get playing() {
      return !root.hidden
    },
    finish,
    /** 장면을 처음부터 보인다. 집을 지은 적이 없으면 아무것도 하지 않는다 */
    play(target: SVGSVGElement, steps: GrowthStep[]) {
      const last = growthEnd(steps)
      if (!last) return
      svg = target
      svg.querySelectorAll('.grown').forEach((n) => n.classList.remove('grown'))
      svg.classList.add('growing')
      caption.querySelector('b')!.textContent = ''
      caption.querySelector('span')!.textContent = ''
      note.hidden = true
      end.hidden = true
      root.hidden = false
      handlers.onStart()
      const delays = growthDelays(steps)
      let i = 0
      const next = () => {
        if (i < steps.length) {
          grow(steps[i])
          timer = window.setTimeout(next, delays[i++])
          return
        }
        note.hidden = true
        end.textContent = `🏡 ${last}`
        end.hidden = false
        timer = window.setTimeout(finish, END_MS)
      }
      // 마을이 멀리 물러날 틈을 잠깐 준다
      timer = window.setTimeout(next, 600)
    },
  }
}
