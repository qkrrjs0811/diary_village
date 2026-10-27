// 마을 그림: 기록에서 계산한 마을(src/core/village)을 아이소메트릭 SVG로 그린다.
// 그림은 모두 코드로 그린 도형이다. 둥글고 따뜻한 파스텔, 얇은 갈색 테두리.
import { BLOCK_H, BLOCK_W, ROAD, hash, houseLook, type Block, type Lot, type Village } from '../core/village'
import type { Entry } from '../core/types'
import { buildingInfo, buildingOf } from '../core/building'

const NS = 'http://www.w3.org/2000/svg'
/** 칸 하나의 화면 크기 */
export const TW = 48
export const TH = 24
const FLOOR_H = 17
const SLAB_DEPTH = 12
const LINE = 'rgba(90, 70, 54, 0.35)'

type Pt = { x: number; y: number }

/** 땅 좌표(칸) + 높이(px) → 화면 좌표 */
export function iso(gx: number, gy: number, h = 0): Pt {
  return { x: ((gx - gy) * TW) / 2, y: ((gx + gy) * TH) / 2 - h }
}

const pts = (list: Pt[]) => list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element) {
  const node = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  parent?.appendChild(node)
  return node
}

function poly(parent: Element, list: Pt[], fill: string, extra: Record<string, string | number> = {}) {
  return el('polygon', { points: pts(list), fill, stroke: LINE, 'stroke-width': 1, 'stroke-linejoin': 'round', ...extra }, parent)
}

/** 색을 어둡게(amount < 0) 또는 밝게(> 0) */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)
  const r = mix(n >> 16)
  const g = mix((n >> 8) & 0xff)
  const b = mix(n & 0xff)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

type Season = 'spring' | 'summer' | 'fall' | 'winter'

function seasonOf(month: string): Season {
  const m = Number(month.slice(5, 7))
  if (m >= 3 && m <= 5) return 'spring'
  if (m >= 6 && m <= 8) return 'summer'
  if (m >= 9 && m <= 11) return 'fall'
  return 'winter'
}

const GRASS: Record<Season, string> = { spring: '#c4e6a5', summer: '#a9d98c', fall: '#d8d58f', winter: '#e6eef0' }
const LEAVES: Record<Season, string[]> = {
  spring: ['#ffc2d4', '#b8e0a0', '#ffd6e2'],
  summer: ['#7cc47f', '#93d18a', '#6bb879'],
  fall: ['#f2a65a', '#f5c45e', '#e88f5a'],
  winter: ['#8fbfa8', '#a3c9b5', '#7fb39b'],
}
const PATH = '#efe2c8'
const SOIL = '#c99f78'

/** 구역 하나의 땅: 길 테두리가 있는 두툼한 판 */
function drawSlab(g: Element, labels: Element, block: Block) {
  const x0 = block.bx * (BLOCK_W + ROAD) - ROAD / 2
  const y0 = block.by * (BLOCK_H + ROAD) - ROAD / 2
  const x1 = x0 + BLOCK_W + ROAD
  const y1 = y0 + BLOCK_H + ROAD
  const top = [iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)]
  const down = (p: Pt) => ({ x: p.x, y: p.y + SLAB_DEPTH })
  // 앞쪽 두 옆면(흙)
  poly(g, [top[3], top[2], down(top[2]), down(top[3])], shade(SOIL, -0.12))
  poly(g, [top[2], top[1], down(top[1]), down(top[2])], SOIL)
  poly(g, top, PATH)
  const season = seasonOf(block.month)
  const gx0 = block.bx * (BLOCK_W + ROAD)
  const gy0 = block.by * (BLOCK_H + ROAD)
  const inset = 0.08
  poly(
    g,
    [iso(gx0 - inset, gy0 - inset), iso(gx0 + BLOCK_W + inset, gy0 - inset), iso(gx0 + BLOCK_W + inset, gy0 + BLOCK_H + inset), iso(gx0 - inset, gy0 + BLOCK_H + inset)],
    GRASS[season],
    { rx: 6 },
  )
  // 구역 이름표: 길 위 왼쪽 위 모서리에 "10월"
  const label = iso(x0 + 0.1, y0 + 0.1)
  const m = Number(block.month.slice(5, 7))
  const sign = el('g', { class: 'month-sign', 'data-testid': `month-${block.month}` }, labels)
  el('rect', { x: label.x - 20, y: label.y - 4, width: 40, height: 18, rx: 9, fill: '#fffaf0', stroke: LINE }, sign)
  const t = el('text', { x: label.x, y: label.y + 9, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#7a604a' }, sign)
  t.textContent = `${m}월`
}

function drawTree(g: Element, gx: number, gy: number, season: Season, seed: number) {
  const c = iso(gx + 0.5, gy + 0.5)
  const leaves = LEAVES[season]
  const size = 9 + (seed % 4)
  const tree = el('g', { class: 'tree' }, g)
  el('ellipse', { cx: c.x, cy: c.y + 2, rx: 9, ry: 4, fill: 'rgba(90,70,54,0.12)' }, tree)
  el('rect', { x: c.x - 2, y: c.y - 10, width: 4, height: 12, rx: 2, fill: '#a7805e' }, tree)
  const color = leaves[seed % leaves.length]
  el('circle', { cx: c.x, cy: c.y - 14 - size / 2, r: size, fill: color, stroke: LINE }, tree)
  el('circle', { cx: c.x - size * 0.35, cy: c.y - 18 - size / 2, r: size * 0.4, fill: shade(color, 0.3) }, tree)
  if (season === 'winter') el('ellipse', { cx: c.x, cy: c.y - 16 - size, rx: size * 0.7, ry: size * 0.35, fill: '#ffffff' }, tree)
}

function drawFlowers(g: Element, gx: number, gy: number, seed: number) {
  const colors = ['#ffffff', '#ffd6e2', '#fff1a8']
  for (let i = 0; i < 3; i++) {
    const u = 0.25 + ((seed >>> (i * 4)) % 6) / 10
    const v = 0.25 + ((seed >>> (i * 4 + 2)) % 6) / 10
    const p = iso(gx + u, gy + v)
    el('circle', { cx: p.x, cy: p.y, r: 1.8, fill: colors[i % 3] }, g)
  }
}

/** 오늘 아직 안 쓴 자리: 반짝이는 표시 */
function drawTodaySpot(g: Element, gx: number, gy: number) {
  const spot = el('g', { class: 'today-spot', 'data-testid': 'today-spot' }, g)
  const a = 0.12
  const b = 0.88
  poly(spot, [iso(gx + a, gy + a), iso(gx + b, gy + a), iso(gx + b, gy + b), iso(gx + a, gy + b)], 'rgba(255,255,255,0.55)', {
    stroke: '#ffb36b',
    'stroke-width': 1.5,
    'stroke-dasharray': '4 3',
  })
  const c = iso(gx + 0.5, gy + 0.5)
  el('ellipse', { cx: c.x, cy: c.y, rx: 18, ry: 9, fill: 'none', stroke: '#ffb36b', 'stroke-width': 2, class: 'pulse' }, spot)
  el('rect', { x: c.x - 1, y: c.y - 26, width: 2, height: 26, rx: 1, fill: '#a7805e' }, spot)
  el('path', { d: `M${c.x + 1} ${c.y - 26} l14 5 l-14 5 z`, fill: '#ff8a5b', stroke: LINE }, spot)
  const t = el('text', { x: c.x - 12, y: c.y - 18, 'text-anchor': 'middle', 'font-size': 13, class: 'twinkle' }, spot)
  t.textContent = '✨'
}

/** 칸 안 좌표(u, v: 0~1) + 높이 → 화면 좌표 */
type Place = (u: number, v: number, h?: number) => Pt
type RoofStyle = 'gable' | 'hip' | 'flat' | 'dome'

/** 벽 두 면(왼쪽 앞면 v = b, 오른쪽 앞면 u = b). 바닥은 a~b 정사각형 */
function drawWalls(house: Element, P: Place, a: number, b: number, H: number, wall: string) {
  poly(house, [P(a, b), P(b, b), P(b, b, H), P(a, b, H)], shade(wall, -0.1))
  poly(house, [P(b, b), P(b, a), P(b, a, H), P(b, b, H)], wall)
}

/** 문(왼쪽 앞면 가운데)과 층마다 따뜻한 불빛 창문 */
function drawDoorWindows(house: Element, P: Place, a: number, b: number, floors: number) {
  const m = (a + b) / 2
  const doorW = 0.16
  poly(house, [P(m - doorW / 2, b), P(m + doorW / 2, b), P(m + doorW / 2, b, 11), P(m - doorW / 2, b, 11)], '#b07f5a')
  for (let f = 0; f < floors; f++) {
    const h0 = f * FLOOR_H + 6
    poly(house, [P(b, m + 0.09, h0), P(b, m - 0.09, h0), P(b, m - 0.09, h0 + 7), P(b, m + 0.09, h0 + 7)], '#ffe7a3')
    if (f > 0) poly(house, [P(m - 0.08, b, h0), P(m + 0.08, b, h0), P(m + 0.08, b, h0 + 7), P(m - 0.08, b, h0 + 7)], '#ffe7a3')
  }
}

function drawChimney(house: Element, P: Place, H: number) {
  const cu = 0.34
  const cv = 0.36
  poly(house, [P(cu, cv + 0.1, H), P(cu + 0.1, cv + 0.1, H), P(cu + 0.1, cv + 0.1, H + 20), P(cu, cv + 0.1, H + 20)], '#c98f72')
  poly(house, [P(cu + 0.1, cv + 0.1, H), P(cu + 0.1, cv, H), P(cu + 0.1, cv, H + 20), P(cu + 0.1, cv + 0.1, H + 20)], '#d9a487')
  poly(house, [P(cu, cv, H + 20), P(cu + 0.1, cv, H + 20), P(cu + 0.1, cv + 0.1, H + 20), P(cu, cv + 0.1, H + 20)], '#e3b49a')
}

/** 지붕. 지붕 색은 기분 색이다. 돌려주는 값은 지붕 꼭대기 높이 */
function drawRoof(house: Element, P: Place, a: number, b: number, H: number, style: RoofStyle, roof: string, wall: string, pot = true): number {
  const roofDark = shade(roof, -0.15)
  const o = 0.06 // 처마
  const k = (b - a) / 0.6 // 작은 집은 지붕도 낮게
  const m = (a + b) / 2
  if (style === 'gable') {
    // 용마루가 u 방향. 뒤 경사 → 오른쪽 박공 → 앞 경사 순서로 그린다
    const R = 13 * k
    poly(house, [P(a - o, a - o, H), P(b + o, a - o, H), P(b + o, m, H + R), P(a - o, m, H + R)], roofDark)
    poly(house, [P(b, b, H), P(b, a, H), P(b, m, H + R)], wall)
    poly(house, [P(a - o, b + o, H), P(b + o, b + o, H), P(b + o, m, H + R), P(a - o, m, H + R)], roof)
    return H + R
  }
  if (style === 'hip') {
    const R = 15 * k
    const apex = P(m, m, H + R)
    const p1 = P(a - o, a - o, H)
    const p2 = P(b + o, a - o, H)
    const p3 = P(b + o, b + o, H)
    const p4 = P(a - o, b + o, H)
    poly(house, [p1, p2, apex], roofDark)
    poly(house, [p4, p1, apex], roofDark)
    poly(house, [p2, p3, apex], shade(roof, 0.12))
    poly(house, [p3, p4, apex], roof)
    return H + R
  }
  // 평평한 지붕: 테두리 단(+ 옥상 화분). 둥근 지붕은 그 위에 반구를 얹는다
  poly(house, [P(a - o, b + o, H), P(b + o, b + o, H), P(b + o, b + o, H + 4), P(a - o, b + o, H + 4)], roofDark)
  poly(house, [P(b + o, b + o, H), P(b + o, a - o, H), P(b + o, a - o, H + 4), P(b + o, b + o, H + 4)], roof)
  poly(house, [P(a - o, a - o, H + 4), P(b + o, a - o, H + 4), P(b + o, b + o, H + 4), P(a - o, b + o, H + 4)], shade(roof, 0.25))
  if (style === 'dome') {
    const c = P(m, m, H + 4)
    const rx = ((b - a) * TW) / 2
    const ry = 16
    el('path', { d: `M${c.x - rx} ${c.y} A${rx} ${ry} 0 0 1 ${c.x + rx} ${c.y} Z`, fill: roof, stroke: LINE }, house)
    el('path', { d: `M${c.x - rx * 0.55} ${c.y - 4} A${rx * 0.55} ${ry * 0.6} 0 0 1 ${c.x} ${c.y - ry * 0.75}`, fill: 'none', stroke: shade(roof, 0.45), 'stroke-width': 2.5, 'stroke-linecap': 'round' }, house)
    el('circle', { cx: c.x, cy: c.y - ry - 2, r: 2.5, fill: '#ffd36b', stroke: LINE }, house)
    return H + 4 + ry
  }
  if (pot) {
    const p = P(0.42, 0.42, H + 4)
    el('circle', { cx: p.x, cy: p.y - 5, r: 4.5, fill: '#8fd18a', stroke: LINE }, house)
  }
  return H + 4
}

/** 문 위 줄무늬 차양(왼쪽 앞면) */
function drawAwning(house: Element, P: Place, b: number, u0: number, u1: number, h: number, colors: [string, string]) {
  const n = 4
  for (let i = 0; i < n; i++) {
    const x0 = u0 + ((u1 - u0) * i) / n
    const x1 = u0 + ((u1 - u0) * (i + 1)) / n
    poly(house, [P(x0, b, h), P(x1, b, h), P(x1, b + 0.15, h - 4), P(x0, b + 0.15, h - 4)], colors[i % 2], { 'stroke-width': 0.6 })
  }
  // 둥근 끝단
  for (let i = 0; i < n; i++) {
    const p = P(u0 + ((u1 - u0) * (i + 0.5)) / n, b + 0.15, h - 4)
    el('circle', { cx: p.x, cy: p.y, r: 1.9, fill: colors[i % 2], stroke: LINE, 'stroke-width': 0.6 }, house)
  }
}

/** 앞 모서리에 매단 둥근 간판(문·창문과 이웃 집을 가리지 않는다) */
function drawSign(house: Element, P: Place, b: number, icon: string) {
  const top = P(b, b, 16)
  const at = P(b + 0.02, b + 0.02, 12)
  el('line', { x1: top.x, y1: top.y, x2: at.x, y2: at.y, stroke: '#a7805e', 'stroke-width': 1 }, house)
  el('circle', { cx: at.x, cy: at.y, r: 5.5, fill: '#fffaf0', stroke: '#a7805e', 'stroke-width': 1 }, house)
  const t = el('text', { x: at.x, y: at.y + 2.5, 'text-anchor': 'middle', 'font-size': 7 }, house)
  t.textContent = icon
}

function drawCat(house: Element, at: Pt, color: string) {
  el('ellipse', { cx: at.x, cy: at.y + 1, rx: 6, ry: 2.5, fill: 'rgba(90,70,54,0.14)' }, house)
  el('path', { d: `M${at.x + 4} ${at.y - 2} q7 -2 5 -10`, fill: 'none', stroke: color, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, house)
  el('ellipse', { cx: at.x, cy: at.y - 4, rx: 4.8, ry: 4.2, fill: color, stroke: LINE }, house)
  el('path', { d: `M${at.x - 4.6} ${at.y - 11} l1 -5 l2.6 3 z M${at.x + 0.4} ${at.y - 11} l1 -5 l2.4 3.4 z`, fill: color, stroke: LINE, 'stroke-width': 0.8, 'stroke-linejoin': 'round' }, house)
  el('circle', { cx: at.x - 1.5, cy: at.y - 10.5, r: 3.8, fill: color, stroke: LINE }, house)
  el('circle', { cx: at.x - 2.8, cy: at.y - 11, r: 0.6, fill: '#5a4636' }, house)
  el('circle', { cx: at.x - 0.2, cy: at.y - 11, r: 0.6, fill: '#5a4636' }, house)
}

function drawDog(house: Element, at: Pt, color: string) {
  el('ellipse', { cx: at.x, cy: at.y + 1, rx: 7, ry: 2.8, fill: 'rgba(90,70,54,0.14)' }, house)
  el('path', { d: `M${at.x + 5} ${at.y - 4} l4 -4`, stroke: color, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, house)
  el('ellipse', { cx: at.x, cy: at.y - 4, rx: 5.5, ry: 4.5, fill: color, stroke: LINE }, house)
  el('circle', { cx: at.x - 2, cy: at.y - 11, r: 4.2, fill: color, stroke: LINE }, house)
  el('ellipse', { cx: at.x - 5.6, cy: at.y - 10, rx: 1.6, ry: 3, fill: shade(color, -0.25) }, house)
  el('ellipse', { cx: at.x + 1.6, cy: at.y - 10, rx: 1.6, ry: 3, fill: shade(color, -0.25) }, house)
  el('circle', { cx: at.x - 3.2, cy: at.y - 11.5, r: 0.6, fill: '#5a4636' }, house)
  el('circle', { cx: at.x - 0.8, cy: at.y - 11.5, r: 0.6, fill: '#5a4636' }, house)
  el('circle', { cx: at.x - 2, cy: at.y - 9.6, r: 0.8, fill: '#5a4636' }, house)
}

/** 운동장: 낮은 잔디 마당, 하얀 선, 작은 골대 두 개, 공, 기분 색 깃발 */
function drawField(house: Element, P: Place, flag: string): number {
  poly(house, [P(0.06, 0.06), P(0.94, 0.06), P(0.94, 0.94), P(0.06, 0.94)], '#a6d98f', { rx: 4 })
  poly(house, [P(0.06, 0.94), P(0.94, 0.94), P(0.94, 0.94, -3), P(0.06, 0.94, -3)], '#8fc47c')
  poly(house, [P(0.94, 0.94), P(0.94, 0.06), P(0.94, 0.06, -3), P(0.94, 0.94, -3)], '#9bcf85')
  const line = { fill: 'none', stroke: '#ffffff', 'stroke-width': 1.2, 'stroke-opacity': 0.9 }
  poly(house, [P(0.16, 0.16), P(0.84, 0.16), P(0.84, 0.84), P(0.16, 0.84)], 'none', line)
  el('line', { x1: P(0.5, 0.16).x, y1: P(0.5, 0.16).y, x2: P(0.5, 0.84).x, y2: P(0.5, 0.84).y, ...line }, house)
  const c = P(0.5, 0.5)
  el('ellipse', { cx: c.x, cy: c.y, rx: 7, ry: 3.5, ...line }, house)
  // 골대(u = 0.16, 0.84 쪽)
  for (const u of [0.16, 0.84]) {
    const p1 = P(u, 0.4)
    const p2 = P(u, 0.6)
    el('path', { d: `M${p1.x} ${p1.y} v-8 L${p2.x} ${p2.y - 8} v8`, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, house)
  }
  const ball = P(0.62, 0.42)
  el('circle', { cx: ball.x, cy: ball.y - 2.5, r: 2.6, fill: '#ffffff', stroke: LINE }, house)
  const f = P(0.86, 0.14)
  el('rect', { x: f.x - 0.8, y: f.y - 20, width: 1.6, height: 20, fill: '#a7805e' }, house)
  el('path', { d: `M${f.x + 0.8} ${f.y - 20} l10 3.5 l-10 3.5 z`, fill: flag, stroke: LINE }, house)
  return 10
}

/** 등대: 기분 색 줄무늬의 하얀 탑, 불빛 방, 뾰족 지붕 */
function drawLighthouse(house: Element, P: Place, roof: string): number {
  const c = P(0.5, 0.5)
  el('ellipse', { cx: c.x, cy: c.y + 1, rx: 17, ry: 7.5, fill: '#d9cbb4', stroke: LINE }, house)
  const T = 46
  const half = (h: number) => 10.5 - (h / T) * 3
  const slice = (h0: number, h1: number, fill: string) =>
    poly(house, [
      { x: c.x - half(h0), y: c.y - h0 },
      { x: c.x + half(h0), y: c.y - h0 },
      { x: c.x + half(h1), y: c.y - h1 },
      { x: c.x - half(h1), y: c.y - h1 },
    ], fill)
  slice(0, T, '#fffaf0')
  slice(10, 18, roof)
  slice(28, 36, roof)
  poly(house, [{ x: c.x - 2.5, y: c.y }, { x: c.x + 2.5, y: c.y }, { x: c.x + 2.5, y: c.y - 8 }, { x: c.x - 2.5, y: c.y - 8 }], '#b07f5a')
  el('rect', { x: c.x - 11, y: c.y - T - 3, width: 22, height: 3, rx: 1.5, fill: '#c9a27e', stroke: LINE }, house)
  el('ellipse', { cx: c.x, cy: c.y - T - 8, rx: 14, ry: 6, fill: 'rgba(255, 231, 163, 0.45)' }, house)
  el('rect', { x: c.x - 6, y: c.y - T - 12, width: 12, height: 9, rx: 2, fill: '#ffe7a3', stroke: LINE }, house)
  poly(house, [{ x: c.x - 8.5, y: c.y - T - 12 }, { x: c.x + 8.5, y: c.y - T - 12 }, { x: c.x, y: c.y - T - 23 }], shade(roof, -0.1))
  return T
}

/** 그날 건물(글 단어로 정함) 또는 보통 집. 기분은 지붕 색만 바꾼다. 돌려주는 값은 연출을 띄울 높이 */
function drawHouse(g: Element, lot: Lot, entry: Entry, isNew: boolean): number {
  const look = houseLook(entry)
  const kind = buildingOf(entry)?.id
  const house = el('g', {
    class: isNew ? 'house pop' : 'house',
    'data-testid': `house-${entry.date}`,
    'data-date': entry.date,
    'data-mood': entry.mood,
    'data-building': kind ?? 'house',
  }, g)
  const { gx, gy } = lot
  const P: Place = (u, v, h = 0) => iso(gx + u, gy + v, h)
  // 누르기 쉬운 넓은 투명 영역
  const hitH = kind === 'lighthouse' ? 70 : FLOOR_H * look.floors + 26
  poly(house, [P(0, 0, hitH), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0)], 'transparent', { stroke: 'none', class: 'hit' })
  if (kind === 'field') return drawField(house, P, look.roof)
  if (kind === 'lighthouse') return drawLighthouse(house, P, look.roof)
  el('ellipse', { cx: P(0.5, 0.5).x, cy: P(0.5, 0.5).y + 3, rx: 17, ry: 7, fill: 'rgba(90,70,54,0.14)' }, house)
  const seed = hash(entry.date)

  if (kind === 'catHouse' || kind === 'dogHouse') {
    // 작은 집과 그 앞의 동물
    const a = 0.28
    const b = 0.68
    const H = kind === 'catHouse' ? 15 : 12
    drawWalls(house, P, a, b, H, look.wall)
    const m = (a + b) / 2
    if (kind === 'dogHouse') {
      const d = P(m, b)
      el('path', { d: `M${d.x - 4} ${d.y + 0.5} v-4 a4 4 0 0 1 8 0 v4 z`, fill: '#6b5240' }, house)
    } else {
      poly(house, [P(m - 0.07, b), P(m + 0.07, b), P(m + 0.07, b, 9), P(m - 0.07, b, 9)], '#b07f5a')
      poly(house, [P(b, m + 0.07, 5), P(b, m - 0.07, 5), P(b, m - 0.07, 11), P(b, m + 0.07, 11)], '#ffe7a3')
    }
    drawRoof(house, P, a, b, H, kind === 'catHouse' ? 'hip' : 'gable', look.roof, look.wall)
    const pets = kind === 'catHouse' ? ['#f2b277', '#c9c1b8', '#fff4e0'] : ['#d9a46b', '#f5e6cf', '#a07858']
    const at = P(0.86, 0.78)
    if (kind === 'catHouse') drawCat(house, at, pets[seed % 3])
    else {
      drawDog(house, at, pets[seed % 3])
      const bowl = P(0.5, 0.9)
      el('ellipse', { cx: bowl.x, cy: bowl.y, rx: 3.2, ry: 1.6, fill: '#e88f8f', stroke: LINE }, house)
    }
    return H
  }

  const a = 0.2
  const b = 0.8
  const H = FLOOR_H * look.floors
  drawWalls(house, P, a, b, H, look.wall)
  drawDoorWindows(house, P, a, b, look.floors)
  const style: RoofStyle =
    kind === 'cafe' || kind === 'flowerShop' || kind === 'bakery'
      ? 'gable'
      : kind === 'bookstore'
        ? 'hip'
        : kind === 'cinema'
          ? 'flat'
          : kind === 'musicHall'
            ? 'dome'
            : look.roofStyle
  if ((kind === 'bakery' || (!kind && look.chimney)) && style !== 'flat') drawChimney(house, P, H)
  drawRoof(house, P, a, b, H, style, look.roof, look.wall, kind !== 'cinema')
  if (!kind) return H

  const icon = buildingInfo(kind).icon
  if (kind === 'cafe') {
    drawAwning(house, P, b, 0.38, 0.62, 14, [look.roof, '#fffaf0'])
    // 바깥 자리: 파라솔 탁자
    const t = P(0.2, 0.97)
    el('rect', { x: t.x - 0.7, y: t.y - 15, width: 1.4, height: 15, fill: '#a7805e' }, house)
    el('ellipse', { cx: t.x, cy: t.y - 4, rx: 4.5, ry: 2, fill: '#fffaf0', stroke: LINE }, house)
    el('path', { d: `M${t.x - 9} ${t.y - 14} q9 -9 18 0 z`, fill: look.roof, stroke: LINE }, house)
    drawSign(house, P, b, icon)
  } else if (kind === 'bakery') {
    drawAwning(house, P, b, 0.38, 0.62, 14, ['#f6c98f', '#fffaf0'])
    // 가게 앞 작은 탁자 위 빵
    const t = P(0.2, 0.97)
    el('rect', { x: t.x - 0.8, y: t.y - 6, width: 1.6, height: 6, fill: '#a7805e' }, house)
    el('ellipse', { cx: t.x, cy: t.y - 6, rx: 6, ry: 2.6, fill: '#fffaf0', stroke: LINE }, house)
    el('ellipse', { cx: t.x, cy: t.y - 8.5, rx: 4.5, ry: 2.4, fill: '#e3a35f', stroke: LINE }, house)
    el('path', { d: `M${t.x - 2.5} ${t.y - 10} l1.4 2.2 M${t.x} ${t.y - 10.5} l1.4 2.2 M${t.x + 2.5} ${t.y - 10} l1.4 2.2`, stroke: '#fff1d6', 'stroke-width': 0.8 }, house)
    drawSign(house, P, b, icon)
  } else if (kind === 'bookstore') {
    const s = P(0.28, 0.93)
    const books = ['#8fb8e8', '#ff9f7a', '#9ed39b', '#ffc15e']
    books.forEach((color, i) => el('rect', { x: s.x - 5 + (i % 2), y: s.y - 3 - i * 2.6, width: 10 - (i % 2) * 2, height: 2.6, rx: 0.8, fill: color, stroke: LINE, 'stroke-width': 0.6 }, house))
    drawSign(house, P, b, icon)
  } else if (kind === 'flowerShop') {
    const flowers = ['#ff8fa3', '#ffc15e', '#c4a3d8', '#ffffff']
    ;[P(0.25, 0.9), P(0.35, 0.9), P(0.9, 0.58), P(0.9, 0.44)].forEach((p, i) => {
      poly(house, [{ x: p.x - 2.6, y: p.y - 4 }, { x: p.x + 2.6, y: p.y - 4 }, { x: p.x + 1.8, y: p.y }, { x: p.x - 1.8, y: p.y }], '#d9906b', { 'stroke-width': 0.6 })
      el('circle', { cx: p.x, cy: p.y - 6.5, r: 3, fill: flowers[(i + seed) % flowers.length], stroke: LINE, 'stroke-width': 0.6 }, house)
      el('circle', { cx: p.x, cy: p.y - 6.5, r: 1, fill: '#ffe07a' }, house)
    })
    drawSign(house, P, b, icon)
  } else if (kind === 'musicHall') {
    const n = P(0.85, 0.2, H + 20)
    const t1 = el('text', { x: n.x, y: n.y, 'font-size': 11, fill: '#7a604a', class: 'twinkle' }, house)
    t1.textContent = '♪'
    drawSign(house, P, b, icon)
  } else if (kind === 'cinema') {
    // 지붕 앞 전광판
    const u0 = 0.24
    const u1 = 0.76
    poly(house, [P(u0, b + 0.07, H + 1), P(u1, b + 0.07, H + 1), P(u1, b + 0.07, H + 14), P(u0, b + 0.07, H + 14)], '#fffaf0', { stroke: '#a7805e' })
    for (let i = 0; i < 6; i++) {
      const p = P(u0 + 0.04 + ((u1 - u0 - 0.08) * i) / 5, b + 0.07, H + 12)
      el('circle', { cx: p.x, cy: p.y, r: 1, fill: '#ffc15e' }, house)
    }
    const c = P(0.5, b + 0.07, H + 4)
    const t = el('text', { x: c.x, y: c.y, 'text-anchor': 'middle', 'font-size': 8 }, house)
    t.textContent = icon
  }
  return H
}

/** 짓는 순간의 반짝임과 작은 먼지. 집 위에 따로 그려 집과 함께 늘어나지 않게 한다 */
function drawBuildFx(fx: Element, lot: Lot, H: number) {
  const { gx, gy } = lot
  const show = el('g', { class: 'build-fx', 'data-testid': 'build-fx' }, fx)
  // 바닥 둘레로 퍼지는 먼지
  const base = iso(gx + 0.5, gy + 0.5)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3
    const dx = Math.cos(a) * 26
    const dy = Math.sin(a) * 12
    el('circle', { cx: base.x + dx * 0.4, cy: base.y + dy * 0.4 + 2, r: 3.2 + (i % 3), fill: '#f3e6d0', stroke: LINE, 'stroke-width': 0.6, class: 'dust', style: `--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;--i:${i % 3}` }, show)
  }
  // 지붕 둘레의 반짝임
  const top = iso(gx + 0.5, gy + 0.5, H + 14)
  const stars = [
    { x: 0, y: -16, s: 16, i: 0 },
    { x: -22, y: -2, s: 12, i: 1 },
    { x: 22, y: -6, s: 13, i: 2 },
    { x: -12, y: -26, s: 9, i: 3 },
    { x: 14, y: -24, s: 10, i: 4 },
  ]
  for (const st of stars) {
    const t = el('text', { x: top.x + st.x, y: top.y + st.y, 'text-anchor': 'middle', 'font-size': st.s, class: 'sparkle', style: `--i:${st.i}` }, show)
    t.textContent = '✨'
  }
}

export interface DrawOptions {
  today: string
  /** 방금 지은 집(짓는 연출) */
  newDate?: string
  /** 짓는 연출을 이만큼(ms) 기다렸다 시작한다(화면이 다가가는 동안) */
  buildDelay?: number
}

/** 마을 전체를 그린다. 뒤(위)에 있는 것부터 앞(아래)으로 */
export function drawVillage(svg: SVGSVGElement, village: Village, opt: DrawOptions) {
  svg.replaceChildren()
  const ground = el('g', { class: 'ground' }, svg)
  const delay = `--delay:${opt.buildDelay ?? 0}ms`
  const things = el('g', { class: 'things', style: delay }, svg)
  const fx = el('g', { class: 'fx', style: delay }, svg)
  const labels = el('g', { class: 'labels' }, svg)
  const blocks = [...village.blocks].sort((a, b) => a.bx + a.by - (b.bx + b.by))
  for (const block of blocks) drawSlab(ground, labels, block)

  type Item = { depth: number; draw: () => void }
  const items: Item[] = []
  for (const block of village.blocks) {
    const season = seasonOf(block.month)
    const days = new Map(block.lots.map((l) => [`${l.col},${l.row}`, l]))
    for (let row = 0; row < BLOCK_H; row++) {
      for (let col = 0; col < BLOCK_W; col++) {
        const lot = days.get(`${col},${row}`)
        const gx = block.bx * (BLOCK_W + ROAD) + col
        const gy = block.by * (BLOCK_H + ROAD) + row
        const seed = hash(`${block.month}:${col}:${row}`)
        const depth = gx + gy
        if (!lot) {
          // 그달의 날이 아닌 칸은 나무숲
          if (seed % 5 < 3) items.push({ depth, draw: () => drawTree(things, gx, gy, season, seed) })
          continue
        }
        if (lot.entry) {
          const entry = lot.entry
          const isNew = entry.date === opt.newDate
          items.push({
            depth,
            draw: () => {
              const H = drawHouse(things, lot, entry, isNew)
              if (isNew) drawBuildFx(fx, lot, H)
            },
          })
        } else if (lot.date === opt.today) {
          items.push({ depth, draw: () => drawTodaySpot(things, gx, gy) })
        } else if (lot.date < opt.today && seed % 3 === 0) {
          items.push({ depth, draw: () => drawFlowers(ground, gx, gy, seed) })
        }
      }
    }
  }
  items.sort((a, b) => a.depth - b.depth)
  for (const it of items) it.draw()
}

/** 구역 하나가 화면에 들어오는 viewBox */
export function blockView(block: Block): { x: number; y: number; w: number; h: number } {
  const x0 = block.bx * (BLOCK_W + ROAD) - ROAD / 2
  const y0 = block.by * (BLOCK_H + ROAD) - ROAD / 2
  const left = iso(x0, y0 + BLOCK_H + ROAD).x
  const right = iso(x0 + BLOCK_W + ROAD, y0).x
  const top = iso(x0, y0).y - 50
  const bottom = iso(x0 + BLOCK_W + ROAD, y0 + BLOCK_H + ROAD).y + SLAB_DEPTH
  const pad = 14
  return { x: left - pad, y: top - pad, w: right - left + pad * 2, h: bottom - top + pad * 2 }
}
