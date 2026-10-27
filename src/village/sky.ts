import { skyBits, type SkyBit, type WeatherKind } from '../core/weather'

/** 하늘 그림 하나(작은 SVG). 모두 둥근 도형에 얇은 테두리다 */
function bitSvg(b: SkyBit): string {
  switch (b.kind) {
    case 'sun': {
      const rays = Array.from({ length: 10 }, (_, i) => `<rect x="47" y="2" width="6" height="15" rx="3" transform="rotate(${i * 36} 50 50)"/>`).join('')
      return `<svg viewBox="0 0 100 100"><g class="rays" fill="#ffe08a">${rays}</g>
        <circle cx="50" cy="50" r="27" fill="#ffd166" stroke="#e8a94a" stroke-width="2.5"/>
        <circle cx="41" cy="42" r="8" fill="#fff1bf" opacity="0.8"/></svg>`
    }
    case 'moon':
      return `<svg viewBox="0 0 100 100"><path d="M62 10 A42 42 0 1 0 90 72 A34 34 0 1 1 62 10 Z" fill="#fff3b8" stroke="#d9b85c" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="34" cy="62" r="5" fill="#f2e2a0"/><circle cx="48" cy="80" r="3.5" fill="#f2e2a0"/></svg>`
    case 'cloud': {
      const grey = b.tone === 'grey'
      const fill = grey ? '#e6eaf0' : '#ffffff'
      const line = grey ? '#b9c0cb' : '#d8cfc3'
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

/**
 * 오늘 기분 날씨를 마을 하늘에 그린다. back: 마을 뒤(해·달·구름·별), front: 마을 앞(빗방울).
 * 누르기를 막지 않도록 둘 다 손가락을 통과시킨다.
 */
export function drawSky(back: HTMLElement, front: HTMLElement, kind: WeatherKind) {
  if (back.dataset.kind === kind) return
  back.dataset.kind = kind
  back.innerHTML = ''
  front.innerHTML = ''
  for (const b of skyBits(kind)) {
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
}
