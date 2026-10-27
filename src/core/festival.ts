/**
 * 마을 잔치: 해마다 돌아오는 날에 마을이 잔치 옷을 입는다. 날짜만으로 정한다.
 * 쓴 날 수·연속 기록·기분은 보지 않는다(그날 안 써도 잔치는 열린다). 계산만 하고 저장하지 않는다
 */
import { isDate } from './date'
import type { Dated } from './types'

export type FestivalId = 'birthday' | 'newYear' | 'pumpkin' | 'christmas'

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
  return f ? { id: f.id, name: f.name, icon: f.icon } : null
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
