import { buildingInfo, type BuildingId } from '../core/building'
import { SIGNATURE, type Furniture, type Room } from '../core/interior'
import type { Season } from '../core/season'

/** 방 그림 크기(viewBox). 읽기 창 너비에 맞춰 늘어난다 */
export const ROOM_W = 320
export const ROOM_H = 124
const FLOOR_Y = 86
const LINE = '#8a6a50'
const S = `stroke="${LINE}" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"`

/** 가구 자리: 왼쪽 벽 앞(대표 가구), 오른쪽 벽 앞, 오른쪽 앞(조금 작게) */
const SLOTS = [
  { x: 60, y: 104, k: 1.2 },
  { x: 280, y: 104, k: 1.2 },
  { x: 222, y: 117, k: 1 },
]

const WIN = { x: 134, y: 12, w: 52, h: 48 }

function wall(color: string): string {
  // 벽지: 옅은 흰 점무늬
  let dots = ''
  for (let y = 10; y < FLOOR_Y - 4; y += 16) {
    for (let x = (y / 16) % 2 ? 18 : 10; x < ROOM_W; x += 16) dots += `<circle cx="${x}" cy="${y}" r="1.6"/>`
  }
  return `<rect x="0" y="0" width="${ROOM_W}" height="${FLOOR_Y}" fill="${color}"/>
    <g fill="#ffffff" opacity="0.55">${dots}</g>`
}

function floor(kind: Room['floor']): string {
  const h = ROOM_H - FLOOR_Y
  if (kind === 'tile') {
    let tiles = ''
    for (let x = 0, i = 0; x < ROOM_W; x += 20, i++) {
      for (let y = FLOOR_Y, j = 0; y < ROOM_H; y += 13, j++) {
        if ((i + j) % 2) tiles += `<rect x="${x}" y="${y}" width="20" height="13"/>`
      }
    }
    return `<rect x="0" y="${FLOOR_Y}" width="${ROOM_W}" height="${h}" fill="#f4ebdc"/>
      <g fill="#e6d6bd">${tiles}</g>`
  }
  let planks = ''
  for (let y = FLOOR_Y + 9; y < ROOM_H; y += 9) planks += `<line x1="0" y1="${y}" x2="${ROOM_W}" y2="${y}"/>`
  const wood = `<rect x="0" y="${FLOOR_Y}" width="${ROOM_W}" height="${h}" fill="#e8cba1"/>
    <g stroke="#d3b084" stroke-width="1">${planks}</g>`
  if (kind === 'wood') return wood
  // 러그: 나무 바닥 위 가운데 둥근 깔개
  return `${wood}
    <ellipse cx="160" cy="${FLOOR_Y + 22}" rx="74" ry="12" fill="#f3c9bd" ${S}/>
    <ellipse cx="160" cy="${FLOOR_Y + 22}" rx="60" ry="8" fill="none" stroke="#fbe7df" stroke-width="2" stroke-dasharray="4 3"/>`
}

const VIEW: Record<Season, { sky: string; ground: string; trees: string[]; bits?: string }> = {
  spring: { sky: '#d6ecf7', ground: '#c7e3a8', trees: ['#f6c6d4', '#f9d9e2'], bits: '#f3b3c6' },
  summer: { sky: '#cfe8f6', ground: '#a9d68f', trees: ['#8fca84', '#a7d79a'] },
  autumn: { sky: '#e4ecf2', ground: '#e3cf98', trees: ['#f0b072', '#e48f6b'], bits: '#e9a160' },
  winter: { sky: '#e3ebf2', ground: '#ffffff', trees: ['#eef3f6', '#dfe8ee'], bits: '#ffffff' },
}

/** 창: 둥근 위쪽, 창밖은 그날 계절, 양옆에 기분 색 커튼 */
function window_(view: Season, curtain: string): string {
  const { x, y, w, h } = WIN
  const v = VIEW[view]
  const r = w / 2
  const shape = `M${x} ${y + h} V${y + r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h} Z`
  const gy = y + h - 10
  let bits = ''
  if (v.bits) {
    const at = [[8, 10], [20, 22], [34, 14], [44, 28], [14, 32], [28, 36]]
    bits = at.map(([dx, dy]) => `<circle cx="${x + dx}" cy="${y + dy}" r="${view === 'winter' ? 1.3 : 1.6}" fill="${v.bits}"/>`).join('')
  }
  const tree = (cx: number, c: string, s: number) =>
    `<rect x="${cx - 1.5}" y="${gy - 6 * s}" width="3" height="${8 * s}" fill="#b08a68"/>
     <circle cx="${cx}" cy="${gy - 10 * s}" r="${8 * s}" fill="${c}" ${S}/>`
  const sun = view === 'summer' ? `<circle cx="${x + w - 12}" cy="${y + 14}" r="5" fill="#ffe08a"/>` : ''
  const scene = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${v.sky}"/>${sun}
    <path d="M${x} ${gy} q${w / 2} -6 ${w} 0 V${y + h} H${x} Z" fill="${v.ground}"/>
    ${tree(x + 15, v.trees[0], 1)}${tree(x + 37, v.trees[1], 0.8)}${bits}`
  // 커튼: 위에서 늘어져 양옆으로 묶인 모양
  const cw = 15
  const left = `M${x - 9} ${y - 3} H${x + cw - 4} Q${x + 2} ${y + 26} ${x + 2} ${y + h + 4} H${x - 9} Z`
  const right = `M${x + w + 9} ${y - 3} H${x + w - cw + 4} Q${x + w - 2} ${y + 26} ${x + w - 2} ${y + h + 4} H${x + w + 9} Z`
  return `<g data-testid="room-window" data-view="${view}">
    <clipPath id="room-win-clip"><path d="${shape}"/></clipPath>
    <g clip-path="url(#room-win-clip)">${scene}</g>
    <path d="${shape}" fill="none" stroke="${LINE}" stroke-width="2.4"/>
    <path d="M${x + r} ${y} V${y + h} M${x} ${y + r + 4} H${x + w}" stroke="${LINE}" stroke-width="1.6"/>
    <rect x="${x - 6}" y="${y + h}" width="${w + 12}" height="5" rx="2.5" fill="#f2dfc4" ${S}/>
    <line x1="${x - 14}" y1="${y - 4}" x2="${x + w + 14}" y2="${y - 4}" stroke="${LINE}" stroke-width="2" stroke-linecap="round"/>
    <g data-testid="room-curtain" fill="${curtain}" ${S}><path d="${left}"/><path d="${right}"/></g>
  </g>`
}

/** 받침 탁자(작은 가구를 올린다). 윗면 높이를 돌려준다 */
function table(): string {
  return `<rect x="-16" y="-22" width="32" height="5" rx="2.5" fill="#d9b48a" ${S}/>
    <path d="M-12 -17 V0 M12 -17 V0" stroke="${LINE}" stroke-width="2.2" stroke-linecap="round"/>`
}

/** 아늑한 가구 8가지. (0,0)이 바닥 가운데다 */
const COZY_ART: Partial<Record<Furniture, string>> = {
  sofa: `<rect x="-30" y="-30" width="60" height="20" rx="8" fill="#e9b8a8" ${S}/>
    <rect x="-26" y="-14" width="52" height="10" rx="4" fill="#f1c9ba" ${S}/>
    <rect x="-34" y="-20" width="10" height="18" rx="5" fill="#e9b8a8" ${S}/>
    <rect x="24" y="-20" width="10" height="18" rx="5" fill="#e9b8a8" ${S}/>
    <rect x="-16" y="-26" width="12" height="10" rx="4" fill="#fbe7a8" ${S}/>
    <path d="M-28 -2 v3 M28 -2 v3" stroke="${LINE}" stroke-width="2" stroke-linecap="round"/>`,
  lamp: `<circle cx="0" cy="-58" r="16" fill="#fff3c4" opacity="0.6"/>
    <path d="M0 -50 V-2" stroke="${LINE}" stroke-width="2.2" stroke-linecap="round"/>
    <ellipse cx="0" cy="-1" rx="10" ry="3" fill="#c9a37c" ${S}/>
    <path d="M-12 -50 L-7 -66 H7 L12 -50 Z" fill="#f7d98b" ${S}/>`,
  plant: `<path d="M-11 -18 H11 L8 0 H-8 Z" fill="#e6a483" ${S}/>
    <ellipse cx="-9" cy="-30" rx="6" ry="12" transform="rotate(-25 -9 -30)" fill="#93c98a" ${S}/>
    <ellipse cx="9" cy="-30" rx="6" ry="12" transform="rotate(25 9 -30)" fill="#93c98a" ${S}/>
    <ellipse cx="0" cy="-36" rx="6" ry="14" fill="#a7d79a" ${S}/>`,
  clock: `<rect x="-11" y="-62" width="22" height="62" rx="9" fill="#d9b48a" ${S}/>
    <circle cx="0" cy="-48" r="7.5" fill="#fffaf0" ${S}/>
    <path d="M0 -48 V-53 M0 -48 H3.5" stroke="${LINE}" stroke-width="1.2" stroke-linecap="round"/>
    <rect x="-5" y="-34" width="10" height="24" rx="5" fill="#f2dfc4" ${S}/>
    <circle cx="0" cy="-16" r="3" fill="#f0cf7a" ${S}/>`,
  frame: `${table()}<circle cx="0" cy="-27" r="4" fill="#a7d79a" ${S}/>
    <rect x="-16" y="-70" width="32" height="24" rx="4" fill="#fffaf0" ${S} stroke-width="2"/>
    <path d="M-12 -50 L-4 -60 L2 -54 L6 -58 L12 -50 Z" fill="#a7d79a"/>
    <circle cx="7" cy="-64" r="2.5" fill="#ffd27a"/>`,
  radio: `${table()}<rect x="-14" y="-38" width="28" height="16" rx="5" fill="#f3c9bd" ${S}/>
    <circle cx="-5" cy="-30" r="4.5" fill="#fffaf0" ${S}/>
    <path d="M4 -33 h6 M4 -29 h6" stroke="${LINE}" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M8 -38 L14 -48" stroke="${LINE}" stroke-width="1.2" stroke-linecap="round"/>`,
  chair: `<path d="M-14 -46 Q-14 -50 -10 -50 H8 Q12 -50 12 -46 L10 -22 H-12 Z" fill="#c6dfe9" ${S}/>
    <rect x="-16" y="-24" width="32" height="7" rx="3.5" fill="#d9b48a" ${S}/>
    <path d="M-12 -17 L-14 -1 M12 -17 L14 -1" stroke="${LINE}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M-20 0 Q0 6 20 0" fill="none" stroke="${LINE}" stroke-width="2" stroke-linecap="round"/>`,
  teapot: `${table()}<ellipse cx="-3" cy="-30" rx="9" ry="8" fill="#dcefe2" ${S}/>
    <path d="M6 -32 q6 -2 7 -7" fill="none" stroke="${LINE}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M-12 -33 q-4 1 -3 6" fill="none" stroke="${LINE}" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="-3" cy="-39" r="2" fill="#f0cf7a" ${S}/>
    <rect x="7" y="-27" width="7" height="5" rx="2" fill="#fffaf0" ${S}/>`,
}

const BUILDING_OF = Object.fromEntries(Object.entries(SIGNATURE).map(([b, f]) => [f, b])) as Partial<Record<Furniture, BuildingId>>

/** 건물 대표 가구 그림이 아직 없을 때: 둥근 받침대 위에 건물 표시를 올린다 */
function signatureStand(item: Furniture): string {
  const id = BUILDING_OF[item]
  const icon = id ? buildingInfo(id).icon : '🏠'
  return `<rect x="-20" y="-26" width="40" height="26" rx="8" fill="#f2dfc4" ${S}/>
    <circle cx="0" cy="-44" r="16" fill="#fffaf0" ${S}/>
    <text x="0" y="-38" text-anchor="middle" font-size="18">${icon}</text>`
}

function furniture(item: Furniture, slot: (typeof SLOTS)[number]): string {
  const art = COZY_ART[item] ?? signatureStand(item)
  const shadow = `<ellipse cx="0" cy="1" rx="24" ry="3.5" fill="#000" opacity="0.08"/>`
  return `<g class="room-furn" data-furn="${item}" transform="translate(${slot.x} ${slot.y}) scale(${slot.k})">${shadow}${art}</g>`
}

/** 그날 방 그림(SVG 글). 그림은 모두 코드로 그린 도형이고, 글은 담지 않는다 */
export function roomSvg(room: Room): string {
  return `<svg class="reader-room" data-testid="reader-room" viewBox="0 0 ${ROOM_W} ${ROOM_H}"
      data-wall="${room.wall}" data-floor="${room.floor}" role="img" aria-label="그날의 방">
    ${wall(room.wall)}
    ${window_(room.view, room.curtain)}
    <rect x="0" y="${FLOOR_Y - 4}" width="${ROOM_W}" height="5" fill="#f2dfc4" stroke="${LINE}" stroke-width="1"/>
    ${floor(room.floor)}
    ${furniture(room.items[0], SLOTS[0])}
    ${furniture(room.items[1], SLOTS[1])}
    ${furniture(room.items[2], SLOTS[2])}
  </svg>`
}
