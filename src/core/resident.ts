import { buildingInfo, buildingOf, hasFinal, type BuildingId } from './building'
import { memoryDates } from './memory'
import { PLAZA, writtenDays } from './landmark'
import { BLOCK_H, BLOCK_W, ROAD, hash, type Block, type Village } from './village'
import type { Dated, Entry } from './types'
import { festivalLine, type Festival } from './festival'

export type Ears = 'none' | 'bunny' | 'bear' | 'cat' | 'leaf'

export interface Resident {
  id: string
  name: string
  /** 누적으로 쓴 날 수가 이만큼이 되면 마을에 온다 */
  days: number
  color: string
  ears: Ears
}

const COLORS = ['#ffd1dc', '#ffe6a7', '#c9e8c0', '#cfe3f7', '#e5d4f5', '#ffd8b8', '#fff4e6']
const EARS: Ears[] = ['bunny', 'none', 'bear', 'cat', 'leaf']
const ROSTER: [string, string, number][] = [
  ['kong', '콩이', 1],
  ['momo', '모모', 3],
  ['bori', '보리', 5],
  ['dubu', '두부', 7],
  ['hodu', '호두', 10],
  ['somi', '솜이', 14],
  ['gomi', '꼬미', 20],
  ['dalle', '달래', 25],
  ['gamja', '감자', 30],
  ['dotori', '도토리', 40],
  ['nabi', '나비', 50],
  ['gureum', '구름', 60],
  ['sagwa', '사과', 70],
  ['byeol', '별이', 85],
  ['danchu', '단추', 100],
  ['maru', '마루', 120],
  ['haru', '하루', 140],
  ['mango', '망고', 160],
  ['mongsil', '몽실', 180],
  ['pori', '포리', 200],
  ['choco', '초코', 250],
  ['ssuk', '쑥이', 300],
  ['donggeul', '동글이', 365],
]

/**
 * 쌓일수록 마을이 자란다(기획서 6번). 둥근 주민이 누적 날 수에 따라 한 명씩 온다.
 * 기분·글 길이·연속 기록은 보지 않고, 글은 지워지지 않으니 주민도 떠나지 않는다
 */
export const RESIDENTS: Resident[] = ROSTER.map(([id, name, days], i) => ({
  id,
  name,
  days,
  color: COLORS[i % COLORS.length],
  ears: EARS[i % EARS.length],
}))

export function residentsOf(entries: Dated[]): Resident[] {
  const n = writtenDays(entries)
  return RESIDENTS.filter((r) => r.days <= n)
}

export type Spot = { gx: number; gy: number }

/** 주민이 오가는 한 칸 길(from ↔ to). depth 는 마을 그림에서 앞뒤를 정하는 값 */
export interface Walk {
  resident: Resident
  from: Spot
  to: Spot
  depth: number
}

type Lane = { from: Spot; to: Spot }

const lane = (from: Spot, to: Spot): Lane => ({ from, to })

/**
 * 구역 앞쪽 두 길(왼쪽 앞, 오른쪽 앞)의 한 칸씩. 집 자리(구역 안)를 지나지 않는다.
 * 뒤쪽 길은 집에 가려지므로 쓰지 않는다. 고르게 퍼지도록 순서를 섞는다
 */
function blockLanes(b: Block): Lane[] {
  const gx0 = b.bx * (BLOCK_W + ROAD)
  const gy0 = b.by * (BLOCK_H + ROAD)
  const front = gy0 + BLOCK_H + ROAD / 4
  const right = gx0 + BLOCK_W + ROAD / 4
  const left = [2, 5, 0, 4, 1, 6, 3].map((k) => lane({ gx: gx0 + k, gy: front }, { gx: gx0 + k + 1, gy: front }))
  const side = [2, 0, 4, 1, 5, 3].map((r) => lane({ gx: right, gy: gy0 + r }, { gx: right, gy: gy0 + r + 1 }))
  const out: Lane[] = []
  for (let i = 0; i < left.length; i++) {
    out.push(left[i])
    if (side[i]) out.push(side[i])
  }
  return out
}

/** 광장의 빈 돌길(명소 자리를 피한다) */
function plazaLanes(): Lane[] {
  const at = (u: number, v: number): Spot => ({ gx: PLAZA.gx + u, gy: PLAZA.gy + v })
  return [lane(at(1, 3), at(2, 3)), lane(at(4, 3), at(5, 3)), lane(at(3.5, 4), at(3.5, 5))]
}

/**
 * 주민마다 걷는 길을 정한다. 첫 주민은 가장 최근 구역(오늘 자리 근처), 다음은 광장,
 * 그다음은 오래된 구역 순으로 돌아가며 하나씩 고른다. 길이 모자라면 남는 주민은 빠진다
 */
export function residentWalks(village: Village, residents: Resident[], guests: Guest[] = []): Walk[] {
  // 손님이 된 주민은 오늘 집 앞에 있으니 걷지 않는다(같은 주민이 두 군데 보이지 않게)
  const away = new Set(guests.map((g) => g.resident.id))
  residents = residents.filter((r) => !away.has(r.id))
  const blocks = [...village.blocks].reverse()
  const queues = [blockLanes(blocks[0] ?? { month: '', bx: 0, by: 0, lots: [] }), plazaLanes(), ...blocks.slice(1).map(blockLanes)]
  const lanes: Lane[] = []
  for (let i = 0; queues.some((q) => i < q.length); i++) for (const q of queues) if (i < q.length) lanes.push(q[i])
  return residents.slice(0, lanes.length).map((resident, i) => {
    const { from, to } = lanes[i]
    // 길 한 칸 가운데를 기준으로, 뒤 칸 집보다 뒤에·앞 칸 집보다 먼저 그린다
    const depth = (from.gx + to.gx) / 2 + (from.gy + to.gy) / 2 - 0.25
    return { resident, from, to, depth }
  })
}

/** 손님 놀이: 오늘 건물 종류(보통 집은 'house') */
export type GuestPlay = BuildingId | 'house'

/** 손님이 들고 오는 놀이 소품 이름과 손님 한마디(건물 이름 뒤에 붙는다). 기분·글 길이는 보지 않는다 */
export const GUEST_PLAYS: Record<GuestPlay, { prop: string; line: string }> = {
  cafe: { prop: '찻잔', line: '커피 마시러 왔어요.' },
  bookstore: { prop: '책', line: '책 읽으러 왔어요.' },
  field: { prop: '공', line: '공 차러 왔어요.' },
  catHouse: { prop: '털실', line: '털실 들고 놀러 왔어요.' },
  dogHouse: { prop: '뼈다귀', line: '강아지랑 놀러 왔어요.' },
  flowerShop: { prop: '화분', line: '꽃 구경하러 왔어요.' },
  bakery: { prop: '빵 바구니', line: '빵 사러 왔어요.' },
  lighthouse: { prop: '망원경', line: '바다 보러 왔어요.' },
  musicHall: { prop: '악보', line: '노래 들으러 왔어요.' },
  cinema: { prop: '팝콘', line: '영화 보러 왔어요.' },
  restaurant: { prop: '숟가락', line: '밥 먹으러 왔어요.' },
  park: { prop: '돗자리', line: '쉬러 왔어요.' },
  school: { prop: '가방', line: '공부하러 왔어요.' },
  station: { prop: '기차표', line: '기차 타러 왔어요.' },
  gallery: { prop: '붓', line: '그림 보러 왔어요.' },
  farm: { prop: '물뿌리개', line: '물 주러 왔어요.' },
  house: { prop: '꽃다발', line: '꽃다발 들고 왔어요.' },
}

/** 오늘의 손님: 오늘 집 앞에 놀러 온(또는 오늘 자리 앞에서 기다리는) 주민 */
export interface Guest {
  resident: Resident
  /** 오늘 집 칸 앞쪽 가장자리(마을 칸 좌표) */
  spot: Spot
  depth: number
  date: string
  /** 오늘을 아직 안 써서 오늘 자리 앞에서 기다린다 */
  waiting: boolean
  building: BuildingId | null
  play: GuestPlay | null
}

/**
 * 오늘의 손님. 오늘 집이 있으면 주민 한두 명(주민이 셋 이상이면 둘)이 그 집 앞에 놀러 오고,
 * 없으면 한 명이 오늘 자리 앞에서 기다린다. 주민·날짜·오늘 건물로만 정하고 저장하지 않는다.
 * 기분·글 길이는 보지 않는다. taken 은 소품이 놓인 칸이다. 그 칸과 다른 집 칸은 피하고, 자리가 없으면 오지 않는다
 */
export function todayGuests(
  village: Village,
  residents: Resident[],
  entries: readonly Entry[],
  today: string,
  taken: readonly Spot[] = [],
): Guest[] {
  const lots = village.blocks.flatMap((b) => b.lots)
  const lot = lots.find((l) => l.date === today)
  if (!lot || residents.length === 0) return []
  const cell = (s: Spot) => `${Math.floor(s.gx)},${Math.floor(s.gy)}`
  const busy = new Set([...taken.map(cell), ...lots.filter((l) => l.entry && l.date !== today).map(cell)])
  const inPlaza = (s: Spot) => s.gx >= PLAZA.gx && s.gx < PLAZA.gx + PLAZA.w && s.gy >= PLAZA.gy && s.gy < PLAZA.gy + PLAZA.h
  // 집 앞 왼쪽·오른쪽 가장자리(문 앞 한가운데는 비워 둔다)
  const spots = [
    { gx: lot.gx + 0.3, gy: lot.gy + 1 },
    { gx: lot.gx + 1, gy: lot.gy + 0.3 },
  ].filter((s) => !busy.has(cell(s)) && !inPlaza(s))
  const todays = entries.find((x) => x.date === today)
  const b = todays ? buildingOf(todays) : null
  const count = Math.min(todays ? (residents.length >= 3 ? 2 : 1) : 1, spots.length)
  const order = [...residents].sort((x, y) => hash(`guest:${today}:${x.id}`) - hash(`guest:${today}:${y.id}`) || (x.id < y.id ? -1 : 1))
  return order.slice(0, count).map((resident, i) => ({
    resident,
    spot: spots[i],
    // 오늘 집보다 뒤에, 앞 칸 나무·꽃보다 먼저 그린다
    depth: spots[i].gx + spots[i].gy - 0.75,
    date: today,
    waiting: !todays,
    building: b?.id ?? null,
    play: todays ? (b?.id ?? 'house') : null,
  }))
}

/** 손님 한마디. 오늘 건물 이름만 말하고 글은 옮기지 않는다. 기다리는 말은 재촉하지 않는다 */
export function guestLine(g: Guest): string {
  if (g.waiting || !g.play) return '오늘 자리에서 기다리고 있어요.'
  const { line } = GUEST_PLAYS[g.play]
  return g.building ? `오늘 생긴 ${buildingInfo(g.building).name}에 ${line}` : `오늘 지은 집에 ${line}`
}

/** 주민 한마디. date 가 있으면 그날 집 이야기(말풍선에서 그 집을 보러 갈 수 있다) */
export interface Talk {
  text: string
  date?: string
}

/**
 * 주민이 꺼낼 지난날. 주민·오늘 날짜로 정해 같은 날 같은 주민은 같은 날을 꺼내고, 저장하지 않는다.
 * 오늘·"N일 전 오늘"이 보여 주는 날은 고르지 않는다. 지운 날은 entries 에 글이 없으니 꺼내지 않는다
 */
export function storyDay(r: Resident, entries: readonly Entry[], today: string): Entry | null {
  const shown = new Set(memoryDates(today).map((m) => m.date))
  const pool = entries.filter((x) => x.date < today && !shown.has(x.date)).sort((a, b) => (a.date < b.date ? -1 : 1))
  if (pool.length === 0) return null
  return pool[hash(`${r.id}:${today}`) % pool.length]
}

/** 건물마다 짧은 이야기 말. 이름 뒤에 붙는다. 기분·글 길이는 보지 않는다 */
const STORY: Record<BuildingId, string> = {
  cafe: '아직도 커피 향이 나요.',
  bookstore: '가끔 책장 넘기는 소리가 나요.',
  field: '저도 거기서 한 바퀴 뛰었어요.',
  catHouse: '고양이가 낮잠 자고 있었어요.',
  dogHouse: '강아지가 꼬리를 흔들었어요.',
  flowerShop: '꽃 냄새가 아직 남아 있어요.',
  bakery: '아직도 고소한 냄새가 나요.',
  lighthouse: '파도 소리가 들리는 것 같아요.',
  musicHall: '노랫소리가 아직 귀에 남아요.',
  cinema: '팝콘 냄새가 솔솔 나요.',
  restaurant: '따끈한 밥 냄새가 났어요.',
  park: '벤치에 앉아 쉬다 왔어요.',
  school: '종소리가 땡땡 울렸어요.',
  station: '기차가 칙칙폭폭 지나갔어요.',
  gallery: '그림 앞에서 한참 서 있었어요.',
  farm: '새싹이 쑥 자라 있었어요.',
}

const sayDate = (date: string, today: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return `${y === Number(today.slice(0, 4)) ? '' : `${y}년 `}${m}월 ${d}일`
}

/** 지난날 집 이야기. 글은 옮기지 않고 날짜·건물 이름만 말한다. 꺼낼 날이 없으면 null */
export function storyTalk(r: Resident, entries: readonly Entry[], today: string): Talk | null {
  const day = storyDay(r, entries, today)
  if (!day) return null
  const when = sayDate(day.date, today)
  const b = buildingOf(day)
  const text = b
    ? `${when}에 생긴 ${buildingInfo(b.id).name}, ${STORY[b.id]}`
    : `${when}에 지은 집 앞을 지나왔어요. 창문이 반짝였어요.`
  return { text, date: day.date }
}

/**
 * 주민을 누르면 하는 짧은 한마디. tap 은 지금까지 누른 횟수(0부터).
 * days 는 집을 지었던 날(지운 날 포함). 없으면 entries 로 센다.
 * 차례: 오늘 이야기 → (잔치 날이면) 잔치 한마디 → (지난 글이 있으면) 지난 이야기 → 여느 때 말
 */
export function residentTalk(
  r: Resident,
  entries: Entry[],
  today: string,
  tap: number,
  days: Dated[] = entries,
  festival: Festival | null = null,
): Talk {
  if (festival && tap >= 1) {
    if (tap === 1) return { text: festivalLine(festival, r.id) }
    tap -= 1
  }
  if (tap >= 1) {
    const story = storyTalk(r, entries, today)
    if (story) {
      if (tap === 1) return story
      tap -= 1
    }
  }
  return { text: usualLine(r, entries, today, tap, days) }
}

/** residentTalk 의 글만 */
export function residentLine(
  r: Resident,
  entries: Entry[],
  today: string,
  tap: number,
  days: Dated[] = entries,
  festival: Festival | null = null,
): string {
  return residentTalk(r, entries, today, tap, days, festival).text
}

/** 오늘 이야기(tap 0)와 여느 때 말 */
function usualLine(r: Resident, entries: Entry[], today: string, tap: number, days: Dated[]): string {
  if (tap === 0) {
    const todays = entries.find((x) => x.date === today)
    if (!todays) return '오늘은 어떤 하루였어요?'
    const b = buildingOf(todays)
    return b ? `새로 생긴 ${buildingInfo(b.id).name}에 가 봤어요!` : '오늘 지은 집, 참 예뻐요.'
  }
  const lines = [
    `한 줄이 ${writtenDays(days)}일 쌓였어요.`,
    `저는 ${r.name}${hasFinal(r.name) ? '이에요' : '예요'}. 반가워요!`,
    '짧게 써도 충분해요.',
    '천천히 산책하는 중이에요.',
    '빈 날엔 꽃이 피어요.',
  ]
  return lines[(tap - 1 + hash(r.id)) % lines.length]
}
