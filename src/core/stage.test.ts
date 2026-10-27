import { describe, expect, it } from 'vitest'
import { STAGES, milestoneCard, nextStage, reachedStages, stageLabel, stageOf } from './stage'
import { LANDMARKS, reachedLandmarks } from './landmark'
import { addDays } from './date'
import type { Entry } from './types'

const e = (date: string, text = date): Entry => ({ date, text, mood: 'calm', writtenAt: 0 })
const days = (n: number, start = '2026-01-01'): Entry[] => Array.from({ length: n }, (_, i) => e(addDays(start, i)))

describe('마을 단계', () => {
  it('작은 동네에서 시작해 누적 날 수로 오르고, 이름이 모두 다르다', () => {
    expect(STAGES[0]).toMatchObject({ name: '작은 동네', days: 0 })
    expect(STAGES.map((s) => s.name).slice(0, 3)).toEqual(['작은 동네', '마을', '큰 마을'])
    expect(STAGES.map((s) => s.name)).toContain('읍내')
    expect(new Set(STAGES.map((s) => s.name)).size).toBe(STAGES.length)
    for (let i = 1; i < STAGES.length; i++) expect(STAGES[i].days).toBeGreaterThan(STAGES[i - 1].days)
  })

  it('쓴 날 수로만 정한다(빠진 날·띄엄띄엄·글 길이·기분과 상관없다)', () => {
    expect(stageOf([]).name).toBe('작은 동네')
    expect(stageOf(days(9)).name).toBe('작은 동네')
    expect(stageOf(days(10)).name).toBe('마을')
    const scattered = Array.from({ length: 10 }, (_, i) => e(addDays('2026-01-01', i * 9)))
    expect(stageOf(scattered).name).toBe('마을')
    const long = days(10).map((x) => ({ ...x, text: '아주 긴 하루였다 '.repeat(5), mood: 'blue' as const }))
    expect(stageOf(long)).toEqual(stageOf(days(10)))
    expect(stageOf(days(400))).toBe(STAGES[STAGES.length - 1])
  })

  it('다음 단계까지 남은 날', () => {
    expect(nextStage([])).toEqual({ stage: STAGES[1], left: 10 })
    expect(nextStage(days(10))).toEqual({ stage: STAGES[2], left: STAGES[2].days - 10 })
    expect(nextStage(days(400))).toBeNull()
  })

  it('한 줄로 넘은 단계를 알려 준다(가져오기로 여럿을 넘으면 여럿, 고치기는 없음)', () => {
    expect(reachedStages(days(9), days(10)).map((s) => s.name)).toEqual(['마을'])
    expect(reachedStages(days(10), days(11))).toEqual([])
    expect(reachedStages(days(10), days(10))).toEqual([])
    expect(reachedStages([], days(1))).toEqual([])
    expect(reachedStages([], days(400))).toEqual(STAGES.slice(1))
  })

  it('머리줄 표시', () => {
    expect(stageLabel([])).toBe(`${STAGES[0].icon} 작은 동네`)
    expect(stageLabel(days(10))).toBe(`${STAGES[1].icon} 마을`)
  })
})

describe('축하 카드(명소와 단계를 합친다)', () => {
  it('명소만 생기면 명소 축하 그대로', () => {
    const card = milestoneCard(reachedLandmarks(days(6), days(7)), [], days(7))
    expect(card.title).toBe('🪣 우물이 생겼어요!')
    expect(card.body).toBe('한 줄을 7일 남겼어요. 광장에 우물이 섰어요.')
    expect(card.next).toBe('다음은 7일 더 쓰면 꽃 정원이에요')
    expect(card.icons).toEqual(['🪣'])
    expect(card.visit?.id).toBe('well')
  })

  it('단계만 오르면 단계 축하와 다음 단계(보러 갈 명소는 없다)', () => {
    const card = milestoneCard([], reachedStages(days(9), days(10)), days(10))
    expect(card.title).toBe(`${STAGES[1].icon} 마을이 되었어요!`)
    expect(card.body).toBe('한 줄을 10일 남겼어요. 작은 동네가 마을로 자랐어요.')
    expect(card.next).toBe(`다음은 ${STAGES[2].days - 10}일 더 쓰면 큰 마을이 돼요`)
    expect(card.icons).toEqual([STAGES[1].icon])
    expect(card.visit).toBeNull()
  })

  it('같은 날 둘 다 오르면 한 카드에 함께 축하한다', () => {
    const before = days(STAGES[2].days - 1)
    const after = days(STAGES[2].days)
    const card = milestoneCard(reachedLandmarks(before, after), reachedStages(before, after), after)
    expect(card.title).toBe(`${STAGES[2].icon} 큰 마을이 되었어요!`)
    expect(card.body).toBe(`한 줄을 ${STAGES[2].days}일 남겼어요. 마을이 큰 마을로 자랐어요. 광장에 분수가 섰어요.`)
    expect(card.visit?.id).toBe('fountain')
    expect(card.icons).toEqual([STAGES[2].icon, '⛲'])
  })

  it('한꺼번에 끝까지 오르면 처음 단계에서 마지막 단계로 자랐다고 한다', () => {
    const card = milestoneCard(reachedLandmarks([], days(365)), reachedStages([], days(365)), days(365))
    const last = STAGES[STAGES.length - 1]
    expect(card.title).toBe(`${last.icon} ${last.name}${'가'} 되었어요!`)
    expect(card.body).toBe(`한 줄을 365일 남겼어요. 작은 동네가 ${last.name}로 자랐어요. 광장에 ${LANDMARKS.map((l) => l.name).join(', ')}가 섰어요.`)
    expect(card.next).toBeNull()
    expect(card.visit?.id).toBe('bigTree')
  })
})
