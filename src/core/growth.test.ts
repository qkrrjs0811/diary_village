import { describe, expect, it } from 'vitest'
import { GROWTH_MAX_MS, growthDelays, growthEnd, growthNote, growthRings, growthScenes, growthSteps } from './growth'
import { eraseEntry } from './entries'
import { addDays } from './date'
import type { Entry, SaveData } from './types'

const e = (date: string, text = '평범한 하루', mood: Entry['mood'] = 'calm'): Entry => ({ date, text, mood, writtenAt: 0 })
const save = (entries: Entry[], erased: SaveData['erased'] = undefined): SaveData => ({ version: 1, entries, ...(erased ? { erased } : {}) })
const days = (n: number, start = '2026-01-01'): Entry[] => Array.from({ length: n }, (_, i) => e(addDays(start, i)))

describe('마을이 자라 온 길', () => {
  it('집을 지었던 날을 날짜 순으로 늘어놓고 누적 날 수와 몇 번째 집인지 붙인다(저장 순서와 무관)', () => {
    const steps = growthSteps(save([e('2026-03-05'), e('2026-03-01'), e('2026-03-02')]))
    expect(steps.map((s) => s.date)).toEqual(['2026-03-01', '2026-03-02', '2026-03-05'])
    expect(steps.map((s) => s.day)).toEqual([1, 2, 3])
    expect(steps.map((s) => s.house)).toEqual([1, 2, 3])
    expect(growthSteps(save([]))).toEqual([])
  })

  it('지운 날은 집이 서지 않지만 날 수에는 들어간다(명소·단계·이웃을 빼앗지 않는다)', () => {
    let s = save(days(7))
    const r = eraseEntry(s, '2026-01-03', 1)
    if (!r.ok) throw new Error('지우기 실패')
    s = r.save
    const steps = growthSteps(s)
    expect(steps).toHaveLength(7)
    expect(steps[2]).toMatchObject({ date: '2026-01-03', day: 3, house: null, building: null })
    expect(steps.map((x) => x.house)).toEqual([1, 2, null, 3, 4, 5, 6])
    expect(steps[6].landmarks.map((l) => l.name)).toEqual(['우물'])
    expect(growthEnd(steps)).toBe('오늘까지 6채의 집이 모였어요')
  })

  it('그날 생긴 명소·오른 마을 단계·이사 온 이웃을 붙인다(있는 셈과 같은 날)', () => {
    const steps = growthSteps(save(days(30)))
    expect(steps[0].landmarks).toEqual([])
    expect(steps[0].stage).toBeNull()
    expect(steps[0].arrivals.map((r) => r.name)).toEqual(['콩이'])
    expect(steps[6].landmarks.map((l) => l.name)).toEqual(['우물'])
    expect(steps[9].stage?.name).toBe('마을')
    expect(steps[13].landmarks.map((l) => l.name)).toEqual(['꽃 정원'])
    expect(steps[29].landmarks.map((l) => l.name)).toEqual(['분수'])
    expect(steps[29].stage?.name).toBe('큰 마을')
    expect(steps[29].arrivals.map((r) => r.name)).toEqual(['감자'])
    expect(steps[1]).toMatchObject({ landmarks: [], stage: null, arrivals: [] })
    // 띄엄띄엄 써도 누적 날 수로 센다
    const scattered = Array.from({ length: 10 }, (_, i) => e(addDays('2026-01-01', i * 9)))
    expect(growthSteps(save(scattered))[9].stage?.name).toBe('마을')
  })

  it('그날 선 건물을 붙인다(글을 고치면 따라 바뀐다)', () => {
    const steps = growthSteps(save([e('2026-01-01', '커피 한 잔'), e('2026-01-02')]))
    expect(steps[0].building).toBe('cafe')
    expect(steps[1].building).toBeNull()
  })

  it('글 내용은 들어가지 않고, 기분·글 길이는 아무것도 바꾸지 않는다', () => {
    const secret = '아무도 모르는 비밀 이야기'
    const a = growthSteps(save(days(40).map((x) => ({ ...x, text: secret, more: secret }))))
    expect(JSON.stringify(a)).not.toContain('비밀')
    const plain = growthSteps(save(days(40)))
    const moody = growthSteps(save(days(40).map((x, i) => ({ ...x, mood: i % 2 ? ('blue' as const) : ('great' as const), text: '긴 하루 '.repeat(20) }))))
    expect(moody).toEqual(plain)
    expect(growthEnd(moody)).toBe(growthEnd(plain))
    expect(growthDelays(moody)).toEqual(growthDelays(plain))
  })

  it('축하 날 한 줄("30일째, 분수가 생겼어요")을 만든다. 아무 일 없는 날은 null', () => {
    const steps = growthSteps(save(days(30)))
    expect(growthNote(steps[1])).toBeNull()
    expect(growthNote(steps[0])).toBe('1일째, 콩이가 이사 왔어요')
    expect(growthNote(steps[6])).toBe('7일째, 우물이 생기고 두부가 이사 왔어요')
    expect(growthNote(steps[9])).toBe('10일째, 마을이 되고 호두가 이사 왔어요')
    expect(growthNote(steps[29])).toBe('30일째, 분수가 생기고 큰 마을이 되고 감자가 이사 왔어요')
    expect(growthNote(steps[29])).not.toMatch(/빠진|끊|못/)
  })

  it('장면 길이: 모두 합쳐 십몇 초 안이고, 축하 날은 잠깐 더 멈춘다', () => {
    for (const n of [1, 3, 10, 30, 100, 365, 800]) {
      const steps = growthSteps(save(days(n)))
      const delays = growthDelays(steps)
      expect(delays).toHaveLength(n)
      const total = delays.reduce((a, b) => a + b, 0)
      expect(total).toBeLessThanOrEqual(GROWTH_MAX_MS)
      for (const d of delays) expect(d).toBeGreaterThanOrEqual(10)
      steps.forEach((s, i) => {
        const plain = steps.findIndex((x) => growthNote(x) === null)
        if (growthNote(s) && plain >= 0) expect(delays[i]).toBeGreaterThan(delays[plain])
      })
    }
    // 집이 몇 채 없으면 한 채씩 천천히 본다
    const few = growthDelays(growthSteps(save(days(3))))
    expect(few[1]).toBeGreaterThanOrEqual(500)
    // 많으면 빠르게
    const many = growthDelays(growthSteps(save(days(365))))
    expect(many[1]).toBeLessThan(few[1])
    expect(growthDelays([])).toEqual([])
  })

  it('끝 문장은 지금 서 있는 집 수로 말한다', () => {
    expect(growthEnd(growthSteps(save(days(1))))).toBe('오늘까지 1채의 집이 모였어요')
    expect(growthEnd(growthSteps(save(days(42))))).toBe('오늘까지 42채의 집이 모였어요')
    expect(growthEnd([])).toBeNull()
  })

  it('움직임 줄이기: 첫 집·축하 날·오늘만 몇 장면 고른다(단계 오른 날을 먼저)', () => {
    const steps = growthSteps(save(days(100)))
    const scenes = growthScenes(steps)
    expect(scenes.length).toBeLessThanOrEqual(5)
    expect(scenes[0]).toBe(0)
    expect(scenes[scenes.length - 1]).toBe(99)
    expect([...scenes].sort((a, b) => a - b)).toEqual(scenes)
    expect(new Set(scenes).size).toBe(scenes.length)
    // 가운데 장면은 마을 단계가 오른 날이 먼저다
    for (const i of scenes.slice(1, -1)) expect(steps[i].stage).not.toBeNull()
    // 집이 적으면 모두 본다
    expect(growthScenes(growthSteps(save(days(3))))).toEqual([0, 1, 2])
    expect(growthScenes(growthSteps(save(days(1))))).toEqual([0])
    expect(growthScenes([])).toEqual([])
    // 축하 날이 없어도 고르게 나눠 본다
    const quiet = growthSteps(save(days(40))).map((s) => ({ ...s, landmarks: [], stage: null, arrivals: [] }))
    const q = growthScenes(quiet)
    expect(q.length).toBe(5)
    expect(q[0]).toBe(0)
    expect(q[4]).toBe(39)
  })

  it('소리는 너무 촘촘하지 않게 몇 집마다 한 번 울린다(첫 집은 늘 울린다)', () => {
    const few = growthDelays(growthSteps(save(days(5))))
    expect(growthRings(few)).toEqual([true, true, true, true, true])
    const many = growthDelays(growthSteps(save(days(800))))
    const rings = growthRings(many)
    expect(rings).toHaveLength(800)
    expect(rings[0]).toBe(true)
    let last = 0
    let at = 0
    many.forEach((d, i) => {
      if (i > 0 && rings[i]) {
        expect(at - last).toBeGreaterThanOrEqual(120)
        last = at
      }
      at += d
    })
    expect(rings.filter(Boolean).length).toBeGreaterThan(20)
    expect(growthRings([])).toEqual([])
  })
})
