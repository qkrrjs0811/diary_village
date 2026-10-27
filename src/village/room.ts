import { buildingInfo, type BuildingId } from '../core/building'
import { roomLight, SIGNATURE, type Furniture, type Room, type RoomLight } from '../core/interior'
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

/** 창밖 하늘: 낮은 계절 하늘, 저녁은 노을과 지는 해, 밤은 달과 별 */
function windowSky(view: Season, light: RoomLight): string {
  const { x, y, w, h } = WIN
  if (!light.sky) {
    const sun = view === 'summer' ? `<circle cx="${x + w - 12}" cy="${y + 14}" r="5" fill="#ffe08a"/>` : ''
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${VIEW[view].sky}"/>${sun}`
  }
  const [top, bottom] = light.sky
  const sky = `<linearGradient id="room-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#room-sky)"/>`
  if (!light.stars) return `${sky}<circle data-testid="room-sunset" cx="${x + w - 13}" cy="${y + 15}" r="6" fill="#ffb27a" ${S}/>`
  const stars = [[8, 18], [22, 9], [30, 24], [44, 16], [14, 28]]
    .map(([dx, dy], i) => `<circle cx="${x + dx}" cy="${y + dy}" r="${i % 2 ? 0.9 : 1.2}" fill="#fff6d0"/>`)
    .join('')
  // 초승달: 노란 원에 하늘 색 원을 겹친다
  const mx = x + w - 13
  const my = y + 13
  return `${sky}<g data-testid="room-stars">${stars}
    <circle cx="${mx}" cy="${my}" r="5.5" fill="#fff1b8"/><circle cx="${mx + 2.6}" cy="${my - 1.6}" r="4.8" fill="${top}"/></g>`
}

/** 창: 둥근 위쪽, 창밖은 그날 계절, 양옆에 기분 색 커튼 */
function window_(view: Season, curtain: string, light: RoomLight): string {
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
  // 저녁·밤엔 창밖 땅과 나무도 그때 빛으로 살짝 물든다
  const dusk = light.sky ? `<rect x="${x}" y="${gy - 20}" width="${w}" height="${h}" fill="${light.sky[0]}" opacity="${light.stars ? 0.45 : 0.25}"/>` : ''
  const scene = `${windowSky(view, light)}
    <path d="M${x} ${gy} q${w / 2} -6 ${w} 0 V${y + h} H${x} Z" fill="${v.ground}"/>
    ${tree(x + 15, v.trees[0], 1)}${tree(x + 37, v.trees[1], 0.8)}${bits}${dusk}`
  // 커튼: 위에서 늘어져 양옆으로 묶인 모양
  const cw = 15
  const left = `M${x - 9} ${y - 3} H${x + cw - 4} Q${x + 2} ${y + 26} ${x + 2} ${y + h + 4} H${x - 9} Z`
  const right = `M${x + w + 9} ${y - 3} H${x + w - cw + 4} Q${x + w - 2} ${y + 26} ${x + w - 2} ${y + h + 4} H${x + w + 9} Z`
  return `<g data-testid="room-window" data-view="${view}" data-time="${light.part}">
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

/** 낮은 장(대표 가구 몇 가지를 올린다). 윗면은 y=-26 */
function cabinet(fill = '#e8c9a4'): string {
  return `<rect x="-22" y="-26" width="44" height="26" rx="5" fill="${fill}" ${S}/>
    <path d="M0 -22 V-4" stroke="${LINE}" stroke-width="1"/>
    <circle cx="-4" cy="-13" r="1.4" fill="${LINE}"/><circle cx="4" cy="-13" r="1.4" fill="${LINE}"/>`
}

/** 건물 16종 대표 가구. (0,0)이 바닥 가운데다 */
const SIGNATURE_ART: Partial<Record<Furniture, string>> = {
  coffeeMachine: `${cabinet()}
    <rect x="-14" y="-58" width="28" height="32" rx="6" fill="#c6dfe9" ${S}/>
    <rect x="-9" y="-52" width="18" height="8" rx="3" fill="#fffaf0" ${S}/>
    <path d="M-3 -44 v5 M3 -44 v5" stroke="${LINE}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M-6 -36 H6 L5 -28 H-5 Z" fill="#fffaf0" ${S}/>
    <path d="M-2 -62 q-3 -4 0 -8 M3 -62 q-3 -4 0 -8" fill="none" stroke="#c9b8a8" stroke-width="1.2" stroke-linecap="round"/>`,
  bookshelf: `<rect x="-22" y="-62" width="44" height="62" rx="5" fill="#d9b48a" ${S}/>
    <path d="M-18 -42 H18 M-18 -22 H18" stroke="${LINE}" stroke-width="1.2"/>
    <g ${S}>
      <rect x="-17" y="-57" width="6" height="15" rx="1.5" fill="#f3c9bd"/><rect x="-10" y="-55" width="6" height="13" rx="1.5" fill="#c6dfe9"/>
      <rect x="-3" y="-57" width="6" height="15" rx="1.5" fill="#f7d98b"/><rect x="5" y="-54" width="5" height="12" rx="1.5" fill="#a7d79a" transform="rotate(12 7 -48)"/>
      <rect x="-17" y="-37" width="7" height="15" rx="1.5" fill="#a7d79a"/><rect x="-9" y="-36" width="6" height="14" rx="1.5" fill="#e7def2"/>
      <rect x="4" y="-37" width="6" height="15" rx="1.5" fill="#f3c9bd"/><rect x="11" y="-35" width="6" height="13" rx="1.5" fill="#c6dfe9"/>
      <rect x="-17" y="-17" width="14" height="5" rx="1.5" fill="#f7d98b"/><rect x="-16" y="-12" width="12" height="5" rx="1.5" fill="#c6dfe9"/>
    </g>
    <circle cx="10" cy="-12" r="5" fill="#93c98a" ${S}/>`,
  dumbbell: `<rect x="-24" y="-8" width="48" height="8" rx="4" fill="#c6dfe9" ${S}/>
    <path d="M-10 -24 H10" stroke="${LINE}" stroke-width="3" stroke-linecap="round"/>
    <rect x="-18" y="-32" width="8" height="16" rx="3" fill="#f3c9bd" ${S}/>
    <rect x="10" y="-32" width="8" height="16" rx="3" fill="#f3c9bd" ${S}/>
    <circle cx="14" cy="-44" r="8" fill="#fffaf0" ${S}/>
    <path d="M7 -47 Q14 -42 21 -47 M7 -41 Q14 -46 21 -41" fill="none" stroke="#e48f6b" stroke-width="1"/>`,
  catTower: `<rect x="-20" y="-6" width="40" height="6" rx="3" fill="#d9b48a" ${S}/>
    <rect x="-12" y="-46" width="7" height="40" fill="#f2dfc4" ${S}/>
    <rect x="6" y="-28" width="7" height="22" fill="#f2dfc4" ${S}/>
    <path d="M-11 -40 h5 M-11 -32 h5 M-11 -24 h5 M-11 -16 h5" stroke="#d3b084" stroke-width="1"/>
    <rect x="0" y="-32" width="20" height="5" rx="2.5" fill="#e7def2" ${S}/>
    <rect x="-20" y="-50" width="22" height="5" rx="2.5" fill="#e7def2" ${S}/>
    <ellipse cx="-9" cy="-55" rx="8" ry="5" fill="#f7d98b" ${S}/>
    <path d="M-14 -58 l1 -5 l3 3 M-6 -59 l2 -4 l2 4" fill="#f7d98b" ${S}/>
    <circle cx="16" cy="-22" r="3" fill="#f3c9bd" ${S}/>`,
  dogBed: `<ellipse cx="0" cy="-8" rx="28" ry="10" fill="#f3c9bd" ${S}/>
    <ellipse cx="0" cy="-10" rx="20" ry="6" fill="#fbe7df" ${S}/>
    <ellipse cx="-2" cy="-14" rx="11" ry="6" fill="#e8cba1" ${S}/>
    <circle cx="9" cy="-17" r="5.5" fill="#e8cba1" ${S}/>
    <path d="M6 -21 q-3 4 0 7" fill="#c9a37c" ${S}/>
    <path d="M18 -26 q4 -3 6 0 q2 3 -2 4 q-4 1 -4 -4 Z" fill="#fffaf0" ${S}/>`,
  vase: `<path d="M-14 -26 H14 L12 0 H-12 Z" fill="#e8c9a4" ${S}/>
    <path d="M-5 -26 q-6 -8 0 -14 h10 q6 6 0 14 Z" fill="#c6dfe9" ${S}/>
    <path d="M0 -40 V-56 M-2 -40 L-10 -52 M2 -40 L10 -50" stroke="#7fb27a" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="0" cy="-60" r="5" fill="#f6c6d4" ${S}/>
    <circle cx="-11" cy="-55" r="4.5" fill="#f7d98b" ${S}/>
    <circle cx="11" cy="-53" r="4.5" fill="#e7def2" ${S}/>
    <circle cx="0" cy="-60" r="1.6" fill="#ffe08a"/>`,
  oven: `<rect x="-20" y="-54" width="40" height="54" rx="8" fill="#f3c9bd" ${S}/>
    <rect x="-14" y="-38" width="28" height="22" rx="5" fill="#fbe7c4" ${S}/>
    <path d="M-10 -24 q10 -6 20 0" fill="none" stroke="#f0b072" stroke-width="2" stroke-linecap="round"/>
    <path d="M-10 -42 H10" stroke="${LINE}" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="-10" cy="-48" r="2.4" fill="#fffaf0" ${S}/><circle cx="0" cy="-48" r="2.4" fill="#fffaf0" ${S}/><circle cx="10" cy="-48" r="2.4" fill="#fffaf0" ${S}/>
    <ellipse cx="-4" cy="-60" rx="9" ry="5" fill="#e8b878" ${S}/>
    <path d="M-9 -61 l3 -2 M-5 -62 l3 -2 M-1 -62 l3 -2" stroke="${LINE}" stroke-width="0.9"/>`,
  shipModel: `${cabinet('#c6dfe9')}
    <path d="M-16 -38 H16 L10 -28 H-10 Z" fill="#d9b48a" ${S}/>
    <path d="M0 -38 V-64" stroke="${LINE}" stroke-width="1.6"/>
    <path d="M2 -62 L14 -42 H2 Z" fill="#fffaf0" ${S}/>
    <path d="M-2 -58 L-12 -42 H-2 Z" fill="#fffaf0" ${S}/>
    <path d="M0 -64 l6 2 l-6 2" fill="#f3c9bd"/>
    <path d="M-6 -28 v2 M6 -28 v2" stroke="${LINE}" stroke-width="1.6"/>`,
  piano: `<rect x="-26" y="-54" width="52" height="34" rx="5" fill="#c9a37c" ${S}/>
    <rect x="-24" y="-28" width="48" height="8" rx="1.5" fill="#fffaf0" ${S}/>
    <path d="M-18 -28 v5 M-12 -28 v5 M-4 -28 v5 M2 -28 v5 M8 -28 v5 M16 -28 v5" stroke="${LINE}" stroke-width="2"/>
    <path d="M-22 -20 V0 M22 -20 V0" stroke="${LINE}" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="-10" y="-50" width="20" height="13" rx="2" fill="#fffaf0" ${S}/>
    <path d="M-6 -46 h12 M-6 -42 h12" stroke="#c9b8a8" stroke-width="0.8"/>
    <path d="M18 -58 v-8 l5 2" fill="none" stroke="${LINE}" stroke-width="1.2" stroke-linecap="round"/><circle cx="16.5" cy="-58" r="2" fill="${LINE}"/>`,
  projector: `<path d="M-12 -24 L-16 0 M12 -24 L16 0 M0 -24 V0" stroke="${LINE}" stroke-width="2" stroke-linecap="round"/>
    <rect x="-16" y="-40" width="28" height="18" rx="5" fill="#e7def2" ${S}/>
    <rect x="12" y="-36" width="8" height="10" rx="2" fill="#c6dfe9" ${S}/>
    <circle cx="-8" cy="-48" r="8" fill="#f2dfc4" ${S}/><circle cx="6" cy="-48" r="8" fill="#f2dfc4" ${S}/>
    <circle cx="-8" cy="-48" r="2" fill="${LINE}"/><circle cx="6" cy="-48" r="2" fill="${LINE}"/>
    <path d="M20 -31 L34 -40 V-22 Z" fill="#fff3c4" opacity="0.7"/>`,
  pot: `<rect x="-22" y="-22" width="44" height="22" rx="4" fill="#fffaf0" ${S}/>
    <rect x="-18" y="-16" width="16" height="10" rx="2" fill="#f2dfc4" ${S}/>
    <circle cx="10" cy="-11" r="3" fill="#f3c9bd" ${S}/>
    <ellipse cx="-6" cy="-24" rx="10" ry="2.5" fill="#c9a37c" ${S}/>
    <path d="M-16 -40 H8 V-30 Q8 -24 2 -24 H-10 Q-16 -24 -16 -30 Z" fill="#e48f6b" ${S}/>
    <path d="M-20 -38 h4 M8 -38 h4" stroke="${LINE}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M-10 -44 q-3 -4 0 -8 M-2 -44 q-3 -4 0 -8" fill="none" stroke="#c9b8a8" stroke-width="1.2" stroke-linecap="round"/>`,
  picnicBasket: `<path d="M-14 -24 Q0 -46 14 -24" fill="none" stroke="#c9a37c" stroke-width="3" stroke-linecap="round"/>
    <path d="M-20 -24 H20 L16 0 H-16 Z" fill="#e8cba1" ${S}/>
    <path d="M-18 -16 H18 M-17 -8 H17 M-8 -24 L-6 0 M4 -24 L4 0" stroke="#d3b084" stroke-width="1"/>
    <path d="M-20 -24 H20 L18 -18 L14 -22 L10 -18 L6 -22 L2 -18 L-2 -22 L-6 -18 L-10 -22 L-14 -18 L-18 -22 Z" fill="#f3b3c6" ${S}/>
    <circle cx="8" cy="-30" r="5" fill="#f08a7a" ${S}/><path d="M8 -35 l2 -3" stroke="#7fb27a" stroke-width="1.4" stroke-linecap="round"/>`,
  desk: `<rect x="-26" y="-30" width="52" height="6" rx="3" fill="#d9b48a" ${S}/>
    <path d="M-22 -24 V0 M22 -24 V0" stroke="${LINE}" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="6" y="-24" width="14" height="14" rx="2" fill="#e8c9a4" ${S}/>
    <circle cx="-12" cy="-44" r="10" fill="#c6dfe9" ${S}/>
    <path d="M-20 -46 q4 -2 6 2 q4 -6 8 0 M-14 -38 q4 2 8 -2" fill="none" stroke="#93c98a" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M-12 -34 V-30 M-18 -30 H-6" stroke="${LINE}" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="4" y="-36" width="16" height="6" rx="1.5" fill="#f3c9bd" ${S}/>
    <path d="M14 -48 L20 -38" stroke="#f7d98b" stroke-width="3" stroke-linecap="round"/>`,
  suitcase: `<rect x="-20" y="-36" width="40" height="32" rx="7" fill="#f7d98b" ${S}/>
    <path d="M-8 -36 V-42 Q-8 -45 -5 -45 H5 Q8 -45 8 -42 V-36" fill="none" stroke="${LINE}" stroke-width="2.2"/>
    <path d="M-10 -36 V-4 M10 -36 V-4" stroke="#e0b864" stroke-width="2.4"/>
    <circle cx="-12" cy="-20" r="4.5" fill="#c6dfe9" ${S}/>
    <rect x="2" y="-28" width="12" height="8" rx="2" fill="#f3c9bd" ${S} transform="rotate(-10 8 -24)"/>
    <circle cx="-14" cy="-2" r="2.4" fill="#fffaf0" ${S}/><circle cx="14" cy="-2" r="2.4" fill="#fffaf0" ${S}/>`,
  easel: `<path d="M-14 0 L-2 -60 M14 0 L2 -60 M0 -40 L6 0" stroke="${LINE}" stroke-width="2.2" stroke-linecap="round"/>
    <rect x="-18" y="-58" width="36" height="30" rx="3" fill="#fffaf0" ${S}/>
    <path d="M-14 -34 L-6 -44 L0 -38 L6 -46 L14 -34 Z" fill="#a7d79a"/>
    <circle cx="8" cy="-51" r="3.5" fill="#ffd27a"/>
    <path d="M-20 -26 H20" stroke="${LINE}" stroke-width="2.4" stroke-linecap="round"/>
    <ellipse cx="22" cy="-8" rx="9" ry="5" fill="#f2dfc4" ${S}/>
    <circle cx="19" cy="-9" r="1.6" fill="#f08a7a"/><circle cx="23" cy="-10" r="1.6" fill="#7bb88f"/><circle cx="26" cy="-7" r="1.6" fill="#8fbfe0"/>`,
  seedTray: `${table()}
    <rect x="-18" y="-30" width="36" height="8" rx="2" fill="#c9a37c" ${S}/>
    <path d="M-6 -30 v8 M6 -30 v8" stroke="${LINE}" stroke-width="1"/>
    <path d="M-12 -30 V-36 M0 -30 V-38 M12 -30 V-35" stroke="#7fb27a" stroke-width="1.4" stroke-linecap="round"/>
    <ellipse cx="-14" cy="-37" rx="3.5" ry="2" fill="#a7d79a" ${S}/><ellipse cx="-10" cy="-37" rx="3.5" ry="2" fill="#a7d79a" ${S}/>
    <ellipse cx="-3" cy="-39" rx="3.5" ry="2" fill="#93c98a" ${S}/><ellipse cx="3" cy="-40" rx="3.5" ry="2" fill="#93c98a" ${S}/>
    <ellipse cx="10" cy="-36" rx="3" ry="1.8" fill="#a7d79a" ${S}/><ellipse cx="14" cy="-36" rx="3" ry="1.8" fill="#a7d79a" ${S}/>
    <path d="M-30 -2 l4 -12 h6 q2 0 2 2 v10 Z" fill="#8fbfe0" ${S}/>`,
}

const BUILDING_OF = Object.fromEntries(Object.entries(SIGNATURE).map(([b, f]) => [f, b])) as Partial<Record<Furniture, BuildingId>>

/** 그림이 없는 가구가 생겨도 비지 않게: 둥근 받침대 위에 건물 표시를 올린다 */
function signatureStand(item: Furniture): string {
  const id = BUILDING_OF[item]
  const icon = id ? buildingInfo(id).icon : '🏠'
  return `<rect x="-20" y="-26" width="40" height="26" rx="8" fill="#f2dfc4" ${S}/>
    <circle cx="0" cy="-44" r="16" fill="#fffaf0" ${S}/>
    <text x="0" y="-38" text-anchor="middle" font-size="18">${icon}</text>`
}

function furniture(item: Furniture, slot: (typeof SLOTS)[number]): string {
  const art = COZY_ART[item] ?? SIGNATURE_ART[item] ?? signatureStand(item)
  const shadow = `<ellipse cx="0" cy="1" rx="24" ry="3.5" fill="#000" opacity="0.08"/>`
  return `<g class="room-furn" data-furn="${item}" transform="translate(${slot.x} ${slot.y}) scale(${slot.k})">${shadow}${art}</g>`
}

/** 벽 등불: 창과 오른쪽 가구 사이 벽에 건다. 켜지면 둥근 빛이 번진다 */
const SCONCE = { x: 212, y: 26 }

function sconce(on: boolean): string {
  const { x, y } = SCONCE
  const glow = on
    ? `<radialGradient id="room-glow"><stop offset="0" stop-color="#ffe7a8" stop-opacity="0.75"/><stop offset="1" stop-color="#ffe7a8" stop-opacity="0"/></radialGradient>
      <circle cx="${x}" cy="${y + 4}" r="46" fill="url(#room-glow)"/>`
    : ''
  return `<g data-testid="room-lamp" data-on="${on}">
    ${glow}
    <path d="M${x} ${y - 8} V${y - 2}" stroke="${LINE}" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="${x - 4}" y="${y - 10}" width="8" height="4" rx="2" fill="#d9b48a" ${S}/>
    <path d="M${x - 8} ${y + 8} L${x - 5} ${y - 2} H${x + 5} L${x + 8} ${y + 8} Z" fill="${on ? '#ffe7a0' : '#f7e4b8'}" ${S}/>
  </g>`
}

/** 그날 방 그림(SVG 글). 그림은 모두 코드로 그린 도형이고, 글은 담지 않는다. 빛은 지금 때를 따른다 */
export function roomSvg(room: Room, light: RoomLight = roomLight('day')): string {
  // 저녁·밤엔 방 전체를 얇게 물들이고, 그 위로 등불 빛이 번진다
  const tint = light.tintOpacity
    ? `<rect class="room-tint" x="0" y="0" width="${ROOM_W}" height="${ROOM_H}" fill="${light.tint}" opacity="${light.tintOpacity}"/>`
    : ''
  return `<svg class="reader-room" data-testid="reader-room" viewBox="0 0 ${ROOM_W} ${ROOM_H}"
      data-wall="${room.wall}" data-floor="${room.floor}" data-time="${light.part}" role="img" aria-label="그날의 방">
    ${wall(room.wall)}
    ${window_(room.view, room.curtain, light)}
    <rect x="0" y="${FLOOR_Y - 4}" width="${ROOM_W}" height="5" fill="#f2dfc4" stroke="${LINE}" stroke-width="1"/>
    ${floor(room.floor)}
    ${furniture(room.items[0], SLOTS[0])}
    ${furniture(room.items[1], SLOTS[1])}
    ${furniture(room.items[2], SLOTS[2])}
    ${tint}
    ${sconce(light.lamp)}
  </svg>`
}
