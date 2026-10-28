import type { KV } from './storage'
import type { MoodId } from './types'

/**
 * 짓는 순간의 소리. 기분은 등급이 아니라 색깔이라, 기분마다 음계(높이)만 다르고
 * 음 수·길이·크기는 모두 같다. 울적한 날도 맑고 예쁜 소리다. 글 길이와는 상관없다
 */
export interface Note {
  /** 음 높이(Hz) */
  freq: number
  /** 시작(초) */
  at: number
  /** 길이(초) */
  dur: number
  /** 크기(0~1) */
  gain: number
}

/** 기분마다 다섯 음 음계(MIDI 번호). 마지막 음은 첫 음의 한 옥타브 위로 맺는다 */
const SCALES: Record<MoodId, number[]> = {
  great: [72, 74, 76, 79, 81], // C 장조 오음 — 높고 밝게
  calm: [65, 67, 69, 72, 74], // F 장조 오음
  meh: [67, 69, 71, 74, 76], // G 장조 오음
  blue: [69, 72, 74, 76, 79], // A 단조 오음 — 빗소리처럼 맑게
  tired: [62, 65, 67, 69, 72], // D 단조 오음 — 자장가처럼 낮게
}

/** 가락 모양(음계 자리). 5는 첫 음의 옥타브 위 */
const CONTOURS = [
  [0, 2, 4, 5],
  [0, 1, 2, 5],
  [2, 1, 3, 5],
  [0, 2, 3, 5],
  [1, 3, 4, 5],
]

const STEP = 0.11
const LAST = 0.6
const GAIN = 0.2

const hz = (midi: number) => Math.round(440 * 2 ** ((midi - 69) / 12) * 100) / 100

/** 그날 지은 집의 짧은 실로폰 가락. 같은 날은 같은 가락, 날마다 모양이 살짝 다르다 */
export function buildTune(mood: MoodId, date: string): Note[] {
  const scale = SCALES[mood] ?? SCALES.calm
  let seed = 0
  for (const ch of date) seed = (seed * 31 + ch.charCodeAt(0)) % 9973
  const contour = CONTOURS[seed % CONTOURS.length]
  return contour.map((i, k) => ({
    freq: hz(i === 5 ? scale[0] + 12 : scale[i]),
    at: Math.round(k * STEP * 100) / 100,
    dur: k === contour.length - 1 ? LAST : STEP * 1.6,
    gain: GAIN,
  }))
}

/** 집이 쑥 올라올 때 폰이 짧게 떤다(ms: 떨림, 쉼, 떨림) */
export const BUZZ = [30, 40, 50]

/** 짓기 말고 마을에서 나는 짧은 소리: 명소·단계 축하, 주민 누르기, 소품 놓기, 읽기 창 넘기기 */
export type Cue = 'celebrate' | 'resident' | 'place' | 'turn'

/** 축하는 C 장조 화음을 한 옥타브 넘게 차례로 올라간다(짓는 소리보다 길게) */
const FANFARE = [72, 76, 79, 84, 88]
/** 주민 목소리 높이(MIDI). 주민마다 하나를 골라 "뾰롱" 두 음으로 대답한다 */
const VOICES = [74, 76, 79, 81, 84, 86]

/** 짧은 소리 가락. 주민 소리는 key(주민 id)로 목소리 높이가 정해진다 */
export function cueTune(cue: Cue, key = ''): Note[] {
  if (cue === 'celebrate') {
    return FANFARE.map((m, k) => ({
      freq: hz(m),
      at: Math.round(k * 0.12 * 100) / 100,
      dur: k === FANFARE.length - 1 ? 0.9 : 0.25,
      gain: GAIN * 0.9,
    }))
  }
  if (cue === 'resident') {
    let seed = 0
    for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) % 9973
    const base = VOICES[seed % VOICES.length]
    return [
      { freq: hz(base), at: 0, dur: 0.12, gain: GAIN * 0.6 },
      { freq: hz(base + 5), at: 0.08, dur: 0.18, gain: GAIN * 0.6 },
    ]
  }
  if (cue === 'turn') {
    // 책장을 넘기는 여린 "사락": 두 음이 살짝 내려간다
    return [
      { freq: hz(81), at: 0, dur: 0.1, gain: GAIN * 0.4 },
      { freq: hz(76), at: 0.06, dur: 0.16, gain: GAIN * 0.4 },
    ]
  }
  // 소품을 땅에 내려놓는 나무 "톡"
  return [{ freq: hz(64), at: 0, dur: 0.14, gain: GAIN * 0.7 }]
}

/** 자라 온 길에서 집이 오를 때 오르는 음(C 장조 오음, 낮은 도에서 두 옥타브 위 도까지) */
const RISE = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84]

/** 자라 온 길: total 채 가운데 index 번째 집이 오를 때 울리는 한 음. 마을이 자랄수록 높아진다 */
export function growthTune(index: number, total: number): Note[] {
  const k = total > 1 ? Math.round((index / (total - 1)) * (RISE.length - 1)) : 0
  return [{ freq: hz(RISE[Math.min(RISE.length - 1, Math.max(0, k))]), at: 0, dur: 0.22, gain: GAIN * 0.5 }]
}

/** 짧은 소리의 떨림. 주민 누르기·책장 넘기기는 자주 하니 떨지 않는다 */
export const CUE_BUZZ: Record<Cue, number[]> = {
  celebrate: [20, 40, 20, 40, 20],
  resident: [],
  place: [15],
  turn: [],
}

/** 소리 켜기는 사용자가 직접 정한 값이라 따로 저장한다 */
export const SOUND_KEY = 'diary-village:sound'

/** 처음이거나 못 읽으면 켜져 있다 */
export function soundOn(kv: KV): boolean {
  try {
    return kv.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setSound(kv: KV, on: boolean): void {
  kv.setItem(SOUND_KEY, on ? 'on' : 'off')
}
