/**
 * 마을이 자라 온 길: 첫 집부터 오늘까지 집을 지었던 날을 날짜 순으로 다시 보는 장면의 규칙.
 * 기록에서 계산하고 저장하지 않는다. 명소·단계·이웃은 있는 셈을 그대로 쓰고, 글 내용은 담지 않는다
 */
import { buildingOf, hasFinal, type BuildingId } from './building'
import { builtDays } from './entries'
import { reachedLandmarks, type Landmark } from './landmark'
import { arrivalsOf, type Resident } from './resident'
import { reachedStages, type Stage } from './stage'
import type { SaveData } from './types'

export interface GrowthStep {
  date: string
  /** 그날까지 집을 지었던 날 수(지운 날 포함) */
  day: number
  /** 그날 선 집이 몇 번째 집인지. 지운 날은 집이 없어 null */
  house: number | null
  /** 그날 선 건물. 보통 집이나 지운 날이면 null */
  building: BuildingId | null
  /** 그날 생긴 명소 */
  landmarks: Landmark[]
  /** 그날 오른 마을 단계(없으면 null) */
  stage: Stage | null
  /** 그날 이사 온 이웃 */
  arrivals: Resident[]
}

export function growthSteps(save: SaveData): GrowthStep[] {
  const built = builtDays(save)
  const byDate = new Map(save.entries.map((e) => [e.date, e]))
  const arrivals = arrivalsOf(built)
  let house = 0
  return built.map((d, i) => {
    const entry = byDate.get(d.date)
    if (entry) house++
    const before = built.slice(0, i)
    const after = built.slice(0, i + 1)
    const stages = reachedStages(before, after)
    return {
      date: d.date,
      day: i + 1,
      house: entry ? house : null,
      building: entry ? (buildingOf(entry)?.id ?? null) : null,
      landmarks: reachedLandmarks(before, after),
      stage: stages.length ? stages[stages.length - 1] : null,
      arrivals: arrivals.filter((a) => a.date === d.date).map((a) => a.resident),
    }
  })
}

const ga = (word: string) => `${word}${hasFinal(word) ? '이' : '가'}`
const wa = (word: string) => `${word}${hasFinal(word) ? '과' : '와'}`

/** 축하 날 멈춰서 띄우는 한 줄("30일째, 분수가 생겼어요"). 아무 일 없는 날은 null */
export function growthNote(step: GrowthStep): string | null {
  // [누가, 이어 말할 때, 맺을 때] — 앞의 것은 "-고"로 잇고 마지막 것만 맺는다
  const parts: [string, string, string][] = []
  if (step.landmarks.length) parts.push([ga(step.landmarks.map((l) => l.name).join(', ')), '생기고', '생겼어요'])
  if (step.stage) parts.push([ga(step.stage.name), '되고', '되었어요'])
  if (step.arrivals.length) {
    const names = step.arrivals.map((r) => r.name)
    const who = names.slice(0, -1).map((n) => `${wa(n)} `).join('') + ga(names[names.length - 1])
    parts.push([who, '이사 오고', '이사 왔어요'])
  }
  if (!parts.length) return null
  const said = parts.map(([who, go, done], i) => `${who} ${i === parts.length - 1 ? done : go}`)
  return `${step.day}일째, ${said.join(' ')}`
}

/** 장면 전체가 이 안에 끝난다(ms) */
export const GROWTH_MAX_MS = 16000
const SLOW_MS = 700
const PAUSE_MAX_MS = 1200
const PAUSE_BUDGET_MS = 4000

/**
 * 장면마다 다음 집까지 기다리는 시간(ms). 집이 적으면 천천히, 많으면 빠르게 지나가고
 * 축하 날은 잠깐 더 멈춘다. 모두 합쳐 GROWTH_MAX_MS 안이다
 */
export function growthDelays(steps: GrowthStep[]): number[] {
  if (!steps.length) return []
  const notes = steps.map((s) => growthNote(s) !== null)
  const pauses = notes.filter(Boolean).length
  const extra = pauses ? Math.min(PAUSE_MAX_MS, PAUSE_BUDGET_MS / pauses) : 0
  const base = Math.min(SLOW_MS, (GROWTH_MAX_MS - 2000 - extra * pauses) / steps.length)
  return notes.map((n) => Math.floor(n ? base + extra : base))
}

/** 움직임 줄이기에서 한 장면을 보여 주는 시간(ms) */
export const GROWTH_CALM_MS = 1800
const CALM_SCENES = 5

/**
 * 움직임 줄이기면 집이 오르는 움직임 없이 몇 장면만 차례로 본다(장면 번호, 날짜 순).
 * 첫 집과 오늘은 늘 들어가고, 가운데는 마을 단계가 오른 날 → 명소가 생긴 날 → 이웃이 온 날 순으로 고르고,
 * 모자라면 고르게 나눈 날로 채운다
 */
export function growthScenes(steps: GrowthStep[]): number[] {
  const n = steps.length
  if (n <= CALM_SCENES) return steps.map((_, i) => i)
  const picked = new Set([0, n - 1])
  const ranks = [(s: GrowthStep) => s.stage !== null, (s: GrowthStep) => s.landmarks.length > 0, (s: GrowthStep) => s.arrivals.length > 0]
  for (const is of ranks) {
    // 같은 종류가 넘치면 고르게 나눠 고른다
    const found = steps.map((s, i) => (is(s) && !picked.has(i) ? i : -1)).filter((i) => i >= 0)
    const room = CALM_SCENES - picked.size
    if (room <= 0) break
    const take = found.length <= room ? found : Array.from({ length: room }, (_, k) => found[Math.floor(((k + 0.5) * found.length) / room)])
    for (const i of take) picked.add(i)
  }
  const even = Array.from({ length: CALM_SCENES - 2 }, (_, k) => Math.round(((k + 1) * (n - 1)) / (CALM_SCENES - 1)))
  for (const i of [...even, ...steps.keys()]) {
    if (picked.size >= CALM_SCENES) break
    picked.add(i)
  }
  return [...picked].sort((a, b) => a - b)
}

/** 집이 오를 때 실로폰이 울리는 사이는 적어도 이만큼(ms) 둔다 */
const RING_GAP_MS = 120

/** 어느 집에서 소리가 울리는지. 집이 빠르게 지나가면 몇 집마다 한 번만 울린다(첫 집은 늘 울린다) */
export function growthRings(delays: number[]): boolean[] {
  let last = -Infinity
  let at = 0
  return delays.map((d) => {
    const ring = at - last >= RING_GAP_MS
    if (ring) last = at
    at += d
    return ring
  })
}

/** 다 보고 난 끝 문장. 집을 지은 적이 없으면 null */
export function growthEnd(steps: GrowthStep[]): string | null {
  if (!steps.length) return null
  const houses = steps.filter((s) => s.house !== null).length
  return `오늘까지 ${houses}채의 집이 모였어요`
}
