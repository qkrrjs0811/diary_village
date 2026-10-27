import { moodOf } from './mood'
import type { Entry, MoodId } from './types'

/** 마을 하늘의 날씨. 기분은 등급이 아니라 색깔·날씨다(어떤 날씨든 예쁘게 그린다) */
export type WeatherKind = 'sunny' | 'partly' | 'cloudy' | 'rain' | 'starry'

export const WEATHER_OF: Record<MoodId, WeatherKind> = {
  great: 'sunny',
  calm: 'partly',
  meh: 'cloudy',
  blue: 'rain',
  tired: 'starry',
}

/** 오늘 쓴 기분이 날씨를 정한다. 오늘 자리가 비었으면 구름 조금 낀 날(지난 기분으로 비를 내리지 않는다) */
export function weatherOf(entries: Entry[], today: string): WeatherKind {
  const entry = entries.find((x) => x.date === today)
  return entry ? WEATHER_OF[entry.mood] : 'partly'
}

/**
 * 하늘에 그릴 것 하나. x·y: 마을 화면 안 자리(%), size: 크기(px), delay: 움직임 시작을 늦추는 정도(0~1).
 * 빗방울의 y는 처음 떨어지기 시작하는 자리라 화면 전체에 퍼진다.
 */
export interface SkyBit {
  kind: 'sun' | 'moon' | 'cloud' | 'star' | 'drop'
  x: number
  y: number
  size: number
  delay: number
  /** 구름 색: 맑은 날은 흰 구름, 흐리고 비 오는 날은 회색 구름. 저녁엔 노을빛(해도), 밤엔 밤빛 구름 */
  tone?: 'white' | 'grey' | 'dusk' | 'night'
}

/** 지금 시각의 때. 하늘 색과 창문 불빛이 바뀐다 */
export type DayPart = 'day' | 'evening' | 'night'

/** 사용자 기준 시간대로 6~17시는 낮, 17~20시는 저녁, 20~6시는 밤 */
export function dayPart(ms: number): DayPart {
  const h = new Date(ms).getHours()
  return h >= 6 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'evening' : 'night'
}

/** 저녁과 밤에는 집 창문에 불이 켜진다 */
export function windowsLit(part: DayPart): boolean {
  return part !== 'day'
}

export function mix(a: string, b: string, t: number): string {
  const ca = parseInt(a.slice(1), 16)
  const cb = parseInt(b.slice(1), 16)
  const ch = (s: number) => Math.round(((ca >> s) & 255) * (1 - t) + ((cb >> s) & 255) * t)
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
}

/** 하늘 위·아래 색. 낮은 기분 하늘 그대로, 저녁은 노을빛, 밤은 밤빛으로 같은 기분 하늘을 물들인다 */
export function skyColors(mood: MoodId, part: DayPart): [string, string] {
  const [top, bottom] = moodOf(mood).sky
  if (part === 'day') return [top, bottom]
  if (part === 'evening') return [mix(top, '#f3a7a2', 0.5), mix(bottom, '#ffd8a6', 0.6)]
  return [mix(top, '#28306a', 0.7), mix(bottom, '#6f6aa8', 0.65)]
}

/** 같은 자리에 늘 같게 흩뿌리는 0~1 수 */
function spread(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return v - Math.floor(v)
}

const round = (n: number) => Math.round(n * 10) / 10

function clouds(list: [number, number, number][], tone: 'white' | 'grey'): SkyBit[] {
  return list.map(([x, y, size], i) => ({ kind: 'cloud', x, y, size, delay: round(spread(i, 3)), tone }))
}

function stars(n: number): SkyBit[] {
  return Array.from({ length: n }, (_, i) => {
    const x = round(4 + spread(i, 1) * 92)
    // 오른쪽 위 날씨 이름표 자리는 피한다
    const y = round(x > 60 ? 9 + spread(i, 2) * 29 : 2 + spread(i, 2) * 36)
    return { kind: 'star', x, y, size: round(5 + spread(i, 4) * 5), delay: round(spread(i, 5)) }
  })
}

function drops(n: number): SkyBit[] {
  return Array.from({ length: n }, (_, i) => ({
    kind: 'drop',
    x: round(((i + spread(i, 6)) / n) * 100),
    y: round(spread(i, 7) * 100),
    size: round(10 + spread(i, 8) * 8),
    delay: round(spread(i, 9)),
  }))
}

/** 날씨마다 하늘에 그릴 것(해·달·구름·별·빗방울). 저녁엔 해가 낮게 노을빛으로, 밤엔 해 대신 달이 뜬다 */
export function skyBits(kind: WeatherKind, part: DayPart = 'day'): SkyBit[] {
  const bits = daySky(kind)
  if (part === 'day') return bits
  if (part === 'evening') {
    return bits.map((b) =>
      b.kind === 'sun' ? { ...b, y: 30, size: b.size + 6, tone: 'dusk' } : b.kind === 'cloud' && b.tone === 'white' ? { ...b, tone: 'dusk' } : b,
    )
  }
  if (kind === 'starry') return bits
  // 밤: 해 자리에 달. 맑은 밤일수록 별이 많다(별은 구름 뒤에 그린다)
  const moon = (b: SkyBit): SkyBit => (b.kind === 'sun' ? { kind: 'moon', x: b.x, y: b.y, size: 34, delay: 0 } : b.kind === 'cloud' && b.tone === 'white' ? { ...b, tone: 'night' } : b)
  const n = kind === 'sunny' ? 10 : kind === 'partly' ? 6 : 0
  return [...stars(n), ...bits.map(moon)]
}

function daySky(kind: WeatherKind): SkyBit[] {
  switch (kind) {
    case 'sunny':
      return [{ kind: 'sun', x: 16, y: 9, size: 46, delay: 0 }, ...clouds([[52, 14, 44]], 'white')]
    case 'partly':
      return [{ kind: 'sun', x: 16, y: 9, size: 38, delay: 0 }, ...clouds([[26, 13, 56], [56, 22, 46], [86, 15, 40]], 'white')]
    case 'cloudy':
      return clouds([[14, 8, 66], [45, 12, 58], [78, 16, 62], [28, 25, 50], [64, 30, 44]], 'grey')
    case 'rain':
      return [...clouds([[12, 6, 70], [44, 10, 66], [78, 14, 68], [28, 22, 54]], 'grey'), ...drops(28)]
    case 'starry':
      return [{ kind: 'moon', x: 18, y: 10, size: 34, delay: 0 }, ...stars(16)]
  }
}
