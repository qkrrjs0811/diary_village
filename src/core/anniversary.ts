/**
 * 이웃의 이사 기념일: 이사 온 날을 1일째로 세어 100·200·300일째 날, 그리고 해마다 같은 달·날(1년·2년…).
 * 이사 온 날(지운 날 포함)과 달력 날로만 정해 쓰지 않은 날에도 온다. 기분·글 길이는 보지 않고 저장하지 않는다
 */
import { addDays } from './date'
import { yearlyDay } from './festival'
import { hasFinal } from './building'
import { arrivalsOf, type Resident } from './resident'
import type { Dated } from './types'

export interface AnniversaryDay {
  /** "100일", "1년" */
  label: string
}

export interface Anniversary extends AnniversaryDay {
  resident: Resident
}

const HUNDREDS = [100, 200, 300]

/** 그날이 arrivedOn 에 온 이웃의 기념일이면 그 이름. 이사 온 날 당일과 그 이전은 null */
export function anniversaryOf(arrivedOn: string, date: string): AnniversaryDay | null {
  if (date <= arrivedOn) return null
  const n = HUNDREDS.find((d) => addDays(arrivedOn, d - 1) === date)
  if (n) return { label: `${n}일` }
  const years = Number(date.slice(0, 4)) - Number(arrivedOn.slice(0, 4))
  return years >= 1 && yearlyDay(arrivedOn, Number(date.slice(0, 4))) === date ? { label: `${years}년` } : null
}

/** 그날 기념일인 이웃들(이사 온 차례로). built 는 집을 지었던 날(지운 날 포함) */
export function anniversariesOn(built: readonly Dated[], date: string): Anniversary[] {
  return arrivalsOf(built).flatMap((a) => {
    const day = a.date ? anniversaryOf(a.date, date) : null
    return day ? [{ resident: a.resident, ...day }] : []
  })
}

/** 오늘이거나 그 뒤로 가장 가까운 기념일(이웃 수첩에 쓴다) */
export function nextAnniversary(arrivedOn: string, today: string): AnniversaryDay & { date: string } {
  const hundred = HUNDREDS.map((d) => ({ date: addDays(arrivedOn, d - 1), label: `${d}일` })).find(
    (x) => x.date >= today && x.date > arrivedOn,
  )
  const start = Number(arrivedOn.slice(0, 4))
  let year = Math.max(start + 1, Number(today.slice(0, 4)))
  while (yearlyDay(arrivedOn, year) < today) year++
  const yearly = { date: yearlyDay(arrivedOn, year), label: `${year - start}년` }
  return hundred && hundred.date < yearly.date ? hundred : yearly
}

/** 기념일인 이웃이 누르면 처음 하는 한마디 */
export function anniversaryLine(day: AnniversaryDay): string {
  return `오늘은 내가 이사 온 지 ${day.label} 되는 날이에요!`
}

/** 그날 한 줄을 지으면 짓는 알림에 더하는 한 줄. 기념일인 이웃이 없으면 null */
export function anniversaryNote(list: readonly Anniversary[]): string | null {
  if (list.length === 0) return null
  if (list.length === 1) {
    const { resident, label } = list[0]
    return `🎉 오늘은 ${resident.name}${hasFinal(resident.name) ? '이' : '가'} 이사 온 지 ${label} 되는 날이에요`
  }
  // 괄호 뒤 토씨는 괄호 앞 이름에 맞춘다: 콩이(1년)와
  const parts = list.map((a) => `${a.resident.name}(${a.label})`)
  const head = parts.slice(0, -1).map((p, i) => `${p}${hasFinal(list[i].resident.name) ? '과' : '와'} `)
  return `🎉 오늘은 ${head.join('')}${parts[parts.length - 1]}의 이사 기념일이에요`
}
