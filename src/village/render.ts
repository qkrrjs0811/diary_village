// 마을 그림: 기록에서 계산한 마을(src/core/village)을 아이소메트릭 SVG로 그린다.
// 그림은 모두 코드로 그린 도형이다. 둥글고 따뜻한 파스텔, 얇은 갈색 테두리.
import { BLOCK_H, BLOCK_W, ROAD, hash, houseLook, type Block, type HouseLook, type Lot, type Village, type WindowShape } from '../core/village'
import type { Entry, PlacedDecor } from '../core/types'
import type { DecorId } from '../core/decor'
import type { DecorSpot } from '../core/placing'
import { buildingInfo, buildingOf } from '../core/building'
import { PLAZA, landmarkSpot, type Landmark } from '../core/landmark'
import type { Walk } from '../core/resident'
import type { FestivalId } from '../core/festival'
import { PLAZA_TREES, blockScenery } from '../core/scenery'
import { seasonOf, smokePuff, type Season } from '../core/season'

const NS = 'http://www.w3.org/2000/svg'
/** 칸 하나의 화면 크기 */
export const TW = 48
export const TH = 24
const FLOOR_H = 17
const SLAB_DEPTH = 12
/** 구역 이름표 팻말판 아래 끝이 땅에서 뜬 높이(뒤쪽 모서리 옆 집 지붕보다 높게) */
const SIGN_LIFT = 62
const LINE = 'rgba(90, 70, 54, 0.35)'
/** 낮의 창문(맑은 유리). 저녁·밤에는 CSS가 .win에 불을 켠다 */
const WIN = '#dcecee'
const win = { class: 'win' }

type Pt = { x: number; y: number }

/** 땅 좌표(칸) + 높이(px) → 화면 좌표 */
export function iso(gx: number, gy: number, h = 0): Pt {
  return { x: ((gx - gy) * TW) / 2, y: ((gx + gy) * TH) / 2 - h }
}

/** 화면 좌표(높이 0) → 그 자리의 땅 칸 */
export function cellAt(p: Pt): { gx: number; gy: number } {
  const u = p.x / (TW / 2)
  const v = p.y / (TH / 2)
  return { gx: Math.floor((u + v) / 2), gy: Math.floor((v - u) / 2) }
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

const GRASS: Record<Season, string> = { spring: '#c4e6a5', summer: '#a9d98c', autumn: '#d8d58f', winter: '#e6eef0' }
const LEAVES: Record<Season, string[]> = {
  spring: ['#ffc2d4', '#b8e0a0', '#ffd6e2'],
  summer: ['#7cc47f', '#93d18a', '#6bb879'],
  autumn: ['#f2a65a', '#f5c45e', '#e88f5a'],
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
  poly(g, top, PATH, { 'data-testid': `slab-${block.month}` })
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
  // 구역 이름표: 뒤쪽 모서리에 선 긴 팻말 "10월". 팻말판은 가장 높은 지붕(등대)보다 위에 떠서
  // 집이 빽빽해도 지붕을 가리지 않고, 기둥은 땅과 함께 그려 집 뒤로 숨는다
  const foot = iso(x0, y0)
  const signTop = foot.y - SIGN_LIFT
  el('rect', { x: foot.x - 1.5, y: signTop, width: 3, height: SIGN_LIFT, rx: 1.5, fill: '#a7805e', stroke: LINE, 'stroke-width': 0.6 }, g)
  el('ellipse', { cx: foot.x, cy: foot.y, rx: 4, ry: 2, fill: 'rgba(90,70,54,0.18)' }, g)
  const m = Number(block.month.slice(5, 7))
  const sign = el('g', { class: 'month-sign', 'data-testid': `month-${block.month}` }, labels)
  el('rect', { x: foot.x - 20, y: signTop - 18, width: 40, height: 18, rx: 9, fill: '#fffaf0', stroke: LINE }, sign)
  const t = el('text', { x: foot.x, y: signTop - 5, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#7a604a' }, sign)
  t.textContent = `${m}월`
}

function drawTree(g: Element, gx: number, gy: number, season: Season, seed: number) {
  const c = iso(gx + 0.5, gy + 0.5)
  const leaves = LEAVES[season]
  const size = 9 + (seed % 4)
  // 꾸미기 중 나무를 누르면 그 나무가 선 칸에 소품을 놓는다
  const tree = el('g', { class: 'tree', 'data-cell': `${gx},${gy}` }, g)
  el('ellipse', { cx: c.x, cy: c.y + 2, rx: 9, ry: 4, fill: 'rgba(90,70,54,0.12)' }, tree)
  el('rect', { x: c.x - 2, y: c.y - 10, width: 4, height: 12, rx: 2, fill: '#a7805e' }, tree)
  const color = leaves[seed % leaves.length]
  el('circle', { cx: c.x, cy: c.y - 14 - size / 2, r: size, fill: color, stroke: LINE }, tree)
  el('circle', { cx: c.x - size * 0.35, cy: c.y - 18 - size / 2, r: size * 0.4, fill: shade(color, 0.3) }, tree)
  if (season === 'winter') el('ellipse', { cx: c.x, cy: c.y - 16 - size, rx: size * 0.7, ry: size * 0.35, fill: '#ffffff' }, tree)
}

/** 작은 꽃과 풀 포기(빈 날, 집 바로 앞 칸) */
function drawFlowers(parent: Element, gx: number, gy: number, seed: number) {
  const g = el('g', { class: 'meadow', 'data-cell': `${gx},${gy}` }, parent)
  for (const [u, v] of [[0.3, 0.7], [0.68, 0.38]]) {
    const p = iso(gx + u, gy + v)
    el('path', { d: `M${p.x - 3},${p.y} q1,-4 2,-5 M${p.x},${p.y} v-6 M${p.x + 3},${p.y} q-1,-4 -2,-5`, stroke: '#7fb36b', 'stroke-width': 1.2, 'stroke-linecap': 'round', fill: 'none' }, g)
  }
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

/** 문(왼쪽 앞면 가운데)과 층마다 창문(저녁·밤엔 불이 켜진다) */
function drawDoorWindows(house: Element, P: Place, a: number, b: number, floors: number) {
  const m = (a + b) / 2
  const doorW = 0.16
  poly(house, [P(m - doorW / 2, b), P(m + doorW / 2, b), P(m + doorW / 2, b, 11), P(m - doorW / 2, b, 11)], '#b07f5a')
  for (let f = 0; f < floors; f++) {
    const h0 = f * FLOOR_H + 6
    poly(house, [P(b, m + 0.09, h0), P(b, m - 0.09, h0), P(b, m - 0.09, h0 + 7), P(b, m + 0.09, h0 + 7)], WIN, win)
    if (f > 0) poly(house, [P(m - 0.08, b, h0), P(m + 0.08, b, h0), P(m + 0.08, b, h0 + 7), P(m - 0.08, b, h0 + 7)], WIN, win)
  }
}

/** 벽 면 위 창 모양. F(t, h): 면을 따라 t(칸), 높이 h(px) → 화면 좌표 */
function windowShape(F: (t: number, h: number) => Pt, c: number, hw: number, h0: number, h1: number, shape: WindowShape): Pt[] {
  if (shape === 'square') return [F(c - hw, h0), F(c + hw, h0), F(c + hw, h1), F(c - hw, h1)]
  const list: Pt[] = []
  if (shape === 'round') {
    const hm = (h0 + h1) / 2
    const r = (h1 - h0) / 2
    for (let i = 0; i < 14; i++) {
      const t = (i / 14) * Math.PI * 2
      list.push(F(c + Math.cos(t) * hw, hm + Math.sin(t) * r))
    }
    return list
  }
  // 반달: 아래는 네모, 위는 둥근 머리
  const r = hw * 26
  list.push(F(c - hw, h0), F(c + hw, h0))
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8) * Math.PI
    list.push(F(c + Math.cos(t) * hw, h1 - r + Math.sin(t) * r))
  }
  return list
}

/** 보통 집의 문과 창(문 색·창 모양이 집마다 다르다). 오른쪽 앞면은 v가 줄수록 화면 오른쪽 */
function drawHouseFront(house: Element, P: Place, a: number, b: number, floors: number, look: HouseLook) {
  const m = (a + b) / 2
  const doorW = 0.16
  const door = el('path', {
    d: (() => {
      const l0 = P(m - doorW / 2, b)
      const r0 = P(m + doorW / 2, b)
      const l1 = P(m - doorW / 2, b, 9)
      const r1 = P(m + doorW / 2, b, 9)
      const top = P(m, b, 12)
      return `M${l0.x} ${l0.y} L${l1.x} ${l1.y} Q${top.x} ${top.y - 2.5} ${r1.x} ${r1.y} L${r0.x} ${r0.y} Z`
    })(),
    fill: look.door,
    stroke: LINE,
    'stroke-linejoin': 'round',
    class: 'house-door',
  }, house)
  door.setAttribute('data-color', look.door)
  const knob = P(m + 0.045, b, 5)
  el('circle', { cx: knob.x, cy: knob.y, r: 0.9, fill: '#fff4d8' }, house)
  const right = (t: number, h: number) => P(b, t, h)
  const left = (t: number, h: number) => P(t, b, h)
  const extra = { ...win, 'data-shape': look.window, 'stroke-linejoin': 'round' }
  for (let f = 0; f < floors; f++) {
    const h0 = f * FLOOR_H + 5
    poly(house, windowShape(right, m, 0.1, h0, h0 + 8.5, look.window), WIN, extra)
    if (f > 0) poly(house, windowShape(left, m, 0.09, h0, h0 + 8, look.window), WIN, extra)
  }
  if (look.flowerBox) {
    // 1층 창 아래 꽃상자(벽에서 살짝 나와 있다)
    const u = b + 0.03
    const box = el('g', { class: 'flower-box' }, house)
    poly(box, [P(u, m + 0.13, 2), P(u, m - 0.13, 2), P(u, m - 0.13, 4.5), P(u, m + 0.13, 4.5)], '#d9906b', { 'stroke-width': 0.7 })
    const petals = ['#ff8fa3', '#ffc15e', '#c4a3d8']
    for (let i = 0; i < 3; i++) {
      const p = P(u, m + 0.09 - i * 0.09, 6.2)
      el('circle', { cx: p.x, cy: p.y, r: 1.7, fill: petals[(i + look.door.length) % 3], stroke: LINE, 'stroke-width': 0.5 }, box)
    }
  }
  if (look.porch === 'lamp') {
    const at = P(m + doorW / 2 + 0.07, b + 0.02, 10)
    const lamp = el('g', { class: 'porch-lamp' }, house)
    el('path', { d: `M${at.x} ${at.y - 3} q-2 -1 -2 -3`, fill: 'none', stroke: '#8a6a50', 'stroke-width': 0.8 }, lamp)
    el('rect', { x: at.x - 1.6, y: at.y - 3, width: 3.2, height: 3.6, rx: 1.2, fill: WIN, stroke: '#8a6a50', 'stroke-width': 0.6, ...win }, lamp)
  } else if (look.porch === 'step') {
    // 문 앞 둥근 돌 발판
    const c = P(m, b + 0.08)
    const step = el('g', { class: 'porch-step' }, house)
    el('ellipse', { cx: c.x, cy: c.y + 1, rx: 6, ry: 2.6, fill: '#d8cbb8', stroke: LINE, 'stroke-width': 0.7 }, step)
    el('ellipse', { cx: c.x, cy: c.y, rx: 6, ry: 2.6, fill: '#ede3d3', stroke: LINE, 'stroke-width': 0.7 }, step)
  }
}

/** 지붕 위 작은 것: 풍향계 또는 앉아 쉬는 새 */
function drawRoofTop(house: Element, at: Pt, what: HouseLook['roofTop'], color: string) {
  if (what === 'vane') {
    const g = el('g', { class: 'roof-vane' }, house)
    el('line', { x1: at.x, y1: at.y, x2: at.x, y2: at.y - 11, stroke: '#8a6a50', 'stroke-width': 1, 'stroke-linecap': 'round' }, g)
    el('path', { d: `M${at.x - 5} ${at.y - 8} h10 M${at.x + 5} ${at.y - 9.5} l2 1.5 l-2 1.5`, fill: 'none', stroke: '#8a6a50', 'stroke-width': 0.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g)
    el('path', { d: `M${at.x - 3} ${at.y - 11} q1 -4 4 -3.5 l1.5 -1 l-0.5 2 q1 2.5 -1 3 z`, fill: '#e9c77a', stroke: '#8a6a50', 'stroke-width': 0.6, 'stroke-linejoin': 'round' }, g)
    el('circle', { cx: at.x, cy: at.y - 11, r: 1, fill: '#8a6a50' }, g)
  } else if (what === 'bird') {
    const g = el('g', { class: 'roof-bird' }, house)
    el('ellipse', { cx: at.x, cy: at.y - 2.6, rx: 3.2, ry: 2.5, fill: shade(color, 0.45), stroke: LINE, 'stroke-width': 0.6 }, g)
    el('circle', { cx: at.x + 2.6, cy: at.y - 5, r: 1.8, fill: shade(color, 0.45), stroke: LINE, 'stroke-width': 0.6 }, g)
    el('path', { d: `M${at.x + 4.3} ${at.y - 5.2} l1.6 0.5 l-1.6 0.5 z`, fill: '#ffb36b' }, g)
    el('circle', { cx: at.x + 3, cy: at.y - 5.4, r: 0.4, fill: '#5a4636' }, g)
    el('path', { d: `M${at.x - 3} ${at.y - 2.5} l-2 -1.4`, stroke: LINE, 'stroke-width': 1, 'stroke-linecap': 'round' }, g)
  }
}

function drawChimney(house: Element, P: Place, H: number) {
  const cu = 0.34
  const cv = 0.36
  poly(house, [P(cu, cv + 0.1, H), P(cu + 0.1, cv + 0.1, H), P(cu + 0.1, cv + 0.1, H + 20), P(cu, cv + 0.1, H + 20)], '#c98f72')
  poly(house, [P(cu + 0.1, cv + 0.1, H), P(cu + 0.1, cv, H), P(cu + 0.1, cv, H + 20), P(cu + 0.1, cv + 0.1, H + 20)], '#d9a487')
  poly(house, [P(cu, cv, H + 20), P(cu + 0.1, cv, H + 20), P(cu + 0.1, cv + 0.1, H + 20), P(cu, cv + 0.1, H + 20)], '#e3b49a')
}

/**
 * 굴뚝 연기: 둥근 연기 줌이 천천히 피어올라 옅어진다. 늘 그려 두고 쌀쌀한 저녁·밤(`.scene.smoky`)에만 보인다.
 * 가락은 집이 선 날짜로 정해 이웃한 집끼리 박자가 어긋난다
 */
function drawSmoke(layer: Element, P: Place, H: number, date: string) {
  const top = P(0.39, 0.41, H + 20)
  const { delay, lean, count } = smokePuff(date)
  const g = el('g', { class: 'smoke', 'data-date': date, style: `--d:${delay};--lean:${lean}` }, layer)
  for (let i = 0; i < count; i++) el('circle', { cx: top.x, cy: top.y - 3, r: 2.4 + i * 0.4, class: 'puff', style: `--i:${i}` }, g)
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

/** 공원: 둥근 잔디밭, 굽은 산책길, 작은 연못, 동그란 나무 둘과 벤치 */
function drawPark(house: Element, P: Place, seed: number): number {
  poly(house, [P(0.06, 0.06), P(0.94, 0.06), P(0.94, 0.94), P(0.06, 0.94)], '#b5e09c', { rx: 4 })
  poly(house, [P(0.06, 0.94), P(0.94, 0.94), P(0.94, 0.94, -3), P(0.06, 0.94, -3)], '#9cc988')
  poly(house, [P(0.94, 0.94), P(0.94, 0.06), P(0.94, 0.06, -3), P(0.94, 0.94, -3)], '#a8d491')
  // 연못(뒤쪽)
  const pond = P(0.3, 0.3)
  el('ellipse', { cx: pond.x, cy: pond.y, rx: 9, ry: 4.5, fill: '#a9daf0', stroke: LINE, 'stroke-width': 0.8, class: 'park-pond' }, house)
  el('path', { d: `M${pond.x - 4} ${pond.y - 1} q3 -1.5 6 0`, fill: 'none', stroke: '#ffffff', 'stroke-width': 1, 'stroke-linecap': 'round' }, house)
  // 굽은 산책길(왼쪽 앞 → 오른쪽 뒤)
  const s = P(0.12, 0.88)
  const q = P(0.62, 0.62)
  const e = P(0.88, 0.14)
  el('path', { d: `M${s.x} ${s.y} Q${q.x} ${q.y} ${e.x} ${e.y}`, fill: 'none', stroke: '#f4e8d4', 'stroke-width': 5, 'stroke-linecap': 'round' }, house)
  const greens = ['#8fcf7e', '#a3d98a', '#7fc490']
  const tree = (p: Pt, r: number, color: string) => {
    el('ellipse', { cx: p.x, cy: p.y + 1, rx: r * 0.8, ry: r * 0.35, fill: 'rgba(90,70,54,0.14)' }, house)
    el('rect', { x: p.x - 1.5, y: p.y - 9, width: 3, height: 10, rx: 1.5, fill: '#a7805e' }, house)
    el('circle', { cx: p.x, cy: p.y - 10 - r / 2, r, fill: color, stroke: LINE, class: 'park-tree' }, house)
    el('circle', { cx: p.x - r * 0.35, cy: p.y - 13 - r / 2, r: r * 0.4, fill: shade(color, 0.3) }, house)
  }
  tree(P(0.7, 0.24), 8, greens[seed % 3])
  // 벤치(길가)
  const b = P(0.36, 0.56)
  el('rect', { x: b.x - 7, y: b.y - 6, width: 14, height: 2.4, rx: 1, fill: '#c9a27e', stroke: LINE, 'stroke-width': 0.7, class: 'park-bench' }, house)
  el('rect', { x: b.x - 7, y: b.y - 10, width: 14, height: 2.2, rx: 1, fill: '#d9b48e', stroke: LINE, 'stroke-width': 0.7 }, house)
  el('path', { d: `M${b.x - 5.5} ${b.y - 3.6} v3 M${b.x + 5.5} ${b.y - 3.6} v3`, stroke: '#8a6a50', 'stroke-width': 1.2, 'stroke-linecap': 'round' }, house)
  // 길가 꽃
  ;[P(0.55, 0.88), P(0.62, 0.86), P(0.86, 0.5)].forEach((p, i) => {
    el('circle', { cx: p.x, cy: p.y - 1, r: 1.8, fill: ['#ff9fb2', '#ffd36e', '#ffffff'][(i + seed) % 3], stroke: LINE, 'stroke-width': 0.4 }, house)
  })
  tree(P(0.8, 0.76), 9, greens[(seed + 1) % 3])
  return 24
}

/** 식당 꾸밈: 문 위 짧은 천 가림막, 처마 등, 가게 앞 김 나는 밥그릇 */
function drawRestaurantBits(house: Element, P: Place, a: number, b: number, roof: string) {
  const m = (a + b) / 2
  const cloth = '#7fa6d6'
  const n = 3
  const u0 = m - 0.14
  const u1 = m + 0.14
  for (let i = 0; i < n; i++) {
    const x0 = u0 + ((u1 - u0) * i) / n + 0.006
    const x1 = u0 + ((u1 - u0) * (i + 1)) / n - 0.006
    poly(house, [P(x0, b + 0.01, 15), P(x1, b + 0.01, 15), P(x1, b + 0.01, 9.5), P(x0, b + 0.01, 9.5)], cloth, { 'stroke-width': 0.6, class: 'restaurant-cloth' })
  }
  const dot = P(m, b + 0.01, 12.5)
  el('circle', { cx: dot.x, cy: dot.y, r: 1.3, fill: '#fffaf0' }, house)
  // 처마 등(문 왼쪽)
  const top = P(a + 0.08, b, 17)
  const lamp = P(a + 0.08, b + 0.03, 13)
  el('line', { x1: top.x, y1: top.y, x2: lamp.x, y2: lamp.y - 3, stroke: '#a7805e', 'stroke-width': 0.8 }, house)
  el('ellipse', { cx: lamp.x, cy: lamp.y, rx: 2.6, ry: 3.4, fill: shade(roof, 0.1), stroke: LINE, 'stroke-width': 0.7 }, house)
  el('ellipse', { cx: lamp.x, cy: lamp.y, rx: 1.1, ry: 2.4, fill: '#ffe7a3', class: 'lantern-glow' }, house)
  // 가게 앞 작은 상 위 밥그릇과 김
  const t = P(0.2, 0.97)
  el('rect', { x: t.x - 0.8, y: t.y - 6, width: 1.6, height: 6, fill: '#a7805e' }, house)
  el('ellipse', { cx: t.x, cy: t.y - 6, rx: 6, ry: 2.6, fill: '#c9a27e', stroke: LINE }, house)
  el('path', { d: `M${t.x - 3.6} ${t.y - 8} a3.6 3 0 0 0 7.2 0 z`, fill: '#fffaf0', stroke: LINE, 'stroke-width': 0.7 }, house)
  el('ellipse', { cx: t.x, cy: t.y - 8, rx: 3.2, ry: 1.2, fill: '#ffffff', stroke: LINE, 'stroke-width': 0.5 }, house)
  el('path', { d: `M${t.x - 1.5} ${t.y - 10} q-1.5 -2 0 -4 M${t.x + 1.5} ${t.y - 10} q1.5 -2 0 -4`, fill: 'none', stroke: '#ffffff', 'stroke-width': 1, 'stroke-linecap': 'round', class: 'steam' }, house)
}

/** 학교 꾸밈: 박공 벽의 둥근 시계, 용마루 위 종탑, 옆마당 깃대. 돌려주는 값은 종탑 꼭대기 높이 */
function drawSchoolBits(house: Element, P: Place, a: number, b: number, H: number, top: number, roof: string): number {
  const m = (a + b) / 2
  const R = top - H
  // 오른쪽 박공 벽 시계
  const c = P(b, m, H + R * 0.38)
  el('circle', { cx: c.x, cy: c.y, r: 3.6, fill: '#fffaf0', stroke: LINE, 'stroke-width': 0.8, class: 'school-clock' }, house)
  el('path', { d: `M${c.x} ${c.y} v-2.4 M${c.x} ${c.y} h1.8`, stroke: '#7a604a', 'stroke-width': 0.8, 'stroke-linecap': 'round' }, house)
  // 용마루 가운데 종탑
  const r = P(m, m, top)
  el('rect', { x: r.x - 4, y: r.y - 9, width: 8, height: 9, fill: '#fffaf0', stroke: LINE, 'stroke-width': 0.8 }, house)
  el('path', { d: `M${r.x - 2} ${r.y - 2.5} v-2.5 a2 2 0 0 1 4 0 v2.5 z`, fill: '#ffd36b', stroke: LINE, 'stroke-width': 0.6 }, house)
  poly(house, [{ x: r.x - 6, y: r.y - 9 }, { x: r.x + 6, y: r.y - 9 }, { x: r.x, y: r.y - 16 }], shade(roof, -0.1))
  // 옆마당 깃대
  const f = P(0.95, 0.3)
  el('rect', { x: f.x - 0.7, y: f.y - 24, width: 1.4, height: 24, fill: '#a7805e' }, house)
  el('circle', { cx: f.x, cy: f.y - 24.5, r: 1.2, fill: '#ffd36b', stroke: LINE, 'stroke-width': 0.5 }, house)
  el('path', { d: `M${f.x + 0.7} ${f.y - 23} l9 2.8 l-9 2.8 z`, fill: roof, stroke: LINE }, house)
  return top + 16
}

/** 텃밭: 낮은 흙밭에 고랑 세 줄과 새싹, 뒤쪽 토마토 지지대 둘, 기분 색 모자의 허수아비, 물뿌리개 */
function drawFarm(house: Element, P: Place, hat: string, seed: number): number {
  poly(house, [P(0.08, 0.08), P(0.92, 0.08), P(0.92, 0.92), P(0.08, 0.92)], '#d9b48e', { rx: 4 })
  poly(house, [P(0.08, 0.92), P(0.92, 0.92), P(0.92, 0.92, -3), P(0.08, 0.92, -3)], '#c49c76')
  poly(house, [P(0.92, 0.92), P(0.92, 0.08), P(0.92, 0.08, -3), P(0.92, 0.92, -3)], '#cfa682')
  // 토마토 지지대(뒤쪽)
  for (const u of [0.3, 0.62]) {
    const p = P(u, 0.2)
    el('rect', { x: p.x - 0.7, y: p.y - 18, width: 1.4, height: 18, fill: '#a7805e' }, house)
    el('ellipse', { cx: p.x, cy: p.y - 10, rx: 4.5, ry: 5.5, fill: '#8fcf7e', stroke: LINE, 'stroke-width': 0.7 }, house)
    ;[[-2, -12], [1.8, -9], [-0.6, -7]].forEach(([dx, dy]) => {
      el('circle', { cx: p.x + dx, cy: p.y + dy, r: 1.5, fill: '#f28b7a', stroke: LINE, 'stroke-width': 0.4, class: 'farm-tomato' }, house)
    })
  }
  // 고랑 세 줄과 새싹
  const greens = ['#8fcf7e', '#a3d98a', '#7fc490']
  for (const v of [0.42, 0.6, 0.78]) {
    const r0 = P(0.16, v)
    const r1 = P(0.84, v)
    el('line', { x1: r0.x, y1: r0.y, x2: r1.x, y2: r1.y, stroke: '#b58a63', 'stroke-width': 2.6, 'stroke-linecap': 'round', class: 'farm-row' }, house)
    for (const u of [0.24, 0.42, 0.6, 0.78]) {
      const s = P(u, v)
      const c = greens[(seed + Math.round(u * 10)) % 3]
      el('path', { d: `M${s.x} ${s.y} q-3.4 -2 -3 -5 q2.6 0.6 3 5 z M${s.x} ${s.y} q3.4 -2 3 -5 q-2.6 0.6 -3 5 z`, fill: c, stroke: LINE, 'stroke-width': 0.5, class: 'farm-sprout' }, house)
    }
  }
  // 물뿌리개(앞)
  const w = P(0.3, 0.95)
  el('rect', { x: w.x - 3, y: w.y - 5, width: 6, height: 5, rx: 1.2, fill: '#8fb8e8', stroke: LINE, 'stroke-width': 0.6 }, house)
  el('path', { d: `M${w.x + 3} ${w.y - 3} l4 -3`, stroke: '#8fb8e8', 'stroke-width': 1.4, 'stroke-linecap': 'round' }, house)
  // 허수아비(오른쪽 앞)
  const k = P(0.84, 0.86)
  el('ellipse', { cx: k.x, cy: k.y + 1, rx: 5, ry: 2, fill: 'rgba(90,70,54,0.14)' }, house)
  el('rect', { x: k.x - 0.8, y: k.y - 22, width: 1.6, height: 22, fill: '#a7805e' }, house)
  el('rect', { x: k.x - 8, y: k.y - 17, width: 16, height: 1.6, rx: 0.8, fill: '#a7805e' }, house)
  el('path', { d: `M${k.x - 4.5} ${k.y - 17} h9 l-1.5 8 h-6 z`, fill: '#f2c46b', stroke: LINE, 'stroke-width': 0.7, 'stroke-linejoin': 'round' }, house)
  el('circle', { cx: k.x, cy: k.y - 21, r: 3.4, fill: '#fff1d6', stroke: LINE, 'stroke-width': 0.7, class: 'farm-scarecrow' }, house)
  el('ellipse', { cx: k.x, cy: k.y - 23.5, rx: 6, ry: 1.6, fill: '#e8c98a', stroke: LINE, 'stroke-width': 0.6 }, house)
  el('path', { d: `M${k.x - 3} ${k.y - 24} a3 2.6 0 0 1 6 0 z`, fill: hat, stroke: LINE, 'stroke-width': 0.6 }, house)
  return 26
}

/** 기차역 꾸밈: 문 위 둥근 시계, 오른쪽 옆 철길과 작은 기차 한 칸. 기차는 기분 색 */
function drawStationBits(house: Element, P: Place, a: number, b: number, H: number, car: string) {
  const m = (a + b) / 2
  // 문 위 시계
  const c = P(m, b + 0.01, H - 3.5)
  el('circle', { cx: c.x, cy: c.y, r: 3.4, fill: '#fffaf0', stroke: LINE, 'stroke-width': 0.8, class: 'station-clock' }, house)
  el('path', { d: `M${c.x} ${c.y} v-2.2 M${c.x} ${c.y} h1.6`, stroke: '#7a604a', 'stroke-width': 0.8, 'stroke-linecap': 'round' }, house)
  // 철길(오른쪽 옆, v 방향)
  const tie = '#b58a63'
  for (let i = 0; i < 7; i++) {
    const v = 0.08 + i * 0.14
    const t0 = P(0.86, v)
    const t1 = P(1.0, v)
    el('line', { x1: t0.x, y1: t0.y, x2: t1.x, y2: t1.y, stroke: tie, 'stroke-width': 1.6, 'stroke-linecap': 'round' }, house)
  }
  for (const u of [0.89, 0.97]) {
    const r0 = P(u, 0.04)
    const r1 = P(u, 0.96)
    el('line', { x1: r0.x, y1: r0.y, x2: r1.x, y2: r1.y, stroke: '#9a8a7a', 'stroke-width': 0.9, class: 'station-rail' }, house)
  }
  // 기차 한 칸(철길 뒤쪽, 창문을 가리지 않게)
  const v0 = 0.1
  const v1 = 0.36
  const u = 0.93
  const ch = 11
  poly(house, [P(u, v1), P(u, v0), P(u, v0, ch), P(u, v1, ch)], car, { class: 'station-train' })
  poly(house, [P(u, v1, ch), P(u, v0, ch), P(u, v0, ch + 2.5), P(u, v1, ch + 2.5)], shade(car, -0.18))
  for (const v of [0.17, 0.29]) {
    poly(house, [P(u, v + 0.04, 5), P(u, v - 0.04, 5), P(u, v - 0.04, 9), P(u, v + 0.04, 9)], WIN, { 'stroke-width': 0.5, ...win })
  }
  for (const v of [v0 + 0.05, v1 - 0.05]) {
    const w = P(u, v)
    el('circle', { cx: w.x, cy: w.y - 0.5, r: 1.8, fill: '#7a604a' }, house)
  }
}

/** 미술관 꾸밈: 앞면 하얀 기둥 넷, 오른쪽 벽 액자 둘, 앞마당 이젤 위 그림 */
function drawGalleryBits(house: Element, P: Place, a: number, b: number, H: number, roof: string, seed: number) {
  // 앞 돌계단과 처마 띠, 그 사이 하얀 기둥(문 양옆)
  const f = b + 0.05
  poly(house, [P(a - 0.02, b), P(b + 0.02, b), P(b + 0.02, f + 0.03), P(a - 0.02, f + 0.03)], '#e9dcc6')
  poly(house, [P(a - 0.02, f + 0.03), P(b + 0.02, f + 0.03), P(b + 0.02, f + 0.03, -2), P(a - 0.02, f + 0.03, -2)], '#d9c8ad')
  for (const u of [a + 0.05, a + 0.17, b - 0.17, b - 0.05]) {
    poly(house, [P(u - 0.03, f), P(u + 0.03, f), P(u + 0.03, f, H - 3), P(u - 0.03, f, H - 3)], '#fffdf7', { stroke: '#b9a58c', 'stroke-width': 0.8, class: 'gallery-column' })
    poly(house, [P(u + 0.03, f), P(u + 0.03, f - 0.04), P(u + 0.03, f - 0.04, H - 3), P(u + 0.03, f, H - 3)], '#e6dccb', { stroke: '#b9a58c', 'stroke-width': 0.6 })
  }
  poly(house, [P(a - 0.03, f + 0.01, H - 3), P(b + 0.03, f + 0.01, H - 3), P(b + 0.03, f + 0.01, H + 1), P(a - 0.03, f + 0.01, H + 1)], shade(roof, 0.35), { 'stroke-width': 0.8 })
  // 오른쪽 벽 액자
  const paints = ['#ff9fb2', '#8fb8e8', '#ffd36e', '#9ed39b']
  for (const [i, v] of [0.3, 0.7].entries()) {
    poly(house, [P(b, v + 0.06, 5), P(b, v - 0.06, 5), P(b, v - 0.06, 12), P(b, v + 0.06, 12)], '#e3b878', { 'stroke-width': 0.6, class: 'gallery-frame' })
    poly(house, [P(b, v + 0.04, 6.3), P(b, v - 0.04, 6.3), P(b, v - 0.04, 10.7), P(b, v + 0.04, 10.7)], paints[(seed + i) % paints.length], { stroke: 'none' })
  }
  // 이젤과 그림(앞마당)
  const e = P(0.2, 0.97)
  el('path', { d: `M${e.x - 4} ${e.y} L${e.x} ${e.y - 17} L${e.x + 4} ${e.y} M${e.x} ${e.y - 17} L${e.x + 1} ${e.y - 1}`, fill: 'none', stroke: '#a7805e', 'stroke-width': 1.2, 'stroke-linecap': 'round' }, house)
  el('rect', { x: e.x - 6, y: e.y - 16, width: 12, height: 9, rx: 1, fill: '#fffaf0', stroke: LINE, 'stroke-width': 0.8, class: 'gallery-easel' }, house)
  el('path', { d: `M${e.x - 5} ${e.y - 8.5} q3 -4 5 -1.5 q2 -3 4.5 0.5`, fill: 'none', stroke: '#7bb88f', 'stroke-width': 1.2, 'stroke-linecap': 'round' }, house)
  el('circle', { cx: e.x + 2.6, cy: e.y - 13, r: 1.6, fill: roof }, house)
}

/** 그날 건물(글 단어로 정함) 또는 보통 집. 기분은 지붕 색만 바꾼다. 돌려주는 값은 연출을 띄울 높이 */
function drawHouse(g: Element, lot: Lot, entry: Entry, isNew: boolean, smokes?: Element): number {
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
  if (kind === 'park') return drawPark(house, P, hash(entry.date))
  if (kind === 'farm') return drawFarm(house, P, look.roof, hash(entry.date))
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
      poly(house, [P(b, m + 0.07, 5), P(b, m - 0.07, 5), P(b, m - 0.07, 11), P(b, m + 0.07, 11)], WIN, win)
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
  if (kind) drawDoorWindows(house, P, a, b, look.floors)
  else drawHouseFront(house, P, a, b, look.floors, look)
  const style: RoofStyle =
    kind === 'cafe' || kind === 'flowerShop' || kind === 'bakery' || kind === 'restaurant' || kind === 'school' || kind === 'station'
      ? 'gable'
      : kind === 'bookstore'
        ? 'hip'
        : kind === 'cinema' || kind === 'gallery'
          ? 'flat'
          : kind === 'musicHall'
            ? 'dome'
            : look.roofStyle
  const chimney = (kind === 'bakery' || (!kind && look.chimney)) && style !== 'flat'
  if (chimney) drawChimney(house, P, H)
  const top = drawRoof(house, P, a, b, H, style, look.roof, look.wall, kind !== 'cinema' && kind !== 'gallery')
  if (chimney && smokes) drawSmoke(smokes, P, H, entry.date)
  if (!kind) {
    // 지붕 위 작은 것은 용마루 오른쪽(굴뚝을 피해), 모임지붕은 꼭짓점에 둔다
    const spot = style === 'hip' ? P(0.5, 0.5, top) : style === 'gable' ? P(0.66, 0.5, top) : P(0.64, 0.6, top)
    drawRoofTop(house, spot, look.roofTop, look.roof)
    house.setAttribute('data-touch', [look.window, look.porch, look.roofTop, look.flowerBox ? 'box' : 'nobox'].join(' '))
    return H
  }

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
  } else if (kind === 'restaurant') {
    drawRestaurantBits(house, P, a, b, look.roof)
    drawSign(house, P, b, icon)
  } else if (kind === 'school') {
    drawSign(house, P, b, icon)
    return drawSchoolBits(house, P, a, b, H, top, look.roof)
  } else if (kind === 'station') {
    drawStationBits(house, P, a, b, H, look.roof)
    drawSign(house, P, b, icon)
  } else if (kind === 'gallery') {
    drawGalleryBits(house, P, a, b, H, look.roof, seed)
    drawSign(house, P, b, icon)
  } else {
    // 아직 제 그림이 없는 건물은 보통 집 모양에 간판만 단다
    drawSign(house, P, b, icon)
  }
  return H
}

/** 소중한 날로 표시한 집 마당(왼쪽 앞 모서리)의 작은 하트 깃발. 누르기는 집으로 통과한다 */
function drawTreasureFlag(g: Element, lot: Lot, date: string) {
  const base = iso(lot.gx + 0.08, lot.gy + 0.88)
  const flag = el('g', { class: 'treasure-flag', 'data-testid': `treasure-${date}`, 'data-date': date }, g)
  el('ellipse', { cx: base.x, cy: base.y, rx: 3, ry: 1.4, fill: 'rgba(90,70,54,0.18)' }, flag)
  el('line', { x1: base.x, y1: base.y, x2: base.x, y2: base.y - 24, stroke: '#a7805e', 'stroke-width': 1.3, 'stroke-linecap': 'round' }, flag)
  el('circle', { cx: base.x, cy: base.y - 24.5, r: 1.4, fill: '#ffd36b', stroke: LINE, 'stroke-width': 0.5 }, flag)
  // 깃대 왼쪽에 매단 둥근 하트(바람에 살랑인다)
  const cx = base.x - 5.6
  const cy = base.y - 19.5
  const s = 5.2
  el('path', {
    class: 'heart',
    d: `M${cx} ${cy + s * 0.9} C${cx - s * 1.2} ${cy + s * 0.2} ${cx - s * 0.9} ${cy - s * 0.8} ${cx} ${cy - s * 0.25} C${cx + s * 0.9} ${cy - s * 0.8} ${cx + s * 1.2} ${cy + s * 0.2} ${cx} ${cy + s * 0.9} z`,
    fill: '#ffaebf',
    stroke: '#d98a9a',
    'stroke-width': 0.7,
    'stroke-linejoin': 'round',
  }, flag)
}

/** 광장의 땅: 구역처럼 두툼한 판에 잔디, 가운데로 엇갈리는 돌길, 모서리 나무 */
function drawPlazaGround(g: Element, labels: Element) {
  const { gx: px, gy: py, w, h } = PLAZA
  const x0 = px - ROAD / 2
  const y0 = py - ROAD / 2
  const x1 = x0 + w + ROAD
  const y1 = y0 + h + ROAD
  const top = [iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)]
  const down = (p: Pt) => ({ x: p.x, y: p.y + SLAB_DEPTH })
  const plaza = el('g', { class: 'plaza', 'data-testid': 'plaza' }, g)
  poly(plaza, [top[3], top[2], down(top[2]), down(top[3])], shade(SOIL, -0.12))
  poly(plaza, [top[2], top[1], down(top[1]), down(top[2])], SOIL)
  poly(plaza, top, PATH)
  const i = 0.08
  poly(plaza, [iso(px - i, py - i), iso(px + w + i, py - i), iso(px + w + i, py + h + i), iso(px - i, py + h + i)], '#bfe3a6')
  // 돌길: 가운데 줄(가로·세로)
  const stone = '#f4e8d4'
  const mu = px + w / 2
  const mv = py + h / 2
  poly(plaza, [iso(mu - 0.32, py), iso(mu + 0.32, py), iso(mu + 0.32, py + h), iso(mu - 0.32, py + h)], stone, { stroke: 'none' })
  poly(plaza, [iso(px, mv - 0.32), iso(px + w, mv - 0.32), iso(px + w, mv + 0.32), iso(px, mv + 0.32)], stone, { stroke: 'none' })
  for (let k = 0; k < h * 2; k++) {
    const p = iso(mu + (k % 2 ? 0.12 : -0.14), py + 0.25 + k / 2)
    el('ellipse', { cx: p.x, cy: p.y, rx: 3.2, ry: 1.6, fill: shade(stone, -0.06) }, plaza)
  }
  for (let k = 0; k < w * 2; k++) {
    const p = iso(px + 0.25 + k / 2, mv + (k % 2 ? 0.12 : -0.14))
    el('ellipse', { cx: p.x, cy: p.y, rx: 3.2, ry: 1.6, fill: shade(stone, -0.06) }, plaza)
  }
  // 이름표는 왼쪽 모서리 길 위에(명소·팻말을 가리지 않게)
  const label = iso(x0 + 0.1, y1 - 0.3)
  const sign = el('g', { class: 'month-sign', 'data-testid': 'plaza-sign' }, labels)
  el('rect', { x: label.x - 24, y: label.y - 4, width: 48, height: 18, rx: 9, fill: '#fffaf0', stroke: LINE }, sign)
  const t = el('text', { x: label.x, y: label.y + 9, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#7a604a' }, sign)
  t.textContent = '⛲ 광장'
}

/** 잔치마다 깃발 색 */
const FLAG_COLORS: Record<FestivalId, string[]> = {
  birthday: ['#ff9fb2', '#ffd36e', '#9fd3ec', '#b7e3a1', '#c9a8e0'],
  newYear: ['#f28b82', '#fffaf0', '#ffd36e'],
  pumpkin: ['#f6a35b', '#b99ad6', '#ffd36e'],
  christmas: ['#ef8f86', '#8cc79a', '#fffaf0'],
  // 색동
  seollal: ['#f28b82', '#ffd36e', '#8cc79a', '#9fd3ec', '#c9a8e0'],
  chuseok: ['#ffd36e', '#f6a35b', '#fffaf0', '#c9a8e0'],
}
const POLE_H = 30

/** 광장 뒤쪽 두 변(왼쪽 위·오른쪽 위)에 걸린 깃발 줄. 깊이에 맞게 칸마다 나눠 그린다 */
function festivalBunting(items: { depth: number; draw: () => void }[], g: Element, id: FestivalId) {
  const { gx: px, gy: py, w, h } = PLAZA
  const colors = FLAG_COLORS[id]
  const edges = [
    { len: h, at: (s: number) => iso(px, py + s, 0) },
    { len: w, at: (s: number) => iso(px + s, py, 0) },
  ]
  // 기둥 사이에서 가운데가 살짝 처진다
  const hang = (len: number, s: number) => POLE_H - 10 * 4 * (s / len) * (1 - s / len)
  edges.forEach((edge, e) => {
    for (let k = 0; k < edge.len; k++) {
      const depth = e === 0 ? px + py + k - 0.5 : px + k + py - 0.5
      items.push({
        depth,
        draw: () => {
          const node = el('g', { class: 'bunting' }, g)
          const at = (s: number) => {
            const p = edge.at(s)
            return { x: p.x, y: p.y - hang(edge.len, s) }
          }
          const line = [0, 0.25, 0.5, 0.75, 1].map((t) => at(k + t))
          el('polyline', { points: pts(line), fill: 'none', stroke: '#a7805e', 'stroke-width': 0.8 }, node)
          ;[0.25, 0.75].forEach((t, i) => {
            const p = at(k + t)
            poly(node, [{ x: p.x - 3.4, y: p.y }, { x: p.x + 3.4, y: p.y }, { x: p.x, y: p.y + 7 }], colors[(k * 2 + i + e) % colors.length], { 'stroke-width': 0.6 })
          })
        },
      })
    }
  })
  // 세 모서리의 기둥
  for (const [gx, gy] of [[px, py], [px + w, py], [px, py + h]]) {
    items.push({
      depth: gx + gy - 0.5,
      draw: () => {
        const p = iso(gx, gy)
        const node = el('g', { class: 'bunting' }, g)
        el('rect', { x: p.x - 1.2, y: p.y - POLE_H - 2, width: 2.4, height: POLE_H + 2, rx: 1.2, fill: '#c49a74', stroke: LINE, 'stroke-width': 0.5 }, node)
        el('circle', { cx: p.x, cy: p.y - POLE_H - 3, r: 2.4, fill: colors[0], stroke: LINE, 'stroke-width': 0.5 }, node)
      },
    })
  }
}

function drawBalloons(g: Element, c: Pt, colors: string[]) {
  ;[-7, 0, 7].forEach((dx, i) => {
    const top = { x: c.x + dx * 0.9, y: c.y - 30 - (i === 1 ? 8 : 0) }
    el('path', { d: `M${c.x} ${c.y} Q${c.x + dx * 0.4} ${c.y - 12} ${top.x} ${top.y + 6}`, fill: 'none', stroke: '#a7805e', 'stroke-width': 0.6 }, g)
    el('ellipse', { cx: top.x, cy: top.y, rx: 5, ry: 6, fill: colors[i % colors.length], stroke: LINE, 'stroke-width': 0.6 }, g)
    el('ellipse', { cx: top.x - 1.6, cy: top.y - 2, rx: 1.2, ry: 1.8, fill: 'rgba(255,255,255,0.7)' }, g)
  })
  el('circle', { cx: c.x, cy: c.y, r: 1.6, fill: '#a7805e' }, g)
}

function drawGift(g: Element, c: Pt, color: string, s = 1) {
  const w = 9 * s
  const hh = 7 * s
  el('rect', { x: c.x - w / 2, y: c.y - hh, width: w, height: hh, rx: 1.2, fill: color, stroke: LINE, 'stroke-width': 0.6 }, g)
  el('rect', { x: c.x - 0.9, y: c.y - hh, width: 1.8, height: hh, fill: '#fffaf0' }, g)
  el('path', { d: `M${c.x} ${c.y - hh} q-4 -4 -4 0 z M${c.x} ${c.y - hh} q4 -4 4 0 z`, fill: '#fffaf0', stroke: LINE, 'stroke-width': 0.5 }, g)
}

function drawPumpkin(g: Element, c: Pt, r: number, face: boolean) {
  el('ellipse', { cx: c.x, cy: c.y + 1, rx: r * 1.2, ry: r * 0.4, fill: 'rgba(90,70,54,0.14)' }, g)
  for (const dx of [-0.5, 0.5, 0]) el('ellipse', { cx: c.x + dx * r, cy: c.y - r * 0.8, rx: r * 0.62, ry: r * 0.8, fill: '#f6a35b', stroke: LINE, 'stroke-width': 0.6 }, g)
  el('rect', { x: c.x - 1, y: c.y - r * 1.8, width: 2, height: r * 0.35, rx: 1, fill: '#8cb87a' }, g)
  if (!face) return
  const y = c.y - r * 0.9
  const glow = '#ffe9a3'
  poly(g, [{ x: c.x - r * 0.45, y: y - r * 0.15 }, { x: c.x - r * 0.25, y: y - r * 0.4 }, { x: c.x - r * 0.1, y: y - r * 0.15 }], glow, { stroke: 'none', class: 'lantern-glow' })
  poly(g, [{ x: c.x + r * 0.1, y: y - r * 0.15 }, { x: c.x + r * 0.25, y: y - r * 0.4 }, { x: c.x + r * 0.45, y: y - r * 0.15 }], glow, { stroke: 'none', class: 'lantern-glow' })
  el('path', { d: `M${c.x - r * 0.4} ${y + r * 0.15} q${r * 0.4} ${r * 0.35} ${r * 0.8} 0 z`, fill: glow, class: 'lantern-glow' }, g)
}

/** 잔치마다 광장 가운데 돌길 위에 서는 장식(앞쪽 큰 것, 옆 작은 것) */
const FESTIVAL_ART: Record<FestivalId, { main: (g: Element, c: Pt) => void; side: (g: Element, c: Pt) => void }> = {
  birthday: {
    main: (g, c) => {
      // 둥근 탁자 위 두 단 케이크와 초
      el('ellipse', { cx: c.x, cy: c.y + 1, rx: 15, ry: 5, fill: 'rgba(90,70,54,0.14)' }, g)
      el('rect', { x: c.x - 1.5, y: c.y - 9, width: 3, height: 9, fill: '#c49a74' }, g)
      el('ellipse', { cx: c.x, cy: c.y - 9, rx: 14, ry: 5.5, fill: '#fffaf0', stroke: LINE }, g)
      el('path', { d: `M${c.x - 10} ${c.y - 11} v-7 a10 3.6 0 0 0 20 0 v7 a10 3.6 0 0 1 -20 0 z`, fill: '#ffc9d4', stroke: LINE, 'stroke-width': 0.7 }, g)
      el('ellipse', { cx: c.x, cy: c.y - 18, rx: 10, ry: 3.6, fill: '#fff1f4', stroke: LINE, 'stroke-width': 0.7 }, g)
      el('path', { d: `M${c.x - 6.5} ${c.y - 19} v-6 a6.5 2.4 0 0 0 13 0 v6 a6.5 2.4 0 0 1 -13 0 z`, fill: '#fff1f4', stroke: LINE, 'stroke-width': 0.7 }, g)
      el('ellipse', { cx: c.x, cy: c.y - 25, rx: 6.5, ry: 2.4, fill: '#ffffff', stroke: LINE, 'stroke-width': 0.7 }, g)
      for (const dx of [-3.5, 0, 3.5]) {
        el('rect', { x: c.x + dx - 0.6, y: c.y - 31, width: 1.2, height: 6, fill: '#9fd3ec' }, g)
        el('ellipse', { cx: c.x + dx, cy: c.y - 32.5, rx: 1.2, ry: 1.9, fill: '#ffd36e', class: 'candle' }, g)
      }
      for (const dx of [-7, -3, 1, 5]) el('circle', { cx: c.x + dx + 1, cy: c.y - 15, r: 0.9, fill: '#ff8fa3' }, g)
    },
    side: (g, c) => drawBalloons(g, c, ['#ff9fb2', '#ffd36e', '#9fd3ec']),
  },
  newYear: {
    main: (g, c) => {
      // 복주머니
      el('ellipse', { cx: c.x, cy: c.y + 1, rx: 13, ry: 4.5, fill: 'rgba(90,70,54,0.14)' }, g)
      el('path', { d: `M${c.x - 5} ${c.y - 22} C${c.x - 18} ${c.y - 14} ${c.x - 15} ${c.y} ${c.x} ${c.y} C${c.x + 15} ${c.y} ${c.x + 18} ${c.y - 14} ${c.x + 5} ${c.y - 22} z`, fill: '#f28b82', stroke: LINE }, g)
      el('path', { d: `M${c.x - 5} ${c.y - 22} l-3 -5 q8 2 16 0 l-3 5 z`, fill: '#f6a59e', stroke: LINE, 'stroke-width': 0.7 }, g)
      el('rect', { x: c.x - 6, y: c.y - 23.5, width: 12, height: 2.6, rx: 1.3, fill: '#ffd36e', stroke: LINE, 'stroke-width': 0.5 }, g)
      el('circle', { cx: c.x, cy: c.y - 10, r: 5, fill: '#ffd36e', stroke: LINE, 'stroke-width': 0.6 }, g)
      const t = el('text', { x: c.x, y: c.y - 7.6, 'text-anchor': 'middle', 'font-size': 6.5, 'font-weight': 700, fill: '#c0574e' }, g)
      t.textContent = '福'
    },
    side: (g, c) => drawBalloons(g, c, ['#f28b82', '#ffd36e', '#fffaf0']),
  },
  pumpkin: {
    main: (g, c) => drawPumpkin(g, c, 11, true),
    side: (g, c) => {
      drawPumpkin(g, { x: c.x - 6, y: c.y }, 5.5, true)
      drawPumpkin(g, { x: c.x + 6, y: c.y + 2 }, 4.5, false)
    },
  },
  christmas: {
    main: (g, c) => {
      el('ellipse', { cx: c.x, cy: c.y + 1, rx: 14, ry: 5, fill: 'rgba(90,70,54,0.14)' }, g)
      el('rect', { x: c.x - 2, y: c.y - 6, width: 4, height: 6, fill: '#a7805e' }, g)
      ;[
        [16, -6, -20],
        [13, -16, -28],
        [9.5, -25, -36],
      ].forEach(([r, y0, y1]) => poly(g, [{ x: c.x - r, y: c.y + y0 }, { x: c.x, y: c.y + y1 - 4 }, { x: c.x + r, y: c.y + y0 }], '#8cc79a'))
      const balls = [[-8, -9, '#ef8f86'], [6, -11, '#ffd36e'], [-4, -19, '#9fd3ec'], [5, -21, '#ef8f86'], [-1, -29, '#ffd36e']] as const
      for (const [dx, dy, color] of balls) el('circle', { cx: c.x + dx, cy: c.y + dy, r: 1.8, fill: color, stroke: LINE, 'stroke-width': 0.4 }, g)
      const star = el('text', { x: c.x, y: c.y - 39, 'text-anchor': 'middle', 'font-size': 10, class: 'twinkle' }, g)
      star.textContent = '⭐'
    },
    side: (g, c) => {
      drawGift(g, { x: c.x - 5, y: c.y }, '#ef8f86')
      drawGift(g, { x: c.x + 5, y: c.y + 2 }, '#9fd3ec', 0.8)
    },
  },
  seollal: {
    main: (g, c) => {
      // 말뚝에 맨 방패연이 바람에 살랑인다
      el('ellipse', { cx: c.x, cy: c.y + 1, rx: 6, ry: 2.2, fill: 'rgba(90,70,54,0.14)' }, g)
      el('rect', { x: c.x - 1.3, y: c.y - 6, width: 2.6, height: 6.5, rx: 1, fill: '#a7805e', stroke: LINE, 'stroke-width': 0.5 }, g)
      const k = { x: c.x + 10, y: c.y - 46 }
      el('path', { d: `M${c.x} ${c.y - 5} Q${c.x - 6} ${c.y - 26} ${k.x} ${k.y + 10}`, fill: 'none', stroke: '#a7805e', 'stroke-width': 0.6 }, g)
      const kite = el('g', { class: 'kite' }, g)
      for (const [dx, color] of [[-5, '#f28b82'], [0, '#8cc79a'], [5, '#9fd3ec']] as const) {
        el('path', { d: `M${k.x + dx * 0.6} ${k.y + 10} q${dx} 6 0 11 q${-dx} 5 ${dx * 0.6} 10`, fill: 'none', stroke: color, 'stroke-width': 1.6, 'stroke-linecap': 'round' }, kite)
      }
      el('rect', { x: k.x - 8, y: k.y - 10, width: 16, height: 20, rx: 2, fill: '#fffaf0', stroke: LINE, 'stroke-width': 0.7 }, kite)
      el('path', { d: `M${k.x - 8} ${k.y - 10} L${k.x + 8} ${k.y + 10} M${k.x + 8} ${k.y - 10} L${k.x - 8} ${k.y + 10} M${k.x} ${k.y - 10} V${k.y + 10}`, stroke: '#d8c4ad', 'stroke-width': 0.5 }, kite)
      el('path', { d: `M${k.x - 4.5} ${k.y - 10} a4.5 4 0 0 0 9 0 z`, fill: '#f28b82', stroke: LINE, 'stroke-width': 0.5 }, kite)
      el('circle', { cx: k.x, cy: k.y + 1, r: 3.6, fill: '#cdeaf5', stroke: LINE, 'stroke-width': 0.6 }, kite)
    },
    side: (g, c) => {
      // 소반 위 떡국 한 그릇
      el('ellipse', { cx: c.x, cy: c.y + 1, rx: 12, ry: 4, fill: 'rgba(90,70,54,0.14)' }, g)
      for (const dx of [-7, 7]) el('rect', { x: c.x + dx - 1, y: c.y - 6, width: 2, height: 6, fill: '#a7805e' }, g)
      el('ellipse', { cx: c.x, cy: c.y - 6, rx: 11, ry: 4, fill: '#c49a74', stroke: LINE, 'stroke-width': 0.6 }, g)
      el('path', { d: `M${c.x - 6} ${c.y - 10} a6 4.5 0 0 0 12 0 z`, fill: '#9fd3ec', stroke: LINE, 'stroke-width': 0.6 }, g)
      el('ellipse', { cx: c.x, cy: c.y - 10, rx: 6, ry: 1.8, fill: '#fffaf0', stroke: LINE, 'stroke-width': 0.5 }, g)
      for (const [dx, color] of [[-2.5, '#ffd36e'], [0.5, '#8cc79a'], [2.8, '#fffaf0']] as const) {
        el('ellipse', { cx: c.x + dx, cy: c.y - 10.2, rx: 1.2, ry: 0.6, fill: color, stroke: '#d8c4ad', 'stroke-width': 0.3 }, g)
      }
      for (const dx of [-2, 2]) el('path', { d: `M${c.x + dx} ${c.y - 13} q-1.5 -2.5 0 -5 q1.5 -2.5 0 -5`, fill: 'none', stroke: 'rgba(255,255,255,0.85)', 'stroke-width': 0.8, 'stroke-linecap': 'round', class: 'steam' }, g)
    },
  },
  chuseok: {
    main: (g, c) => {
      // 장대에 건 둥근 보름달 등
      el('ellipse', { cx: c.x, cy: c.y + 1, rx: 8, ry: 2.8, fill: 'rgba(90,70,54,0.14)' }, g)
      el('rect', { x: c.x - 1.2, y: c.y - 30, width: 2.4, height: 30, rx: 1.2, fill: '#a7805e', stroke: LINE, 'stroke-width': 0.5 }, g)
      const m = { x: c.x, y: c.y - 42 }
      el('circle', { cx: m.x, cy: m.y, r: 15, fill: 'rgba(255,233,163,0.45)', class: 'lantern-glow' }, g)
      el('circle', { cx: m.x, cy: m.y, r: 11, fill: '#ffe9a3', stroke: LINE, 'stroke-width': 0.7 }, g)
      for (const [dx, dy, r] of [[-4, -3, 2.2], [3.5, 2, 1.6], [-1, 5, 1.2], [4.5, -4.5, 1]]) {
        el('circle', { cx: m.x + dx, cy: m.y + dy, r, fill: '#f6dc8a' }, g)
      }
      el('ellipse', { cx: m.x - 5.5, cy: m.y - 5.5, rx: 2, ry: 1.2, fill: 'rgba(255,255,255,0.7)' }, g)
      el('path', { d: `M${m.x} ${m.y + 11} v4`, stroke: '#f28b82', 'stroke-width': 1.4, 'stroke-linecap': 'round' }, g)
      el('path', { d: `M${m.x - 1.6} ${m.y + 15} h3.2 l-0.6 4 h-2 z`, fill: '#f28b82', stroke: LINE, 'stroke-width': 0.4 }, g)
    },
    side: (g, c) => {
      // 솔잎 위 알록달록 송편 한 접시
      el('ellipse', { cx: c.x, cy: c.y + 1, rx: 12, ry: 4, fill: 'rgba(90,70,54,0.14)' }, g)
      el('ellipse', { cx: c.x, cy: c.y - 2, rx: 11, ry: 4.2, fill: '#fffaf0', stroke: LINE, 'stroke-width': 0.6 }, g)
      for (const dx of [-6, -3, 0, 3]) el('path', { d: `M${c.x + dx} ${c.y - 1} l3 -3`, stroke: '#8cb87a', 'stroke-width': 0.6 }, g)
      const cakes = [[-5, -2.5, '#fffaf0'], [0, -3.5, '#f6c1cc'], [5, -2.5, '#b7e3a1'], [-2.5, -0.5, '#ffe9a3'], [2.5, -0.5, '#fffaf0']] as const
      for (const [dx, dy, color] of cakes) {
        el('path', { d: `M${c.x + dx - 3} ${c.y + dy} a3 2.6 0 0 1 6 0 z`, fill: color, stroke: LINE, 'stroke-width': 0.5 }, g)
      }
    },
  },
}

/** 잔치 날 광장: 깃발 줄 + 가운데 돌길 위 장식 두 개. 계산해서 그리고 저장하지 않는다 */
function festivalItems(items: { depth: number; draw: () => void }[], g: Element, id: FestivalId) {
  festivalBunting(items, g, id)
  // 소품을 놓을 수 없는 돌길 칸이라 사용자가 놓은 소품과 겹치지 않는다.
  // 화면에서 명소·다음 명소 팻말과 같은 세로줄에 서지 않는 칸을 골랐다
  const spots: [number, number, 'main' | 'side'][] = [[5, 2, 'main'], [2, 3, 'side']]
  for (const [col, row, kind] of spots) {
    const gx = PLAZA.gx + col
    const gy = PLAZA.gy + row
    items.push({
      depth: gx + gy,
      draw: () => {
        const c = iso(gx + 0.5, gy + 0.5)
        const s = kind === 'main' ? 1.3 : 1.1
        const attrs: Record<string, string> = {
          class: `festival festival-${kind}`,
          'data-festival': id,
          transform: `translate(${c.x} ${c.y}) scale(${s}) translate(${-c.x} ${-c.y})`,
        }
        if (kind === 'main') attrs['data-testid'] = 'festival'
        FESTIVAL_ART[id][kind](el('g', attrs, g), c)
      },
    })
  }
}

function drawWell(lm: Element, c: Pt) {
  el('ellipse', { cx: c.x, cy: c.y + 2, rx: 17, ry: 7, fill: 'rgba(90,70,54,0.14)' }, lm)
  el('path', { d: `M${c.x - 12} ${c.y - 11} v11 a12 5.5 0 0 0 24 0 v-11 z`, fill: '#cfc4b8', stroke: LINE }, lm)
  for (const dx of [-7, 0, 7]) el('path', { d: `M${c.x + dx - 3} ${c.y - 4 + Math.abs(dx) * -0.2} h6`, stroke: '#b6aa9c', 'stroke-width': 1 }, lm)
  el('ellipse', { cx: c.x, cy: c.y - 11, rx: 12, ry: 5.5, fill: '#e4dcd2', stroke: LINE }, lm)
  el('ellipse', { cx: c.x, cy: c.y - 11, rx: 8.5, ry: 3.6, fill: '#9fd3ec' }, lm)
  for (const x of [c.x - 12, c.x + 9.5]) el('rect', { x, y: c.y - 34, width: 2.5, height: 24, rx: 1, fill: '#a7805e' }, lm)
  el('line', { x1: c.x - 11, y1: c.y - 28, x2: c.x + 11, y2: c.y - 28, stroke: '#8a6a4e', 'stroke-width': 1.6 }, lm)
  el('line', { x1: c.x + 2, y1: c.y - 28, x2: c.x + 2, y2: c.y - 20, stroke: '#8a6a4e', 'stroke-width': 0.8 }, lm)
  poly(lm, [{ x: c.x - 1.5, y: c.y - 20 }, { x: c.x + 5.5, y: c.y - 20 }, { x: c.x + 4.5, y: c.y - 15 }, { x: c.x - 0.5, y: c.y - 15 }], '#d9906b', { 'stroke-width': 0.6 })
  poly(lm, [{ x: c.x - 18, y: c.y - 30 }, { x: c.x, y: c.y - 43 }, { x: c.x + 18, y: c.y - 30 }, { x: c.x + 16, y: c.y - 28 }, { x: c.x - 16, y: c.y - 28 }], '#ef9f86')
  el('line', { x1: c.x - 9, y1: c.y - 34.5, x2: c.x, y2: c.y - 41, stroke: '#f7c3b2', 'stroke-width': 1.5, 'stroke-linecap': 'round' }, lm)
}

function drawGarden(lm: Element, P: Place, seed: number) {
  poly(lm, [P(0.1, 0.1), P(0.9, 0.1), P(0.9, 0.9), P(0.1, 0.9)], '#a6d98f')
  const colors = ['#ff8fa3', '#ffc15e', '#c4a3d8', '#ffffff', '#ffb3c7', '#8fb8e8']
  const spots: [number, number][] = []
  for (const u of [0.25, 0.5, 0.75]) for (const v of [0.25, 0.5, 0.75]) spots.push([u, v])
  spots.forEach(([u, v], k) => {
    const p = P(u, v)
    el('line', { x1: p.x, y1: p.y, x2: p.x, y2: p.y - 5, stroke: '#6bb879', 'stroke-width': 1 }, lm)
    el('circle', { cx: p.x, cy: p.y - 6.5, r: 3.2, fill: colors[(k + seed) % colors.length], stroke: LINE, 'stroke-width': 0.6 }, lm)
    el('circle', { cx: p.x, cy: p.y - 6.5, r: 1.1, fill: '#ffe07a' }, lm)
  })
  // 낮은 울타리(앞쪽 두 변)
  const fence = (a: Pt, b: Pt) => {
    for (let k = 0; k <= 6; k++) {
      const x = a.x + ((b.x - a.x) * k) / 6
      const y = a.y + ((b.y - a.y) * k) / 6
      el('rect', { x: x - 0.9, y: y - 7, width: 1.8, height: 7, rx: 0.9, fill: '#fffaf0', stroke: LINE, 'stroke-width': 0.5 }, lm)
    }
    el('line', { x1: a.x, y1: a.y - 5, x2: b.x, y2: b.y - 5, stroke: '#fffaf0', 'stroke-width': 1.4 }, lm)
  }
  fence(P(0.08, 0.92), P(0.92, 0.92))
  fence(P(0.92, 0.92), P(0.92, 0.08))
}

function drawFountain(lm: Element, c: Pt) {
  el('ellipse', { cx: c.x, cy: c.y + 2, rx: 21, ry: 9, fill: 'rgba(90,70,54,0.14)' }, lm)
  el('path', { d: `M${c.x - 19} ${c.y - 6} v6 a19 8.5 0 0 0 38 0 v-6 z`, fill: '#e2d6c6', stroke: LINE }, lm)
  el('ellipse', { cx: c.x, cy: c.y - 6, rx: 19, ry: 8.5, fill: '#f1e8dc', stroke: LINE }, lm)
  el('ellipse', { cx: c.x, cy: c.y - 6, rx: 15.5, ry: 6.6, fill: '#a8dcf0' }, lm)
  el('rect', { x: c.x - 2.5, y: c.y - 20, width: 5, height: 14, rx: 1.5, fill: '#e2d6c6', stroke: LINE }, lm)
  el('path', { d: `M${c.x - 8} ${c.y - 20} a8 3.4 0 0 0 16 0 z`, fill: '#e2d6c6', stroke: LINE }, lm)
  el('ellipse', { cx: c.x, cy: c.y - 20, rx: 8, ry: 3.4, fill: '#bfe6f7', stroke: LINE }, lm)
  for (const s of [-1, 1]) el('path', { d: `M${c.x} ${c.y - 27} q${s * 9} -4 ${s * 12} 13`, fill: 'none', stroke: '#bfe6f7', 'stroke-width': 2, 'stroke-linecap': 'round' }, lm)
  el('path', { d: `M${c.x} ${c.y - 21} v-7`, stroke: '#d8f1fb', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, lm)
  for (const [dx, dy] of [[-12, -9], [11, -11], [-5, -4], [6, -3]]) el('circle', { cx: c.x + dx, cy: c.y + dy, r: 1.1, fill: '#ffffff', class: 'twinkle' }, lm)
}

function drawBridge(lm: Element, P: Place) {
  // 광장을 가로지르는 작은 냇물과 그 위 둥근 나무다리
  poly(lm, [P(0, 0.3), P(1, 0.3), P(1, 0.7), P(0, 0.7)], '#a8dcf0', { stroke: 'none' })
  for (const v of [0.42, 0.58]) {
    const a = P(0.12, v)
    const b = P(0.32, v)
    el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#e3f5fc', 'stroke-width': 1.2, 'stroke-linecap': 'round' }, lm)
    const d = P(0.72, v)
    const e2 = P(0.9, v)
    el('line', { x1: d.x, y1: d.y, x2: e2.x, y2: e2.y, stroke: '#e3f5fc', 'stroke-width': 1.2, 'stroke-linecap': 'round' }, lm)
  }
  const N = 8
  const at = (u: number, k: number, up = 0) => P(u, 0.08 + (0.84 * k) / N, Math.sin((Math.PI * k) / N) * 10 + up)
  const left: Pt[] = []
  const right: Pt[] = []
  for (let k = 0; k <= N; k++) {
    left.push(at(0.34, k))
    right.push(at(0.66, k))
  }
  // 오른쪽 옆면 → 바닥 판
  poly(lm, [...right, ...right.map((p) => ({ x: p.x, y: p.y + 3 })).reverse()], '#b9875f')
  poly(lm, [...left, ...[...right].reverse()], '#dcae82')
  for (const u of [0.34, 0.66]) {
    const rail: Pt[] = []
    for (let k = 0; k <= N; k++) {
      const p = at(u, k, 6)
      rail.push(p)
      if (k % 2 === 0) {
        const q = at(u, k)
        el('line', { x1: q.x, y1: q.y, x2: p.x, y2: p.y, stroke: '#a7805e', 'stroke-width': 1.3 }, lm)
      }
    }
    el('polyline', { points: pts(rail), fill: 'none', stroke: '#a7805e', 'stroke-width': 1.5, 'stroke-linecap': 'round' }, lm)
  }
}

function drawClockTower(lm: Element, P: Place) {
  const a = 0.26
  const b = 0.74
  const H = 54
  el('ellipse', { cx: P(0.5, 0.5).x, cy: P(0.5, 0.5).y + 3, rx: 16, ry: 7, fill: 'rgba(90,70,54,0.14)' }, lm)
  drawWalls(lm, P, a, b, H, '#f3dfc6')
  const m = (a + b) / 2
  poly(lm, [P(m - 0.08, b), P(m + 0.08, b), P(m + 0.08, b, 11), P(m - 0.08, b, 11)], '#b07f5a')
  poly(lm, [P(b, m + 0.06, 22), P(b, m - 0.06, 22), P(b, m - 0.06, 29), P(b, m + 0.06, 29)], WIN, win)
  // 시계: 오른쪽 앞면 위쪽
  const f = P(b, m, 42)
  el('ellipse', { cx: f.x, cy: f.y, rx: 5.6, ry: 6.4, fill: '#fffaf0', stroke: '#a7805e', 'stroke-width': 1 }, lm)
  el('path', { d: `M${f.x} ${f.y} v-4.2 M${f.x} ${f.y} l2.8 1.4`, stroke: '#5a4636', 'stroke-width': 1, 'stroke-linecap': 'round' }, lm)
  const left = P(a + 0.24, b, 42)
  el('ellipse', { cx: left.x, cy: left.y, rx: 4.6, ry: 5.6, fill: '#fff3dc', stroke: '#a7805e', 'stroke-width': 0.8 }, lm)
  const top = drawRoof(lm, P, a, b, H, 'hip', '#8fb8e8', '#f3dfc6')
  const p = P(m, m, top)
  el('rect', { x: p.x - 0.7, y: p.y - 10, width: 1.4, height: 10, fill: '#a7805e' }, lm)
  el('path', { d: `M${p.x + 0.7} ${p.y - 10} l8 3 l-8 3 z`, fill: '#ffc15e', stroke: LINE }, lm)
}

function drawWindmill(lm: Element, c: Pt) {
  el('ellipse', { cx: c.x, cy: c.y + 2, rx: 17, ry: 7.5, fill: 'rgba(90,70,54,0.14)' }, lm)
  const T = 40
  const half = (h: number) => 12 - (h / T) * 5
  poly(lm, [{ x: c.x - half(0), y: c.y }, { x: c.x + half(0), y: c.y }, { x: c.x + half(T), y: c.y - T }, { x: c.x - half(T), y: c.y - T }], '#fff4e0')
  poly(lm, [{ x: c.x, y: c.y }, { x: c.x + half(0), y: c.y }, { x: c.x + half(T), y: c.y - T }, { x: c.x, y: c.y - T }], '#f6e6cc', { stroke: 'none' })
  el('path', { d: `M${c.x - 3.5} ${c.y} v-7 a3.5 3.5 0 0 1 7 0 v7 z`, fill: '#b07f5a' }, lm)
  el('rect', { x: c.x - 2.5, y: c.y - 24, width: 5, height: 6, rx: 1.5, fill: WIN, stroke: LINE, 'stroke-width': 0.6, ...win }, lm)
  poly(lm, [{ x: c.x - 9.5, y: c.y - T + 1 }, { x: c.x + 9.5, y: c.y - T + 1 }, { x: c.x, y: c.y - T - 13 }], '#ef9f86')
  // 날개: 천천히 돈다
  const hub = { x: c.x - 1, y: c.y - T + 2 }
  const blades = el('g', { class: 'blades', style: `transform-origin:${hub.x.toFixed(1)}px ${hub.y.toFixed(1)}px` }, lm)
  for (const r of [20, 110, 200, 290]) {
    const b = el('g', { transform: `rotate(${r} ${hub.x.toFixed(1)} ${hub.y.toFixed(1)})` }, blades)
    el('rect', { x: hub.x - 1, y: hub.y - 25, width: 2, height: 25, fill: '#a7805e' }, b)
    el('rect', { x: hub.x + 1, y: hub.y - 24, width: 6.5, height: 18, rx: 1.5, fill: '#fffaf0', stroke: LINE, 'stroke-width': 0.8 }, b)
    el('line', { x1: hub.x + 1, y1: hub.y - 15, x2: hub.x + 7.5, y2: hub.y - 15, stroke: LINE, 'stroke-width': 0.6 }, b)
  }
  el('circle', { cx: hub.x, cy: hub.y, r: 2.6, fill: '#c98f72', stroke: LINE }, lm)
}

function drawBigTree(lm: Element, c: Pt) {
  el('ellipse', { cx: c.x, cy: c.y + 2, rx: 22, ry: 9, fill: 'rgba(90,70,54,0.14)' }, lm)
  el('path', { d: `M${c.x - 5} ${c.y + 1} q2 -14 1 -30 h8 q-1 16 1 30 q-5 2 -10 0 z`, fill: '#a7805e', stroke: LINE }, lm)
  const colors = ['#ffb3ba', '#ffd8a8', '#fff1a8', '#bfe8b8', '#b8dcf5', '#d7c4f0']
  const blobs = [
    { x: -15, y: -40, r: 12 },
    { x: 15, y: -40, r: 12 },
    { x: -8, y: -54, r: 13 },
    { x: 9, y: -55, r: 13 },
    { x: 0, y: -42, r: 13 },
    { x: 0, y: -66, r: 11 },
  ]
  blobs.forEach((b, k) => {
    el('circle', { cx: c.x + b.x, cy: c.y + b.y, r: b.r, fill: colors[k], stroke: LINE }, lm)
    el('circle', { cx: c.x + b.x - b.r * 0.35, cy: c.y + b.y - b.r * 0.35, r: b.r * 0.35, fill: shade(colors[k], 0.4) }, lm)
  })
  for (const [dx, dy] of [[-22, -58], [22, -62], [0, -82]]) {
    const t = el('text', { x: c.x + dx, y: c.y + dy, 'text-anchor': 'middle', 'font-size': 9, class: 'twinkle' }, lm)
    t.textContent = '✨'
  }
}

/** 명소 하나. 기분과 상관없이 늘 같은 모양이다 */
function drawLandmark(g: Element, l: Landmark) {
  const { gx, gy } = landmarkSpot(l)
  const P: Place = (u, v, h = 0) => iso(gx + u, gy + v, h)
  const lm = el('g', { class: 'landmark', 'data-testid': `landmark-${l.id}`, 'data-landmark': l.id }, g)
  const tall = l.id === 'bigTree' ? 90 : l.id === 'clockTower' ? 80 : l.id === 'windmill' ? 66 : 44
  poly(lm, [P(0, 0, tall), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0)], 'transparent', { stroke: 'none', class: 'hit' })
  const c = P(0.5, 0.5)
  if (l.id === 'well') drawWell(lm, c)
  else if (l.id === 'garden') drawGarden(lm, P, hash(l.id))
  else if (l.id === 'fountain') drawFountain(lm, c)
  else if (l.id === 'bridge') drawBridge(lm, P)
  else if (l.id === 'clockTower') drawClockTower(lm, P)
  else if (l.id === 'windmill') drawWindmill(lm, c)
  else drawBigTree(lm, c)
}

/** 다음 명소가 설 자리: 점선 테두리와 나무 팻말("7일 더 쓰면 / 우물이 생겨요") */
function drawNextSign(g: Element, l: Landmark, lines: [string, string]) {
  const { gx, gy } = landmarkSpot(l)
  const sign = el('g', { class: 'next-sign', 'data-testid': 'next-landmark', 'data-landmark': l.id }, g)
  const a = 0.14
  const b = 0.86
  poly(sign, [iso(gx + a, gy + a), iso(gx + b, gy + a), iso(gx + b, gy + b), iso(gx + a, gy + b)], 'rgba(255,255,255,0.4)', {
    stroke: '#c9a27e',
    'stroke-width': 1.2,
    'stroke-dasharray': '4 3',
  })
  const c = iso(gx + 0.5, gy + 0.5)
  el('ellipse', { cx: c.x, cy: c.y + 1, rx: 5, ry: 2, fill: 'rgba(90,70,54,0.16)' }, sign)
  el('rect', { x: c.x - 1.5, y: c.y - 22, width: 3, height: 23, rx: 1.5, fill: '#a7805e' }, sign)
  el('rect', { x: c.x - 40, y: c.y - 50, width: 80, height: 30, rx: 8, fill: '#fff3dc', stroke: '#a7805e', 'stroke-width': 1.2 }, sign)
  const t1 = el('text', { x: c.x, y: c.y - 38, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 700, fill: '#7a604a' }, sign)
  t1.textContent = lines[0]
  const t2 = el('text', { x: c.x, y: c.y - 26, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 700, fill: '#7a604a' }, sign)
  t2.textContent = lines[1]
}

const line = (a: Pt, b: Pt) => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
const center = (p: Pt) => ({ cx: p.x, cy: p.y })
const shadow = (g: Element, c: Pt, rx: number, ry: number) => el('ellipse', { cx: c.x, cy: c.y + 1, rx, ry, fill: 'rgba(90,70,54,0.14)' }, g)

/** 꾸밈 소품 그림. 칸보다 작게 그려 옆 칸 집을 가리지 않는다 */
const DECOR_ART: Record<DecorId, (g: Element, P: Place, c: Pt) => void> = {
  pot(g, _P, c) {
    shadow(g, c, 8, 3)
    for (const [dx, dy, r, f] of [[-4, -14, 5, '#8fcf8a'], [4, -15, 5, '#7cc47f'], [0, -19, 5.5, '#a3d99b']] as const) el('circle', { cx: c.x + dx, cy: c.y + dy, r, fill: f, stroke: LINE, 'stroke-width': 0.7 }, g)
    el('path', { d: `M${c.x - 6.5} ${c.y - 10} h13 l-2 9.5 a4.5 1.8 0 0 1 -9 0 z`, fill: '#e59a72', stroke: LINE }, g)
    el('rect', { x: c.x - 7.5, y: c.y - 11.5, width: 15, height: 3.2, rx: 1.6, fill: '#f0b08e', stroke: LINE, 'stroke-width': 0.7 }, g)
  },
  bench(g, P) {
    shadow(g, P(0.5, 0.5), 15, 5)
    const legs = [P(0.2, 0.42), P(0.8, 0.42), P(0.2, 0.62), P(0.8, 0.62)]
    for (const p of legs) el('rect', { x: p.x - 1, y: p.y - 7, width: 2, height: 7, rx: 1, fill: '#8a6a4e' }, g)
    poly(g, [P(0.15, 0.4, 9), P(0.85, 0.4, 9), P(0.85, 0.36, 18), P(0.15, 0.36, 18)], '#dcae82')
    el('line', { ...line(P(0.15, 0.38, 13.5), P(0.85, 0.38, 13.5)), stroke: '#c59466', 'stroke-width': 1 }, g)
    poly(g, [P(0.15, 0.4, 8), P(0.85, 0.4, 8), P(0.85, 0.64, 8), P(0.15, 0.64, 8)], '#e8bf92')
  },
  flowerbed(g, P) {
    el('ellipse', { ...center(P(0.5, 0.5)), rx: 17, ry: 8, fill: '#b98b67', stroke: LINE }, g)
    el('ellipse', { ...center(P(0.5, 0.5, 1.2)), rx: 14.5, ry: 6.4, fill: '#a8d98f' }, g)
    const colors = ['#ff8fa3', '#fff1a8', '#c4a3d8', '#ffb3c7', '#ffffff', '#ffc15e']
    ;[[0.3, 0.35], [0.5, 0.3], [0.68, 0.4], [0.35, 0.58], [0.55, 0.52], [0.7, 0.65], [0.45, 0.72]].forEach(([u, v], k) => {
      const p = P(u, v, 2)
      el('circle', { cx: p.x, cy: p.y - 2, r: 2.6, fill: colors[k % colors.length], stroke: LINE, 'stroke-width': 0.5 }, g)
      el('circle', { cx: p.x, cy: p.y - 2, r: 0.9, fill: '#ffd56e' }, g)
    })
  },
  lamp(g, _P, c) {
    shadow(g, c, 6, 2.5)
    el('rect', { x: c.x - 3.5, y: c.y - 3, width: 7, height: 3, rx: 1.5, fill: '#6f7f7a' }, g)
    el('rect', { x: c.x - 1.2, y: c.y - 30, width: 2.4, height: 28, rx: 1.2, fill: '#6f7f7a' }, g)
    el('rect', { x: c.x - 5, y: c.y - 39, width: 10, height: 10, rx: 3, fill: '#fff1b8', stroke: '#6f7f7a', 'stroke-width': 1.2, class: 'win' }, g)
    el('path', { d: `M${c.x - 7} ${c.y - 39} q7 -7 14 0 z`, fill: '#7bb88f', stroke: LINE }, g)
    el('circle', { cx: c.x, cy: c.y - 46.5, r: 1.6, fill: '#7bb88f' }, g)
  },
  mailbox(g, _P, c) {
    shadow(g, c, 6, 2.5)
    el('rect', { x: c.x - 1.5, y: c.y - 14, width: 3, height: 14, rx: 1, fill: '#a7805e' }, g)
    el('path', { d: `M${c.x - 7} ${c.y - 13} v-8 a7 6 0 0 1 14 0 v8 z`, fill: '#f08a7e', stroke: LINE }, g)
    el('rect', { x: c.x - 4, y: c.y - 19, width: 8, height: 1.6, rx: 0.8, fill: '#9c4a42' }, g)
    el('path', { d: `M${c.x + 7} ${c.y - 22} v-7 h5 l-1.5 2 l1.5 2 h-5`, fill: '#ffd56e', stroke: LINE, 'stroke-width': 0.6 }, g)
  },
  fence(g, P) {
    // 칸 앞쪽 두 변을 따라 둥근 말뚝 울타리
    const run = (a: Pt, b: Pt) => {
      for (let k = 0; k <= 5; k++) {
        const x = a.x + ((b.x - a.x) * k) / 5
        const y = a.y + ((b.y - a.y) * k) / 5
        el('rect', { x: x - 1.6, y: y - 12, width: 3.2, height: 12, rx: 1.6, fill: '#dcae82', stroke: LINE, 'stroke-width': 0.6 }, g)
      }
      for (const h of [4, 8.5]) el('line', { x1: a.x, y1: a.y - h, x2: b.x, y2: b.y - h, stroke: '#c59466', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, g)
    }
    run(P(0.12, 0.88), P(0.88, 0.88))
    run(P(0.88, 0.88), P(0.88, 0.12))
  },
  pond(g, P) {
    const c = P(0.5, 0.5)
    el('ellipse', { cx: c.x, cy: c.y, rx: 19, ry: 9, fill: '#d9cfc2', stroke: LINE }, g)
    el('ellipse', { cx: c.x, cy: c.y, rx: 16, ry: 7.2, fill: '#a8dcf0' }, g)
    el('path', { d: `M${c.x - 8} ${c.y - 2} q4 -2 8 0`, fill: 'none', stroke: '#e3f5fc', 'stroke-width': 1.2, 'stroke-linecap': 'round' }, g)
    el('ellipse', { cx: c.x + 6, cy: c.y + 2, rx: 3.2, ry: 1.6, fill: '#ffaa6b' }, g)
    el('path', { d: `M${c.x + 9} ${c.y + 2} l2.5 -1.6 v3.2 z`, fill: '#ffaa6b' }, g)
    el('ellipse', { cx: c.x - 9, cy: c.y + 2.5, rx: 4, ry: 2, fill: '#8fcf8a', stroke: LINE, 'stroke-width': 0.5 }, g)
    el('circle', { cx: c.x - 8, cy: c.y + 1.5, r: 1.2, fill: '#ffd6e2' }, g)
  },
  birdhouse(g, _P, c) {
    shadow(g, c, 5, 2)
    el('rect', { x: c.x - 1.3, y: c.y - 26, width: 2.6, height: 26, rx: 1.2, fill: '#a7805e' }, g)
    el('rect', { x: c.x - 6, y: c.y - 36, width: 12, height: 11, rx: 2, fill: '#fff4e2', stroke: LINE }, g)
    el('path', { d: `M${c.x - 8.5} ${c.y - 35} l8.5 -8 l8.5 8 z`, fill: '#8fb8e8', stroke: LINE, 'stroke-linejoin': 'round' }, g)
    el('circle', { cx: c.x, cy: c.y - 31, r: 2.2, fill: '#7a604a' }, g)
    el('circle', { cx: c.x + 7, cy: c.y - 45, r: 3, fill: '#ffd56e', stroke: LINE, 'stroke-width': 0.6 }, g)
    el('path', { d: `M${c.x + 9.8} ${c.y - 45.5} l2 0.6 l-2 0.8 z`, fill: '#f2a65a' }, g)
    el('circle', { cx: c.x + 8, cy: c.y - 45.8, r: 0.6, fill: '#5a4636' }, g)
  },
  sunflower(g, P) {
    for (const [u, v, h] of [[0.35, 0.45, 22], [0.62, 0.42, 28], [0.5, 0.65, 17]] as const) {
      const p = P(u, v)
      el('line', { x1: p.x, y1: p.y, x2: p.x, y2: p.y - h, stroke: '#6bb879', 'stroke-width': 1.6 }, g)
      el('ellipse', { cx: p.x + 2.5, cy: p.y - h / 2, rx: 2.6, ry: 1.3, fill: '#8fcf8a' }, g)
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        el('ellipse', { cx: p.x + Math.cos(a) * 3.6, cy: p.y - h + Math.sin(a) * 3.6, rx: 2.3, ry: 1.3, fill: '#ffd24d', transform: `rotate(${(a * 180) / Math.PI} ${p.x + Math.cos(a) * 3.6} ${p.y - h + Math.sin(a) * 3.6})` }, g)
      }
      el('circle', { cx: p.x, cy: p.y - h, r: 2.6, fill: '#a7805e' }, g)
    }
  },
  roseArch(g, P) {
    const a = P(0.5, 0.18)
    const b = P(0.5, 0.82)
    shadow(g, P(0.5, 0.5), 14, 5)
    const top = Math.min(a.y, b.y) - 30
    el('path', { d: `M${a.x} ${a.y} V${a.y - 22} Q${(a.x + b.x) / 2} ${top - 6} ${b.x} ${b.y - 22} V${b.y}`, fill: 'none', stroke: '#fffaf0', 'stroke-width': 3.2, 'stroke-linecap': 'round' }, g)
    el('path', { d: `M${a.x} ${a.y} V${a.y - 22} Q${(a.x + b.x) / 2} ${top - 6} ${b.x} ${b.y - 22} V${b.y}`, fill: 'none', stroke: LINE, 'stroke-width': 0.6 }, g)
    const roses = ['#ff8fa3', '#ffb3c7', '#ff7a93']
    for (let k = 0; k <= 10; k++) {
      const t = k / 10
      const x = a.x + (b.x - a.x) * t
      const y = k <= 2 ? a.y - 8 - k * 6 : k >= 8 ? b.y - 8 - (10 - k) * 6 : top + Math.abs(t - 0.5) * 10
      el('circle', { cx: x + (k % 2 ? 2 : -2), cy: y, r: 2.4, fill: '#8fcf8a' }, g)
      if (k % 2 === 0) el('circle', { cx: x, cy: y - 1, r: 2.2, fill: roses[k % 3], stroke: LINE, 'stroke-width': 0.4 }, g)
    }
  },
  bulbs(g, P) {
    const a = P(0.2, 0.5)
    const b = P(0.8, 0.5)
    for (const p of [a, b]) {
      shadow(g, p, 4, 1.6)
      el('rect', { x: p.x - 1.2, y: p.y - 26, width: 2.4, height: 26, rx: 1.2, fill: '#a7805e' }, g)
    }
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 16 }
    el('path', { d: `M${a.x} ${a.y - 25} Q${mid.x} ${mid.y} ${b.x} ${b.y - 25}`, fill: 'none', stroke: '#7a604a', 'stroke-width': 0.7 }, g)
    const colors = ['#ffd56e', '#ff9fb2', '#9fd3ec', '#b8e0a0', '#e5d4f5']
    for (let k = 1; k <= 7; k++) {
      const t = k / 8
      const x = (1 - t) ** 2 * a.x + 2 * t * (1 - t) * mid.x + t ** 2 * b.x
      const y = (1 - t) ** 2 * (a.y - 25) + 2 * t * (1 - t) * mid.y + t ** 2 * (b.y - 25)
      el('circle', { cx: x, cy: y + 2.4, r: 2, fill: colors[k % colors.length], stroke: LINE, 'stroke-width': 0.4, class: 'twinkle' }, g)
    }
  },
  tent(g, P) {
    // 용마루가 칸을 가로지르는 세모 텐트. 앞 경사면과 오른쪽 끝(문)이 보인다
    shadow(g, P(0.5, 0.5), 18, 7)
    const H = 24
    poly(g, [P(0.18, 0.82), P(0.82, 0.82), P(0.82, 0.5, H), P(0.18, 0.5, H)], '#ffe2b8', { 'stroke-linejoin': 'round' })
    for (const u of [0.39, 0.61]) el('line', { ...line(P(u, 0.82), P(u, 0.5, H)), stroke: '#f5c99a', 'stroke-width': 1.4 }, g)
    poly(g, [P(0.82, 0.18), P(0.82, 0.82), P(0.82, 0.5, H)], '#f2c9a0', { 'stroke-linejoin': 'round' })
    poly(g, [P(0.82, 0.36), P(0.82, 0.64), P(0.82, 0.5, H * 0.62)], '#f08a7e', { 'stroke-linejoin': 'round' })
    const top = P(0.82, 0.5, H)
    el('line', { x1: top.x, y1: top.y, x2: top.x, y2: top.y - 8, stroke: '#a7805e', 'stroke-width': 1.2 }, g)
    el('path', { d: `M${top.x} ${top.y - 8} l6 1.8 l-6 1.8 z`, fill: '#7bb88f' }, g)
  },
}

/** 사용자가 놓은 꾸밈 소품 하나 */
function drawDecor(g: Element, d: PlacedDecor & DecorSpot & { index: number }, picked: boolean) {
  const P: Place = (u, v, h = 0) => iso(d.gx + u, d.gy + v, h)
  const node = el('g', { class: picked ? 'decor picked' : 'decor', 'data-testid': `decor-${d.index}`, 'data-decor': d.id }, g)
  // 꾸미기 중 고른 소품: 발밑에 둥근 빛 고리
  if (picked) {
    const c = P(0.5, 0.5)
    el('ellipse', { cx: c.x, cy: c.y, rx: 19, ry: 9.5, fill: 'rgba(123,184,143,0.3)', stroke: '#7bb88f', 'stroke-width': 1.6, class: 'pick-ring' }, node)
  }
  DECOR_ART[d.id](node, P, P(0.5, 0.5))
}

/** 꾸미기 중 소품을 놓을 수 있는 빈 칸 표시(점선 마름모) */
function drawSpot(g: Element, s: DecorSpot) {
  const P = (u: number, v: number) => iso(s.gx + u, s.gy + v)
  const k = 0.16
  poly(g, [P(k, k), P(1 - k, k), P(1 - k, 1 - k), P(k, 1 - k)], 'rgba(255,253,248,0.55)', {
    class: 'spot',
    'data-testid': `spot-${s.at}-${s.col}-${s.row}`,
    stroke: '#7bb88f',
    'stroke-width': 1.3,
    'stroke-dasharray': '3 2.5',
  })
}

/** 둥근 주민 하나. from ↔ to 한 칸 길을 천천히 오가며 통통 걷는다 */
function drawResident(g: Element, walk: Walk) {
  const { resident: r, from, to } = walk
  const a = iso(from.gx, from.gy)
  const b = iso(to.gx, to.gy)
  const dx = b.x - a.x
  const seed = hash(r.id)
  const face = dx >= 0 ? 1 : -1
  const res = el('g', {
    class: 'resident',
    'data-testid': `resident-${r.id}`,
    'data-resident': r.id,
    style: `--dx:${dx.toFixed(1)}px;--dy:${(b.y - a.y).toFixed(1)}px;--dur:${9 + (seed % 5)}s;--lag:-${seed % 9}s;--f0:${face};--f1:${-face}`,
  }, g)
  const stroll = el('g', { class: 'stroll' }, res)
  // 누르기 쉬운 넓은 투명 영역(가까이 보면 손가락보다 크다)
  el('ellipse', { cx: a.x, cy: a.y - 8, rx: 13, ry: 12, fill: 'transparent', class: 'hit' }, stroll)
  el('ellipse', { cx: a.x, cy: a.y + 0.5, rx: 6, ry: 2.4, fill: 'rgba(90,70,54,0.16)' }, stroll)
  const turn = el('g', { class: 'face' }, stroll)
  const body = el('g', { class: 'hop', style: `animation-delay:-${(seed % 7) / 10}s` }, turn)
  const c = { x: a.x, y: a.y - 7.5 }
  const ear = shade(r.color, -0.08)
  if (r.ears === 'bunny') {
    for (const s of [-1, 1]) {
      el('ellipse', { cx: c.x + s * 3, cy: c.y - 9, rx: 1.9, ry: 4.6, fill: ear, stroke: LINE, 'stroke-width': 0.8, transform: `rotate(${s * 10} ${c.x + s * 3} ${c.y - 9})` }, body)
      el('ellipse', { cx: c.x + s * 3, cy: c.y - 9, rx: 0.8, ry: 3, fill: '#ffb8c6', transform: `rotate(${s * 10} ${c.x + s * 3} ${c.y - 9})` }, body)
    }
  } else if (r.ears === 'bear') {
    for (const s of [-1, 1]) el('circle', { cx: c.x + s * 4.6, cy: c.y - 5, r: 2.3, fill: ear, stroke: LINE, 'stroke-width': 0.8 }, body)
  } else if (r.ears === 'cat') {
    for (const s of [-1, 1]) el('path', { d: `M${c.x + s * 1.8} ${c.y - 6} l${s * 3} -4.5 l${s * 2} 5.5 z`, fill: ear, stroke: LINE, 'stroke-width': 0.8, 'stroke-linejoin': 'round' }, body)
  }
  // 발 두 개와 동그란 몸
  for (const s of [-1, 1]) el('ellipse', { cx: c.x + s * 2.6, cy: a.y - 0.6, rx: 2, ry: 1.2, fill: shade(r.color, -0.15), stroke: LINE, 'stroke-width': 0.6 }, body)
  el('circle', { cx: c.x, cy: c.y, r: 6.6, fill: r.color, stroke: LINE }, body)
  el('ellipse', { cx: c.x - 2.2, cy: c.y - 2.8, rx: 2, ry: 1.3, fill: 'rgba(255,255,255,0.7)' }, body)
  if (r.ears === 'leaf') {
    el('path', { d: `M${c.x} ${c.y - 6.4} q-0.4 -2.6 0.6 -3.6`, fill: 'none', stroke: '#6bb879', 'stroke-width': 0.9 }, body)
    el('path', { d: `M${c.x + 0.6} ${c.y - 9.8} q3.6 -1.8 5 0.6 q-3 2.2 -5 -0.6 z`, fill: '#9ed39b', stroke: LINE, 'stroke-width': 0.6 }, body)
  } else if (r.ears === 'none') {
    el('path', { d: `M${c.x - 1} ${c.y - 6.4} q1.6 -3.6 3.6 -1.4`, fill: 'none', stroke: shade(r.color, -0.3), 'stroke-width': 1, 'stroke-linecap': 'round' }, body)
  }
  // 얼굴은 걷는 쪽(오른쪽)을 본다
  for (const ex of [0.6, 3.6]) el('circle', { cx: c.x + ex, cy: c.y - 0.4, r: 0.75, fill: '#5a4636' }, body)
  el('path', { d: `M${c.x + 1.4} ${c.y + 1.6} q0.7 0.7 1.4 0`, fill: 'none', stroke: '#5a4636', 'stroke-width': 0.6, 'stroke-linecap': 'round' }, body)
  for (const ex of [-1.2, 5]) el('ellipse', { cx: c.x + ex, cy: c.y + 1.3, rx: 1.3, ry: 0.8, fill: '#ffaab8', opacity: 0.8 }, body)
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
  /** 얻은 명소(누적 날 수로 계산) */
  landmarks?: Landmark[]
  /** 다음 명소 팻말. 모두 얻었으면 없다 */
  sign?: { landmark: Landmark; lines: [string, string] } | null
  /** 주민이 걷는 길(누적 날 수로 계산) */
  walks?: Walk[]
  /** 사용자가 놓은 꾸밈 소품(마을 칸 좌표가 붙은 것) */
  decors?: (PlacedDecor & DecorSpot & { index: number })[]
  /** 꾸미기 중: 소품을 놓을 수 있는 빈 칸 */
  spots?: DecorSpot[]
  /** 꾸미기 중 고른(옮기려는) 소품의 저장 속 순서 */
  picked?: number
  /** 오늘 열리는 잔치(날짜로 계산). 광장에 깃발 줄과 장식을 세운다 */
  festival?: FestivalId
}

/** 마을 전체를 그린다. 뒤(위)에 있는 것부터 앞(아래)으로 */
export function drawVillage(svg: SVGSVGElement, village: Village, opt: DrawOptions) {
  svg.replaceChildren()
  const ground = el('g', { class: 'ground' }, svg)
  const delay = `--delay:${opt.buildDelay ?? 0}ms`
  const things = el('g', { class: 'things', style: delay }, svg)
  // 굴뚝 연기는 집 위 따로 된 층에 둔다(움직이는 연기가 집 모양을 흔들지 않게)
  const smokes = el('g', { class: 'smokes' }, svg)
  const fx = el('g', { class: 'fx', style: delay }, svg)
  const labels = el('g', { class: 'labels' }, svg)
  // 땅: 뒤 구역부터. 광장은 첫 구역 바로 아래(구역 자리 0,1)라 그 깊이에 끼운다
  const slabs = [
    ...village.blocks.map((b) => ({ depth: b.bx + b.by, draw: () => drawSlab(ground, labels, b) })),
    { depth: 1, draw: () => drawPlazaGround(ground, labels) },
  ].sort((a, b) => a.depth - b.depth)
  for (const s of slabs) s.draw()

  type Item = { depth: number; draw: () => void }
  const items: Item[] = []
  // 광장: 명소, 다음 명소 팻말, 모서리 나무
  for (const l of opt.landmarks ?? []) {
    const s = landmarkSpot(l)
    items.push({ depth: s.gx + s.gy, draw: () => drawLandmark(things, l) })
  }
  if (opt.sign) {
    const { landmark, lines } = opt.sign
    const s = landmarkSpot(landmark)
    items.push({ depth: s.gx + s.gy, draw: () => drawNextSign(things, landmark, lines) })
  }
  if (opt.festival) festivalItems(items, things, opt.festival)
  for (const w of opt.walks ?? []) items.push({ depth: w.depth, draw: () => drawResident(things, w) })
  // 소품은 그 칸의 집·나무와 같은 깊이에. 소품을 놓은 숲 칸에는 나무를 그리지 않는다
  const decorAt = new Set<string>()
  for (const d of opt.decors ?? []) {
    decorAt.add(`${d.gx},${d.gy}`)
    items.push({ depth: d.gx + d.gy, draw: () => drawDecor(things, d, d.index === opt.picked) })
  }
  // 빈 칸 표시는 그 칸의 나무보다 먼저(뒤에) 그려 땅에 깔린 것처럼 보인다
  for (const s of opt.spots ?? []) items.push({ depth: s.gx + s.gy - 0.5, draw: () => drawSpot(things, s) })
  for (const [col, row] of PLAZA_TREES) {
    const gx = PLAZA.gx + col
    const gy = PLAZA.gy + row
    const seed = hash(`plaza:${col}:${row}`)
    items.push({ depth: gx + gy, draw: () => drawTree(things, gx, gy, seasonOf(opt.today.slice(0, 7)), seed) })
  }
  for (const block of village.blocks) {
    const season = seasonOf(block.month)
    // 그달의 날이 아닌 칸은 나무숲(집 바로 앞은 꽃·풀), 지난 빈 날은 가끔 꽃
    for (const s of blockScenery(block, opt.today)) {
      const { gx, gy, seed } = s
      if (s.kind === 'flowers') items.push({ depth: gx + gy, draw: () => drawFlowers(ground, gx, gy, seed) })
      // 소품을 놓은 숲 칸에는 나무를 그리지 않는다
      else if (!decorAt.has(`${gx},${gy}`)) items.push({ depth: gx + gy, draw: () => drawTree(things, gx, gy, season, seed) })
    }
    for (const lot of block.lots) {
      const depth = lot.gx + lot.gy
      if (lot.entry) {
        const entry = lot.entry
        const isNew = entry.date === opt.newDate
        items.push({
          depth,
          draw: () => {
            const H = drawHouse(things, lot, entry, isNew, smokes)
            if (entry.treasured) drawTreasureFlag(things, lot, entry.date)
            if (isNew) drawBuildFx(fx, lot, H)
          },
        })
      } else if (lot.date === opt.today) {
        items.push({ depth, draw: () => drawTodaySpot(things, lot.gx, lot.gy) })
      }
    }
  }
  items.sort((a, b) => a.depth - b.depth)
  for (const it of items) it.draw()
}

type Box = { x: number; y: number; width: number; height: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/**
 * 그 날 집 앞(나중에 그린 것)에서 집을 가리는 나무·주민을 잠깐 옅게 한다. 옅게 한 수를 돌려준다.
 * 주민은 한 칸 길을 오가므로 걷는 길 전체가 집과 겹치는지 본다. 그림만 바꾸고 아무것도 저장하지 않는다
 */
export function veilFront(svg: SVGSVGElement, date: string): number {
  unveil(svg)
  const house = svg.querySelector<SVGGraphicsElement>(`.house[data-date="${date}"]`)
  if (!house) return 0
  const box = house.getBBox()
  let count = 0
  for (const node of svg.querySelectorAll<SVGGraphicsElement>('.things .tree, .things .resident')) {
    if (!(house.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) continue
    const b = node.getBBox()
    const dx = parseFloat(node.style.getPropertyValue('--dx')) || 0
    const dy = parseFloat(node.style.getPropertyValue('--dy')) || 0
    const path = { x: b.x + Math.min(0, dx), y: b.y + Math.min(0, dy), width: b.width + Math.abs(dx), height: b.height + Math.abs(dy) }
    if (!overlaps(box, path)) continue
    node.classList.add('veiled')
    count++
  }
  return count
}

/** 옅게 한 나무·주민을 원래대로 */
export function unveil(svg: SVGSVGElement) {
  for (const node of svg.querySelectorAll('.veiled')) node.classList.remove('veiled')
}

/** 구역 하나가 화면에 들어오는 viewBox */
export function blockView(block: Block): { x: number; y: number; w: number; h: number } {
  const x0 = block.bx * (BLOCK_W + ROAD) - ROAD / 2
  const y0 = block.by * (BLOCK_H + ROAD) - ROAD / 2
  const left = iso(x0, y0 + BLOCK_H + ROAD).x
  const right = iso(x0 + BLOCK_W + ROAD, y0).x
  // 위쪽은 뒤쪽 모서리 팻말판까지 담는다
  const top = iso(x0, y0).y - SIGN_LIFT - 18
  const bottom = iso(x0 + BLOCK_W + ROAD, y0 + BLOCK_H + ROAD).y + SLAB_DEPTH
  const pad = 14
  return { x: left - pad, y: top - pad, w: right - left + pad * 2, h: bottom - top + pad * 2 }
}
