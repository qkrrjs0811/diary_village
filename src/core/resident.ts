import { buildingInfo, buildingOf, hasFinal, type BuildingId } from './building'
import { memoryDates } from './memory'
import { replyOf } from './reply'
import { PLAZA, writtenDays } from './landmark'
import { BLOCK_H, BLOCK_W, ROAD, hash, type Block, type Village } from './village'
import type { Dated, Entry } from './types'
import { festivalLine, type Festival } from './festival'
import { DECORS, type DecorId } from './decor'

export type Ears = 'none' | 'bunny' | 'bear' | 'cat' | 'leaf'

export interface Resident {
  id: string
  name: string
  /** 누적으로 쓴 날 수가 이만큼이 되면 마을에 온다 */
  days: number
  color: string
  ears: Ears
  /** 이웃 수첩에 보이는 좋아하는 것 한 줄(정해 둔 표) */
  likes: string
}

const COLORS = ['#ffd1dc', '#ffe6a7', '#c9e8c0', '#cfe3f7', '#e5d4f5', '#ffd8b8', '#fff4e6']
const EARS: Ears[] = ['bunny', 'none', 'bear', 'cat', 'leaf']
const ROSTER: [string, string, number, string][] = [
  ['kong', '콩이', 1, '콩자반과 낮잠'],
  ['momo', '모모', 3, '복숭아 우유'],
  ['bori', '보리', 5, '보리차 한 잔'],
  ['dubu', '두부', 7, '따끈한 두부 부침'],
  ['hodu', '호두', 10, '호두과자 봉지'],
  ['somi', '솜이', 14, '폭신한 솜이불'],
  ['gomi', '꼬미', 20, '작은 돌멩이 모으기'],
  ['dalle', '달래', 25, '봄나물 캐기'],
  ['gamja', '감자', 30, '군감자 냄새'],
  ['dotori', '도토리', 40, '도토리 줍기'],
  ['nabi', '나비', 50, '꽃밭 산책'],
  ['gureum', '구름', 60, '구름 모양 맞히기'],
  ['sagwa', '사과', 70, '빨간 사과 한 입'],
  ['byeol', '별이', 85, '밤하늘 별 세기'],
  ['danchu', '단추', 100, '알록달록 단추 모으기'],
  ['maru', '마루', 120, '마루에 누워 뒹굴기'],
  ['haru', '하루', 140, '해 질 녘 노을'],
  ['mango', '망고', 160, '노란 망고 빙수'],
  ['mongsil', '몽실', 180, '비눗방울 불기'],
  ['pori', '포리', 200, '풀피리 불기'],
  ['choco', '초코', 250, '초코 쿠키 굽기'],
  ['ssuk', '쑥이', 300, '쑥떡과 따뜻한 차'],
  ['donggeul', '동글이', 365, '동그란 보름달'],
]

/**
 * 쌓일수록 마을이 자란다(기획서 6번). 둥근 주민이 누적 날 수에 따라 한 명씩 온다.
 * 기분·글 길이·연속 기록은 보지 않고, 글은 지워지지 않으니 주민도 떠나지 않는다
 */
export const RESIDENTS: Resident[] = ROSTER.map(([id, name, days, likes], i) => ({
  id,
  name,
  days,
  color: COLORS[i % COLORS.length],
  ears: EARS[i % EARS.length],
  likes,
}))

export function residentsOf(entries: Dated[]): Resident[] {
  const n = writtenDays(entries)
  return RESIDENTS.filter((r) => r.days <= n)
}

/** 이웃 수첩의 한 칸: 이사 온 날(아직이면 null)과 오기까지 남은 날 수(왔으면 0) */
export interface Arrival {
  resident: Resident
  date: string | null
  left: number
}

/**
 * 주민마다 이사 온 날. built 는 집을 지었던 날(지운 날 포함)이라 지워도 이사 온 날이 바뀌지 않는다.
 * 날짜 순으로 셌을 때 days번째 날에 온다. 기분·글 길이는 보지 않는다
 */
export function arrivalsOf(built: readonly Dated[]): Arrival[] {
  const dates = [...new Set(built.map((d) => d.date))].sort()
  return RESIDENTS.map((resident) => {
    const date = dates[resident.days - 1] ?? null
    return { resident, date, left: date ? 0 : resident.days - dates.length }
  })
}

/** 그날 이사 온 주민들 */
export function arrivedOn(built: readonly Dated[], date: string): Resident[] {
  return arrivalsOf(built)
    .filter((a) => a.date === date)
    .map((a) => a.resident)
}

/** before → after 로 바뀌며 새로 온 이웃(짓는 알림에 쓴다) */
export function reachedResidents(before: Dated[], after: Dated[]): Resident[] {
  const from = writtenDays(before)
  const to = writtenDays(after)
  return RESIDENTS.filter((r) => r.days > from && r.days <= to)
}

/** 새 이웃이 왔을 때 짓는 알림에 더하는 한 줄. 없으면 null */
export function neighborNote(arrived: Resident[]): string | null {
  if (arrived.length === 0) return null
  const names = arrived.map((r) => r.name)
  const last = names[names.length - 1]
  const head = names.slice(0, -1).map((n) => `${n}${hasFinal(n) ? '과' : '와'} `)
  return `🏡 새 이웃 ${head.join('')}${last}${hasFinal(last) ? '이' : '가'} 이사 왔어요`
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

/**
 * 광장의 빈 돌길. 가로 돌길(셋째·넷째 줄)과 가운데 돌길 칸만 써서
 * 명소 자리(팻말 자리)·우체통·모서리 나무·소품을 놓을 수 있는 칸을 지나지 않는다.
 * 세 길 모두 출발점이 넷째 줄이라, 새 이웃은 같은 줄 왼쪽 위 끝에서 곧게 들어온다.
 * 첫 길(첫 새 이웃 자리)은 화면에서 우체통 바로 위·명소 팻말 뒤에 서지 않는 셋째 칸이다
 */
function plazaLanes(): Lane[] {
  const at = (u: number, v: number): Spot => ({ gx: PLAZA.gx + u, gy: PLAZA.gy + v })
  return [lane(at(2.5, 3.5), at(2.5, 2.5)), lane(at(4.5, 3.5), at(5.5, 3.5)), lane(at(3.5, 3.5), at(3.5, 4.5))]
}

/**
 * 주민마다 걷는 길을 정한다. 첫 주민은 가장 최근 구역(오늘 자리 근처), 다음은 광장,
 * 그다음은 오래된 구역 순으로 돌아가며 하나씩 고른다. 길이 모자라면 남는 주민은 빠진다
 */
export function residentWalks(village: Village, residents: Resident[], guests: Guest[] = [], newcomers: readonly string[] = []): Walk[] {
  // 손님이 된 주민은 오늘 집 앞에 있으니 걷지 않는다(같은 주민이 두 군데 보이지 않게)
  const away = new Set(guests.map((g) => g.resident.id))
  residents = residents.filter((r) => !away.has(r.id))
  const blocks = [...village.blocks].reverse()
  const plaza = plazaLanes()
  const queues = [blockLanes(blocks[0] ?? { month: '', bx: 0, by: 0, lots: [] }), plaza, ...blocks.slice(1).map(blockLanes)]
  const lanes: Lane[] = []
  for (let i = 0; queues.some((q) => i < q.length); i++) for (const q of queues) if (i < q.length) lanes.push(q[i])
  // 새 이웃은 광장 길을 먼저 받아 광장으로 들어온다. 나머지 주민은 남은 길을 차례로 받는다
  const fresh = residents.filter((r) => newcomers.includes(r.id)).slice(0, plaza.length)
  const rest = residents.filter((r) => !fresh.includes(r))
  const order: (Resident | undefined)[] = lanes.slice(0, residents.length).map(() => undefined)
  fresh.forEach((r, i) => {
    const at = lanes.indexOf(plaza[i])
    if (at >= order.length) order.push(...Array(at + 1 - order.length).fill(undefined))
    order[at] = r
  })
  for (let i = 0, k = 0; i < order.length && k < rest.length; i++) if (!order[i]) order[i] = rest[k++]
  return order.flatMap((resident, i) => {
    if (!resident) return []
    const { from, to } = lanes[i]
    // 길 한 칸 가운데를 기준으로, 뒤 칸 집보다 뒤에·앞 칸 집보다 먼저 그린다
    const depth = (from.gx + to.gx) / 2 + (from.gy + to.gy) / 2 - 0.25
    return { resident, from, to, depth }
  })
}

/** 광장 안 자리인지 */
export function onPlaza(s: Spot): boolean {
  return s.gx >= PLAZA.gx && s.gx < PLAZA.gx + PLAZA.w && s.gy >= PLAZA.gy && s.gy < PLAZA.gy + PLAZA.h
}

/**
 * 새 이웃이 광장 길로 들어오기 시작하는 자리: 그 길과 같은 줄의 광장 왼쪽 위 가장자리(섬 끝).
 * 앞 가장자리에서 올라오면 우체통·우물·다리 앞을 지나가서, 비어 있는 가로 돌길로 들어온다
 */
export function plazaEntrance(at: Spot): Spot {
  return { gx: PLAZA.gx, gy: at.gy }
}

/** 이웃이 놀러 오는 쉼터와 거기서 하는 일(이름 뒤에 붙는다) */
export const HANGOUT_PLAYS: Partial<Record<DecorId, string>> = {
  bench: '에서 쉬어요',
  swing: '에서 놀아요',
  platform: '에서 쉬어요',
  campfire: ' 가에서 불을 쬐어요',
  slide: '에서 놀아요',
  seesaw: '에서 놀아요',
  gazebo: '에서 쉬어요',
  tent: '에서 쉬어요',
}

/** 쉼터에 놀러 온 이웃. index 는 그 쉼터의 저장 속 순서 */
export interface Hangout {
  resident: Resident
  decor: DecorId
  index: number
  /** 쉼터 칸 안 앞쪽(마을 칸 좌표) */
  spot: Spot
  depth: number
}

/**
 * 놓아 둔 쉼터마다 이미 온 이웃 하나가 와서 머문다. 놓은 순서(index)대로 이웃이 온 순서대로 짝짓고 저장하지 않는다.
 * 쉼터를 옮기면 같은 이웃이 새 칸으로 따라간다. away(오늘 손님·새 이웃)는 오지 않고, 이웃이 모자라면 남는 쉼터는 빈다
 */
export function hangoutsOf(
  residents: readonly Resident[],
  decors: readonly { id: DecorId; index: number; gx: number; gy: number }[],
  away: readonly string[] = [],
): Hangout[] {
  const free = residents.filter((r) => !away.includes(r.id))
  const shelters = decors.filter((d) => HANGOUT_PLAYS[d.id]).sort((a, b) => a.index - b.index)
  return shelters.slice(0, free.length).map((d, i) => {
    // 쉼터 그림 오른쪽 앞에 선다. 그 칸 쉼터보다 앞에, 앞 칸 것보다 먼저 그린다
    const spot = { gx: d.gx + 0.82, gy: d.gy + 0.62 }
    return { resident: free[i], decor: d.id, index: d.index, spot, depth: d.gx + d.gy + 0.5 }
  })
}

/** 이웃 수첩 한 줄: "보리는 그네에서 놀아요" */
export function hangoutLine(h: Pick<Hangout, 'resident' | 'decor'>): string {
  const place = DECORS.find((d) => d.id === h.decor)!.name
  const name = h.resident.name
  return `${name}${hasFinal(name) ? '은' : '는'} ${place}${HANGOUT_PLAYS[h.decor] ?? '에 놀러 왔어요'}`
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
  /** 첫 손님이 오늘 한 줄에 건네는 맞장구(R18). 둘째 손님·기다리는 손님은 null */
  reply: string | null
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
  newcomers: readonly string[] = [],
): Guest[] {
  const lots = village.blocks.flatMap((b) => b.lots)
  const lot = lots.find((l) => l.date === today)
  if (!lot || residents.length === 0) return []
  const cell = (s: Spot) => `${Math.floor(s.gx)},${Math.floor(s.gy)}`
  const busy = new Set([...taken.map(cell), ...lots.filter((l) => l.entry && l.date !== today).map(cell)])
  // 집 앞 왼쪽·오른쪽 가장자리(문 앞 한가운데는 비워 둔다)
  const spots = [
    { gx: lot.gx + 0.3, gy: lot.gy + 1 },
    { gx: lot.gx + 1, gy: lot.gy + 0.3 },
  ].filter((s) => !busy.has(cell(s)) && !onPlaza(s))
  const todays = entries.find((x) => x.date === today)
  const b = todays ? buildingOf(todays) : null
  const count = Math.min(todays ? (residents.length >= 3 ? 2 : 1) : 1, spots.length)
  // 오늘 이사 온 새 이웃은 광장으로 들어오니, 다른 주민이 모자랄 때만 손님이 된다
  const order = guestOrder(residents, today)
  return [...order.filter((r) => !newcomers.includes(r.id)), ...order.filter((r) => newcomers.includes(r.id))]
    .slice(0, count).map((resident, i) => ({
    resident,
    spot: spots[i],
    // 오늘 집보다 뒤에, 앞 칸 나무·꽃보다 먼저 그린다
    depth: spots[i].gx + spots[i].gy - 0.75,
    date: today,
    waiting: !todays,
    building: b?.id ?? null,
    play: todays ? (b?.id ?? 'house') : null,
    reply: i === 0 ? replyOf(todays) : null,
  }))
}

/** 그날 손님으로 오는 주민 순서. 주민·날짜로만 정한다 */
function guestOrder(residents: Resident[], date: string): Resident[] {
  return [...residents].sort((x, y) => hash(`guest:${date}:${x.id}`) - hash(`guest:${date}:${y.id}`) || (x.id < y.id ? -1 : 1))
}

/**
 * 그날 첫 손님이 그날 한 줄에 건넨 맞장구(읽기 창용). built 는 지은 날(지운 날 포함)이다.
 * 그날까지 온 주민 중에서 고르므로 나중에 쓴 날이 늘어도 말하는 주민이 바뀌지 않고, 오늘이면 지금 손님과 같다
 */
export function dayReply(entry: Entry, built: readonly Dated[]): { resident: Resident; reply: string } | null {
  const resident = guestOrder(residentsOf([...built.filter((d) => d.date <= entry.date), entry]), entry.date)[0]
  const reply = replyOf(entry)
  return resident && reply ? { resident, reply } : null
}

/** 읽기 창에 보일 맞장구 한 줄 */
export function dayReplyLine(entry: Entry, built: readonly Dated[]): string | null {
  const r = dayReply(entry, built)
  return r ? `💬 ${r.resident.name}: “${r.reply}”` : null
}

/** 손님 한마디. 첫 손님은 오늘 한 줄에 맞장구를 치고(글 조각은 옮기지 않는다), 다른 손님은 놀이 말을 한다 */
export function guestLine(g: Guest): string {
  return g.reply ?? guestPlayLine(g)
}

/** 손님 놀이 말. 오늘 건물 이름만 말하고 글은 옮기지 않는다. 기다리는 말은 재촉하지 않는다 */
export function guestPlayLine(g: Guest): string {
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
 * 차례: 오늘 이야기 → (잔치 날이면) 잔치 한마디 → (지난 글이 있으면) 지난 이야기 → (정이 쌓였으면) 자기 이야기 friend → 여느 때 말
 */
export function residentTalk(
  r: Resident,
  entries: Entry[],
  today: string,
  tap: number,
  days: Dated[] = entries,
  festival: Festival | null = null,
  friend: string | null = null,
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
  // 정이 쌓인 이웃은 열린 자기 이야기 하나를 털어놓는다
  if (friend && tap >= 1) {
    if (tap === 1) return { text: friend }
    tap -= 1
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
