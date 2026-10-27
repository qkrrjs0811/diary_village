// 마을 그림: 기록에서 계산한 마을(src/core/village)을 아이소메트릭 SVG로 그린다.
// 그림은 모두 코드로 그린 도형이다. 둥글고 따뜻한 파스텔, 얇은 갈색 테두리.
import { BLOCK_H, BLOCK_W, ROAD, hash, houseLook, type Block, type Lot, type Village } from '../core/village'
import type { Entry } from '../core/types'

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

/** 집 한 채. 기분 색 지붕, 날짜로 정한 층·지붕 모양·굴뚝 */
function drawHouse(g: Element, lot: Lot, entry: Entry, isNew: boolean) {
  const look = houseLook(entry)
  const house = el('g', { class: isNew ? 'house pop' : 'house', 'data-testid': `house-${entry.date}`, 'data-date': entry.date }, g)
  const { gx, gy } = lot
  const u0 = 0.2
  const u1 = 0.8
  const H = FLOOR_H * look.floors
  const P = (u: number, v: number, h = 0) => iso(gx + u, gy + v, h)
  // 누르기 쉬운 넓은 투명 영역
  poly(house, [P(0, 0, H + 26), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0)], 'transparent', { stroke: 'none', class: 'hit' })
  el('ellipse', { cx: P(0.5, 0.5).x, cy: P(0.5, 0.5).y + 3, rx: 17, ry: 7, fill: 'rgba(90,70,54,0.14)' }, house)

  const wallL = shade(look.wall, -0.1)
  const wallR = look.wall
  // 왼쪽 앞면(v = u1 쪽), 오른쪽 앞면(u = u1 쪽)
  poly(house, [P(u0, u1), P(u1, u1), P(u1, u1, H), P(u0, u1, H)], wallL)
  poly(house, [P(u1, u1), P(u1, u0), P(u1, u0, H), P(u1, u1, H)], wallR)

  // 문(왼쪽 앞면 가운데)
  const doorW = 0.16
  const dm = (u0 + u1) / 2
  poly(house, [P(dm - doorW / 2, u1), P(dm + doorW / 2, u1), P(dm + doorW / 2, u1, 11), P(dm - doorW / 2, u1, 11)], '#b07f5a')
  // 창문(오른쪽 앞면), 층마다 하나. 따뜻한 불빛
  for (let f = 0; f < look.floors; f++) {
    const h0 = f * FLOOR_H + 6
    const vm = (u0 + u1) / 2
    poly(house, [P(u1, vm + 0.09, h0), P(u1, vm - 0.09, h0), P(u1, vm - 0.09, h0 + 7), P(u1, vm + 0.09, h0 + 7)], '#ffe7a3')
    if (f > 0) poly(house, [P(dm - 0.08, u1, h0), P(dm + 0.08, u1, h0), P(dm + 0.08, u1, h0 + 7), P(dm - 0.08, u1, h0 + 7)], '#ffe7a3')
  }

  const roof = look.roof
  const roofDark = shade(roof, -0.15)
  const o = 0.06 // 처마
  if (look.chimney && look.roofStyle !== 'flat') {
    const cu = 0.34
    const cv = 0.36
    poly(house, [P(cu, cv + 0.1, H), P(cu + 0.1, cv + 0.1, H), P(cu + 0.1, cv + 0.1, H + 20), P(cu, cv + 0.1, H + 20)], '#c98f72')
    poly(house, [P(cu + 0.1, cv + 0.1, H), P(cu + 0.1, cv, H), P(cu + 0.1, cv, H + 20), P(cu + 0.1, cv + 0.1, H + 20)], '#d9a487')
    poly(house, [P(cu, cv, H + 20), P(cu + 0.1, cv, H + 20), P(cu + 0.1, cv + 0.1, H + 20), P(cu, cv + 0.1, H + 20)], '#e3b49a')
  }
  if (look.roofStyle === 'gable') {
    // 용마루가 u 방향. 뒤 경사 → 오른쪽 박공 → 앞 경사 순서로 그린다
    const R = 13
    const vm = (u0 + u1) / 2
    poly(house, [P(u0 - o, u0 - o, H), P(u1 + o, u0 - o, H), P(u1 + o, vm, H + R), P(u0 - o, vm, H + R)], roofDark)
    poly(house, [P(u1, u1, H), P(u1, u0, H), P(u1, vm, H + R)], wallR)
    poly(house, [P(u0 - o, u1 + o, H), P(u1 + o, u1 + o, H), P(u1 + o, vm, H + R), P(u0 - o, vm, H + R)], roof)
  } else if (look.roofStyle === 'hip') {
    const R = 15
    const apex = P(0.5, 0.5, H + R)
    const a = P(u0 - o, u0 - o, H)
    const b = P(u1 + o, u0 - o, H)
    const c = P(u1 + o, u1 + o, H)
    const d = P(u0 - o, u1 + o, H)
    poly(house, [a, b, apex], roofDark)
    poly(house, [d, a, apex], roofDark)
    poly(house, [b, c, apex], shade(roof, 0.12))
    poly(house, [c, d, apex], roof)
  } else {
    // 평평한 지붕: 테두리 단 + 옥상 화분
    poly(house, [P(u0 - o, u1 + o, H), P(u1 + o, u1 + o, H), P(u1 + o, u1 + o, H + 4), P(u0 - o, u1 + o, H + 4)], roofDark)
    poly(house, [P(u1 + o, u1 + o, H), P(u1 + o, u0 - o, H), P(u1 + o, u0 - o, H + 4), P(u1 + o, u1 + o, H + 4)], roof)
    poly(house, [P(u0 - o, u0 - o, H + 4), P(u1 + o, u0 - o, H + 4), P(u1 + o, u1 + o, H + 4), P(u0 - o, u1 + o, H + 4)], shade(roof, 0.25))
    const pot = P(0.42, 0.42, H + 4)
    el('circle', { cx: pot.x, cy: pot.y - 5, r: 4.5, fill: '#8fd18a', stroke: LINE }, house)
  }
  if (isNew) {
    const c = P(0.5, 0.5, H + 24)
    const s = el('text', { x: c.x, y: c.y, 'text-anchor': 'middle', 'font-size': 16, class: 'sparkle' }, house)
    s.textContent = '✨'
  }
}

export interface DrawOptions {
  today: string
  /** 방금 지은 집(짓는 연출) */
  newDate?: string
}

/** 마을 전체를 그린다. 뒤(위)에 있는 것부터 앞(아래)으로 */
export function drawVillage(svg: SVGSVGElement, village: Village, opt: DrawOptions) {
  svg.replaceChildren()
  const ground = el('g', { class: 'ground' }, svg)
  const things = el('g', { class: 'things' }, svg)
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
          items.push({ depth, draw: () => drawHouse(things, lot, entry, entry.date === opt.newDate) })
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
