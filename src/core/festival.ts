/**
 * 마을 잔치: 해마다 돌아오는 날에 마을이 잔치 옷을 입는다. 날짜만으로 정한다.
 * 쓴 날 수·연속 기록·기분은 보지 않는다(그날 안 써도 잔치는 열린다). 계산만 하고 저장하지 않는다
 */
import { isDate } from './date'
import type { Dated } from './types'
import type { MilestoneCard } from './stage'
import { hash } from './village'

export type FestivalId = 'birthday' | 'newYear' | 'pumpkin' | 'christmas' | 'seollal' | 'chuseok'

export interface Festival {
  id: FestivalId
  name: string
  icon: string
  /** 마을 생일: 첫 집을 지은 지 몇 해 */
  years?: number
}

const DATED: { id: FestivalId; name: string; icon: string; days: string[] }[] = [
  { id: 'newYear', name: '새해 잔치', icon: '🎍', days: ['01-01'] },
  { id: 'pumpkin', name: '호박 축제', icon: '🎃', days: ['10-31'] },
  { id: 'christmas', name: '성탄 잔치', icon: '🎄', days: ['12-24', '12-25'] },
]

/** 오늘 열리는 잔치. 처음 집을 지은 날(지운 날 포함)과 같은 달·날이면 마을 생일이 먼저다 */
export function festivalOn(days: readonly Dated[], today: string): Festival | null {
  const birthday = birthdayOn(days, today)
  if (birthday) return birthday
  const md = today.slice(5)
  const f = DATED.find((x) => x.days.includes(md))
  if (f) return { id: f.id, name: f.name, icon: f.icon }
  const l = LUNAR.find((x) => x.days.some((day) => Math.abs(gap(day, today)) <= 1))
  return l ? { id: l.id, name: l.name, icon: l.icon } : null
}

/**
 * 음력 잔치는 계산이 길어 한국 시간 기준 날짜 표로 둔다(2026~2035). 그날과 앞뒤 하루, 사흘 동안 연다.
 * 표 밖의 해에는 열리지 않는다
 */
const LUNAR: { id: FestivalId; name: string; icon: string; days: string[] }[] = [
  {
    id: 'seollal',
    name: '설 잔치',
    icon: '🪁',
    days: ['2026-02-17', '2027-02-07', '2028-01-27', '2029-02-13', '2030-02-03', '2031-01-23', '2032-02-11', '2033-01-31', '2034-02-19', '2035-02-08'],
  },
  {
    id: 'chuseok',
    name: '추석 잔치',
    icon: '🌕',
    days: ['2026-09-25', '2027-09-15', '2028-10-03', '2029-09-22', '2030-09-12', '2031-10-01', '2032-09-19', '2033-09-08', '2034-09-27', '2035-09-16'],
  },
]

/** 두 날짜 사이 날 수(b - a) */
function gap(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

const CARD: Record<FestivalId, { title: string; body: string }> = {
  birthday: { title: '오늘은 마을 생일이에요', body: '주민들이 광장에 모여 케이크에 초를 켰어요.' },
  newYear: { title: '새해 잔치가 열렸어요', body: '새해 복 많이 받아요! 광장에 복주머니가 걸렸어요.' },
  pumpkin: { title: '오늘은 호박 축제예요', body: '광장에 호박 등불이 켜지고 주민들이 들떠 있어요.' },
  christmas: { title: '성탄 잔치가 열렸어요', body: '광장에 별 달린 트리가 섰어요. 따뜻한 성탄 보내요.' },
  seollal: { title: '설 잔치가 열렸어요', body: '광장 하늘에 연이 날고, 주민들이 떡국을 나눠요.' },
  chuseok: { title: '추석 잔치가 열렸어요', body: '광장에 보름달 등이 떴어요. 송편 드시고 넉넉한 한가위 보내요.' },
}

/** 잔치 날 앱을 열면 띄우는 잔치 카드 문구. 쓴 날 수·기분은 보지 않고, 쓰라고 재촉하지 않는다 */
export function festivalCard(f: Festival): MilestoneCard {
  const c = CARD[f.id]
  const body = f.id === 'birthday' ? `첫 집을 지은 지 ${f.years ?? 1}년이 되었어요. ${c.body}` : c.body
  return { title: `${f.icon} ${c.title}`, body, next: '광장에 잔치 장식이 섰어요', icons: [f.icon, '🎉'], visit: null }
}

const LINES: Record<FestivalId, string[]> = {
  birthday: ['마을 생일 축하해요!', '생일 케이크 맛있어요!', '우리 마을 생일이에요!'],
  newYear: ['새해 복 많이 받아요!', '올해도 한 줄씩 함께해요.', '복주머니 받으셨어요?'],
  pumpkin: ['호박 등불이 참 예뻐요!', '오늘은 호박 축제예요!', '사탕 하나 드릴까요?'],
  christmas: ['메리 크리스마스!', '트리에 별을 달았어요.', '선물 상자가 궁금해요!'],
  seollal: ['새해 복 많이 받아요!', '연이 높이 날아요!', '떡국 한 그릇 드세요.'],
  chuseok: ['보름달이 참 밝아요!', '송편 하나 드세요.', '넉넉한 한가위 보내요!'],
}

/** 잔치 날 주민의 한마디. 같은 주민은 같은 말을 한다 */
export function festivalLine(f: Festival, residentId: string): string {
  const lines = LINES[f.id]
  return lines[hash(residentId) % lines.length]
}

function birthdayOn(days: readonly Dated[], today: string): Festival | null {
  if (days.length === 0) return null
  const first = days.reduce((a, b) => (b.date < a ? b.date : a), days[0].date)
  const year = Number(today.slice(0, 4))
  const years = year - Number(first.slice(0, 4))
  if (years < 1) return null
  // 2월 29일에 시작한 마을은 평년엔 2월 28일에 연다
  let md = first.slice(5)
  if (md === '02-29' && !isDate(`${year}-02-29`)) md = '02-28'
  return today.slice(5) === md ? { id: 'birthday', name: '마을 생일', icon: '🎂', years } : null
}
