import { farScene, type Hill } from '../core/scenery'
import { driftBits, seasonOf, type DriftBit } from '../core/season'
import { skyBits, type DayPart, type SkyBit, type WeatherKind } from '../core/weather'

/** 하늘 그림 하나(작은 SVG). 모두 둥근 도형에 얇은 테두리다 */
function bitSvg(b: SkyBit): string {
  switch (b.kind) {
    case 'sun': {
      // 저녁 해는 노을빛 주황
      const [ray, body, line, glint] = b.tone === 'dusk' ? ['#ffc49a', '#ffa572', '#e07f55', '#ffd9bd'] : ['#ffe08a', '#ffd166', '#e8a94a', '#fff1bf']
      const rays = Array.from({ length: 10 }, (_, i) => `<rect x="47" y="2" width="6" height="15" rx="3" transform="rotate(${i * 36} 50 50)"/>`).join('')
      return `<svg viewBox="0 0 100 100"><g class="rays" fill="${ray}">${rays}</g>
        <circle cx="50" cy="50" r="27" fill="${body}" stroke="${line}" stroke-width="2.5"/>
        <circle cx="41" cy="42" r="8" fill="${glint}" opacity="0.8"/></svg>`
    }
    case 'moon':
      return `<svg viewBox="0 0 100 100"><path d="M62 10 A42 42 0 1 0 90 72 A34 34 0 1 1 62 10 Z" fill="#fff3b8" stroke="#d9b85c" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="34" cy="62" r="5" fill="#f2e2a0"/><circle cx="48" cy="80" r="3.5" fill="#f2e2a0"/></svg>`
    case 'cloud': {
      const grey = b.tone === 'grey'
      const fill = grey ? '#e6eaf0' : b.tone === 'dusk' ? '#ffe9e0' : b.tone === 'night' ? '#cfd0ea' : '#ffffff'
      const line = grey ? '#b9c0cb' : b.tone === 'dusk' ? '#e8bfae' : b.tone === 'night' ? '#9e9cc8' : '#d8cfc3'
      // 동그라미 셋과 납작한 바닥으로 만든 뭉게구름
      return `<svg viewBox="0 0 100 60"><path d="M18 52 A14 14 0 0 1 20 25 A18 18 0 0 1 50 14 A20 20 0 0 1 84 28 A12 12 0 0 1 84 52 Z" fill="${fill}" stroke="${line}" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M34 26 A12 12 0 0 1 48 20" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="${grey ? 0.8 : 0}"/></svg>`
    }
    case 'star':
      return `<svg viewBox="0 0 20 20"><path d="M10 1 Q11.4 8.6 19 10 Q11.4 11.4 10 19 Q8.6 11.4 1 10 Q8.6 8.6 10 1 Z" fill="#fff6c9" stroke="#e8d38a" stroke-width="0.8"/></svg>`
    case 'drop':
      return ''
  }
}

/** 계절에 흩날리는 것 하나(작은 SVG). 옅은 파스텔에 얇은 테두리 */
function driftSvg(b: DriftBit): string {
  switch (b.kind) {
    case 'petal':
      return `<svg viewBox="0 0 20 20"><path d="M10 2 Q17 6 14 14 Q10 19 6 14 Q3 6 10 2 Z" fill="#ffd3df" stroke="#e8a3b6" stroke-width="1.2" stroke-linejoin="round"/><path d="M10 5 Q10.5 10 9.5 14" fill="none" stroke="#f3b6c6" stroke-width="1" stroke-linecap="round"/></svg>`
    case 'leaf': {
      const [fill, line] = b.delay < 0.5 ? ['#f2b36b', '#c98545'] : ['#e8936a', '#bd6b47']
      return `<svg viewBox="0 0 20 20"><path d="M3 17 Q2 6 16 3 Q18 15 3 17 Z" fill="${fill}" stroke="${line}" stroke-width="1.2" stroke-linejoin="round"/><path d="M4 16 Q9 10 14 5" fill="none" stroke="${line}" stroke-width="1" stroke-linecap="round"/></svg>`
    }
    case 'snow':
      return `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" fill="#ffffff" stroke="#c9d6e6" stroke-width="1.4"/><circle cx="7.5" cy="7.5" r="2" fill="#eef4fb"/></svg>`
    case 'firefly':
      return `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9.5" fill="#fff6b8" opacity="0.5"/><circle cx="10" cy="10" r="5" fill="#fff4a8" stroke="#e8c95c" stroke-width="1"/></svg>`
  }
}

/** 둥근 봉우리 하나(밑동은 구름 바다 뒤로 숨는다) */
function hillPath(h: Hill, seaTop: number): string {
  const [x0, x1, top, base] = [h.x - h.w / 2, h.x + h.w / 2, seaTop - h.h, seaTop + 8]
  return `M${x0} ${base} C${x0 + h.w * 0.22} ${top - h.h * 0.25} ${x1 - h.w * 0.22} ${top - h.h * 0.25} ${x1} ${base} Z`
}

/**
 * 섬 아래·뒤 먼 바깥: 먼 산 한 겹과 구름 바다. 화면에 붙어 있어 끌어서 둘러봐도 끝이 드러나지 않는다.
 * 구름 바다는 두 폭을 이어 아주 천천히 옆으로 흐른다(움직임 줄이기면 멈춤). 뭉게는 굵은 테두리를 먼저 모두 그리고
 * 그 위에 속을 칠해, 겹친 뭉게 사이에 금이 가지 않고 바깥 둘레만 얇은 테두리가 남는다
 */
function drawFar(el: HTMLElement, date: string, part: DayPart) {
  const s = farScene(date, part)
  el.dataset.season = seasonOf(date)
  el.dataset.part = part
  const hills = s.hills
    .map((h, i) => {
      const d = hillPath(h, s.seaTop)
      const cap = s.snow
        ? `<clipPath id="far-hill-${i}"><path d="${d}"/></clipPath><path clip-path="url(#far-hill-${i})" d="M${h.x - h.w / 2} ${s.seaTop - h.h * 0.62} Q${h.x - h.w * 0.2} ${s.seaTop - h.h * 0.5} ${h.x} ${s.seaTop - h.h * 0.66} Q${h.x + h.w * 0.2} ${s.seaTop - h.h * 0.5} ${h.x + h.w / 2} ${s.seaTop - h.h * 0.62} L${h.x + h.w / 2} 0 L${h.x - h.w / 2} 0 Z" fill="#ffffff"/>`
        : ''
      return `<path d="${d}" fill="${s.hillFill}"/>${cap}<path d="${d}" fill="none" stroke="${s.hillLine}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`
    })
    .join('')
  // 뭉게 띠: 가로 100 × 세로 30. y·r은 띠 높이(30)에 맞춘다. 양 끝에 걸친 뭉게는 반대쪽에도 그려 두 폭이 이어진다
  const wrapped = s.puffs.flatMap((p) => [p, { ...p, x: p.x - 100 }, { ...p, x: p.x + 100 }])
  const circles = (fill: string, grow: number) => wrapped.map((p) => `<circle cx="${p.x}" cy="${(p.y * 0.3).toFixed(1)}" r="${p.r + grow}" fill="${fill}"/>`).join('')
  const strip = `<svg class="far-puffs" viewBox="0 0 100 30">${circles(s.seaLine, 0.6)}<rect y="11" width="100" height="17" fill="${s.seaLine}"/>${circles(s.seaFill, 0)}<rect y="11.6" width="100" height="18.4" fill="${s.seaFill}"/></svg>`
  el.innerHTML = `<svg class="far-hills" viewBox="0 0 100 100" preserveAspectRatio="none">${hills}</svg>
    <div class="far-sea" style="top:${s.seaTop}%;--sea:${s.seaFill};--shade:${s.seaShade}"><div class="far-flow">${strip}${strip}</div><div class="far-deep"></div></div>`
}

/**
 * 오늘 기분 날씨를 지금 때(낮·저녁·밤)에 맞게 마을 하늘에 그린다. back: 마을 뒤(해·달·구름·별), front: 마을 앞(빗방울).
 * 마을 앞에는 오늘 계절에 흩날리는 것(꽃잎·반딧불·낙엽·눈)도 옅게 얹는다(날짜로 정한다).
 * 누르기를 막지 않도록 둘 다 손가락을 통과시킨다.
 */
export function drawSky(back: HTMLElement, far: HTMLElement, front: HTMLElement, kind: WeatherKind, part: DayPart, date: string) {
  if (back.dataset.kind === kind && back.dataset.part === part && back.dataset.date === date) return
  back.dataset.kind = kind
  back.dataset.part = part
  back.dataset.date = date
  back.innerHTML = ''
  front.innerHTML = ''
  for (const b of skyBits(kind, part)) {
    const node = document.createElement('span')
    node.className = `sky-bit ${b.kind}${b.tone ? ` ${b.tone}` : ''}`
    node.style.left = `${b.x}%`
    node.style.setProperty('--size', `${b.size}px`)
    node.style.setProperty('--d', String(b.delay))
    if (b.kind === 'drop') {
      node.style.setProperty('--y', String(b.y))
      front.appendChild(node)
    } else {
      node.style.top = `${b.y}%`
      node.innerHTML = bitSvg(b)
      back.appendChild(node)
    }
  }
  drawFar(far, date, part)
  for (const b of driftBits(date, part, kind)) {
    const node = document.createElement('span')
    node.className = `drift ${b.kind}`
    node.style.left = `${b.x}%`
    node.style.setProperty('--y', String(b.y))
    node.style.setProperty('--size', `${b.size}px`)
    node.style.setProperty('--d', String(b.delay))
    node.innerHTML = driftSvg(b)
    front.appendChild(node)
  }
}
