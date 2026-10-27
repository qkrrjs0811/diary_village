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
