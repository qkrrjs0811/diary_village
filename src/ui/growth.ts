import { GROWTH_CALM_MS, growthDelays, growthEnd, growthNote, growthRings, growthScenes, type GrowthStep } from '../core/growth'
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
  /** 움직임 줄이기인지(장면을 시작할 때 물어본다) */
  calm: () => boolean
  /** 집이 오를 때 울리는 소리(total 채 가운데 index 번째). 집이 빠르면 몇 집마다 한 번만 부른다 */
  onRing: (index: number, total: number) => void
  /** 사용자가 붙인 달 이름(달 → 이름). 자막 아래에 그달 이름을 작게 보인다 */
  titles?: () => Record<string, string>
}) {
  const root = document.createElement('div')
  root.className = 'growth'
  root.dataset.testid = 'growth'
  root.hidden = true
  root.innerHTML = `
    <div class="growth-top">
      <div class="growth-caption" data-testid="growth-caption" aria-live="polite"><b></b><span></span><em data-testid="growth-title"></em></div>
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

  /** 그날 생긴 것(집·연기·깃발·마당 흔적·첫 집 팻말, 명소, 이사 온 이웃)을 보인다. say: 자막·축하 한 줄도 바꾼다 */
  function grow(step: GrowthStep, pop = true, say = true) {
    if (!svg) return
    const nodes = [
      ...svg.querySelectorAll<SVGElement>(`[data-date="${step.date}"]`),
      ...step.landmarks.flatMap((l) => [...svg!.querySelectorAll<SVGElement>(`.landmark[data-landmark="${l.id}"]`)]),
      ...step.arrivals.flatMap((r) => [...svg!.querySelectorAll<SVGElement>(`.resident[data-resident="${r.id}"]`)]),
    ]
    for (const n of nodes) {
      n.classList.add('grown')
      if (pop && (n.classList.contains('house') || n.classList.contains('landmark'))) {
        n.style.setProperty('--delay', '0ms')
        n.classList.remove('pop')
        void n.getBoundingClientRect()
        n.classList.add('pop')
      }
    }
    if (!say) return
    caption.querySelector('b')!.textContent = dateLabel(step.date).replace(/ .요일$/, '')
    caption.querySelector('span')!.textContent = step.house === null ? '' : step.house === 1 ? '첫 집' : `${step.house}번째 집`
    const title = handlers.titles?.()[step.date.slice(0, 7)]
    caption.querySelector('em')!.textContent = title ? `「${title}」` : ''
    const text = growthNote(step)
    if (text) {
      clearTimeout(noteTimer)
      note.textContent = text
      note.hidden = false
      noteTimer = window.setTimeout(() => (note.hidden = true), NOTE_MS)
    }
  }

  /** 다 보고 나면 가장 최근에 선 집(오늘 집)이 살짝 반짝인다 */
  function shine(steps: GrowthStep[]) {
    const step = [...steps].reverse().find((s) => s.house !== null)
    const house = step ? svg?.querySelector<SVGGraphicsElement>(`.house[data-date="${step.date}"]`) : null
    if (!house) return
    const box = house.getBBox()
    const ns = 'http://www.w3.org/2000/svg'
    const stars = document.createElementNS(ns, 'g')
    stars.setAttribute('class', 'growth-stars')
    stars.setAttribute('data-testid', 'growth-shine')
    const spots = [
      [0.5, -0.1, 30],
      [0.02, 0.2, 20],
      [0.98, 0.1, 22],
    ]
    spots.forEach(([dx, dy, size], k) => {
      const t = document.createElementNS(ns, 'text')
      t.setAttribute('x', (box.x + box.width * dx).toFixed(1))
      t.setAttribute('y', (box.y + box.height * dy).toFixed(1))
      t.setAttribute('text-anchor', 'middle')
      t.setAttribute('font-size', String(size))
      t.setAttribute('style', `--i:${k}`)
      t.textContent = '✨'
      stars.appendChild(t)
    })
    house.classList.add('growth-shine')
    house.appendChild(stars)
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
      caption.querySelector('em')!.textContent = ''
      note.hidden = true
      end.hidden = true
      root.hidden = false
      handlers.onStart()
      // 움직임 줄이기면 몇 장면만 보고, 장면 사이의 날들은 움직임 없이 한꺼번에 보인다
      const calm = handlers.calm()
      const scenes = calm ? growthScenes(steps) : steps.map((_, k) => k)
      const delays = calm ? scenes.map(() => GROWTH_CALM_MS) : growthDelays(steps)
      const rings = calm ? scenes.map(() => true) : growthRings(delays)
      let i = 0
      let shown = 0
      const next = () => {
        if (i < scenes.length) {
          const at = scenes[i]
          for (; shown < at; shown++) grow(steps[shown], false, false)
          grow(steps[shown++], !calm)
          if (rings[i]) handlers.onRing(at, steps.length)
          timer = window.setTimeout(next, delays[i++])
          return
        }
        note.hidden = true
        end.textContent = `🏡 ${last}`
        end.hidden = false
        shine(steps)
        timer = window.setTimeout(finish, END_MS)
      }
      // 마을이 멀리 물러날 틈을 잠깐 준다
      timer = window.setTimeout(next, 600)
    },
  }
}
