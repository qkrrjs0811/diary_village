import type { DayPart, WeatherKind } from './weather'

/** 계절. 구역의 땅·나무 색과 하늘에 흩날리는 것을 정한다(더 좋은 계절·나쁜 계절은 없다) */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

/** 'YYYY-MM' 또는 'YYYY-MM-DD'의 계절. 3~5월 봄, 6~8월 여름, 9~11월 가을, 12~2월 겨울 */
export function seasonOf(date: string): Season {
  const m = Number(date.slice(5, 7))
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter'
}

/** 계절마다 하늘에 흩날리는 것 */
export type DriftKind = 'petal' | 'firefly' | 'leaf' | 'snow'

export const DRIFT_OF: Record<Season, DriftKind> = { spring: 'petal', summer: 'firefly', autumn: 'leaf', winter: 'snow' }

/**
 * 흩날리는 것 하나. x·y: 마을 화면 안 자리(%), size: 크기(px), delay: 움직임 시작을 늦추는 정도(0~1).
 * 떨어지는 것(꽃잎·낙엽·눈)의 y는 처음 떨어지기 시작하는 자리라 화면 전체에 퍼진다.
 */
export interface DriftBit {
  kind: DriftKind
  x: number
  y: number
  size: number
  delay: number
}

const SIZE: Record<DriftKind, [number, number]> = { petal: [10, 14], firefly: [8, 11], leaf: [10, 14], snow: [6, 10] }

/** 같은 자리에 늘 같게 흩뿌리는 0~1 수 */
function spread(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return v - Math.floor(v)
}

const round = (n: number) => Math.round(n * 10) / 10

/** 1970-01-01부터 센 날 수 */
function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86400000)
}

/**
 * 오늘 하늘에 옅게 흩날릴 것(8~14개). 날짜(계절)와 때로만 정하고 저장하지 않는다.
 * 여름 반딧불은 저녁·밤에만 난다. 비 오는 날은 빗방울과 어수선하지 않게 반만 남긴다.
 */
export function driftBits(date: string, part: DayPart, weather?: WeatherKind): DriftBit[] {
  const kind = DRIFT_OF[seasonOf(date)]
  if (kind === 'firefly' && part === 'day') return []
  const day = dayNumber(date)
  const n = 8 + Math.floor(spread(day, 11) * 7)
  const [min, max] = SIZE[kind]
  const bits = Array.from({ length: n }, (_, i): DriftBit => {
    const k = day * 31 + i
    return {
      kind,
      // 칸을 나눠 고르게 퍼뜨리고 칸 안에서만 흔든다
      x: round(Math.min(100, ((i + 0.15 + spread(k, 12) * 0.7) / n) * 100)),
      // 반딧불은 땅 가까이(화면 아래쪽 절반)에서 반짝인다
      y: round(kind === 'firefly' ? 45 + spread(k, 13) * 50 : spread(k, 13) * 100),
      size: round(min + spread(k, 14) * (max - min)),
      delay: round(spread(k, 15)),
    }
  })
  return weather === 'rain' ? bits.filter((_, i) => i % 2 === 0) : bits
}

/** 굴뚝 연기는 쌀쌀한 계절(가을·겨울)의 저녁·밤에 피어오른다. 계절은 오늘 날짜로 정한다 */
export function smokeOn(today: string, part: DayPart): boolean {
  const season = seasonOf(today)
  return part !== 'day' && (season === 'autumn' || season === 'winter')
}

/**
 * 한 집 굴뚝 연기의 가락. delay: 피어오르기 시작을 늦추는 정도(0~1), lean: 바람에 기우는 쪽, count: 연기 줌 수(2~3).
 * 집이 선 날짜로만 정해 늘 같고, 이웃한 날 집끼리는 박자가 어긋나 한꺼번에 뭉게뭉게 오르지 않는다.
 */
export function smokePuff(houseDate: string): { delay: number; lean: -1 | 1; count: number } {
  const day = dayNumber(houseDate)
  // 황금비만큼씩 돌리면 이웃한 날의 시작이 0.38 넘게 벌어진다
  const turn = (day * 0.618034) % 1
  return {
    delay: Math.floor(turn * 100) / 100,
    lean: spread(day, 21) < 0.5 ? -1 : 1,
    count: spread(day, 22) < 0.5 ? 2 : 3,
  }
}
