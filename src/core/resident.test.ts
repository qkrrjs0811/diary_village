import { describe, expect, it } from 'vitest'
import { GUEST_PLAYS, RESIDENTS, guestLine, guestPlayLine, residentLine, residentsOf, residentTalk, residentWalks, storyDay, storyTalk, todayGuests } from './resident'
import { BUILDINGS, findBuilding } from './building'
import { memoryDates } from './memory'
import { replyOf } from './reply'
import { PLAZA } from './landmark'
import { festivalLine, festivalOn } from './festival'
import { BLOCK_H, BLOCK_W, ROAD, buildVillage } from './village'
import { addDays } from './date'
import type { Entry } from './types'

const e = (date: string, text = '그냥 하루'): Entry => ({ date, text, mood: 'calm', writtenAt: 0 })
/** start 부터 n일을 이어서 쓴 기록 */
const days = (n: number, start = '2026-01-01'): Entry[] => Array.from({ length: n }, (_, i) => e(addDays(start, i)))

describe('주민', () => {
  it('쓴 날이 쌓일수록 늘고, 첫날부터 한 명이 산다', () => {
    expect(residentsOf([])).toEqual([])
    expect(residentsOf(days(1))).toHaveLength(1)
    expect(residentsOf(days(3))).toHaveLength(2)
    const counts = [1, 5, 10, 30, 100, 365].map((n) => residentsOf(days(n)).length)
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1])
    expect(residentsOf(days(400))).toHaveLength(RESIDENTS.length)
  })

  it('누적 날 수로만 정한다(같은 날·띄엄띄엄·글 길이·기분은 상관없다)', () => {
    const spread = [e('2026-01-01'), e('2026-03-10'), e('2026-09-30', '아주 긴 글'.repeat(10))]
    expect(residentsOf(spread)).toEqual(residentsOf(days(3)))
    expect(residentsOf([e('2026-01-01'), e('2026-01-01')])).toHaveLength(1)
    const blue = days(10).map((x) => ({ ...x, mood: 'blue' as const }))
    expect(residentsOf(blue)).toEqual(residentsOf(days(10)))
  })

  it('이름과 모습이 서로 다르고, 들어오는 날 수가 커지는 순서다', () => {
    expect(new Set(RESIDENTS.map((r) => r.id)).size).toBe(RESIDENTS.length)
    expect(new Set(RESIDENTS.map((r) => r.name)).size).toBe(RESIDENTS.length)
    for (let i = 1; i < RESIDENTS.length; i++) expect(RESIDENTS[i].days).toBeGreaterThan(RESIDENTS[i - 1].days)
    expect(RESIDENTS[0].days).toBe(1)
  })

  it('걷는 길은 집 자리가 아닌 길·광장 돌길 위 한 칸이고, 처음 주민은 오늘 구역에 산다', () => {
    const entries = days(40, '2026-09-20')
    const village = buildVillage(entries, '2026-10-29')
    const walks = residentWalks(village, residentsOf(entries))
    expect(walks).toHaveLength(residentsOf(entries).length)
    const lots = new Set(village.blocks.flatMap((b) => b.lots.map((l) => `${l.gx},${l.gy}`)))
    for (const w of walks) {
      expect(Math.hypot(w.to.gx - w.from.gx, w.to.gy - w.from.gy)).toBeCloseTo(1)
      // 한 줄로만 걷는다(가로 또는 세로)
      expect(w.from.gx === w.to.gx || w.from.gy === w.to.gy).toBe(true)
      for (const t of [0, 0.5, 1]) {
        const gx = w.from.gx + (w.to.gx - w.from.gx) * t
        const gy = w.from.gy + (w.to.gy - w.from.gy) * t
        expect(lots.has(`${Math.floor(gx)},${Math.floor(gy)}`)).toBe(false)
      }
    }
    // 같은 길에 두 주민이 겹치지 않는다
    expect(new Set(walks.map((w) => `${w.from.gx},${w.from.gy}`)).size).toBe(walks.length)
    // 첫 주민은 가장 최근(오늘) 구역 둘레 길에, 둘째는 광장에
    const last = village.blocks[village.blocks.length - 1]
    const gx0 = last.bx * (BLOCK_W + ROAD)
    const gy0 = last.by * (BLOCK_H + ROAD)
    const w0 = walks[0].from
    expect(w0.gx).toBeGreaterThanOrEqual(gx0)
    expect(w0.gx).toBeLessThanOrEqual(gx0 + BLOCK_W + ROAD)
    expect(w0.gy).toBeGreaterThanOrEqual(gy0)
    expect(w0.gy).toBeLessThanOrEqual(gy0 + BLOCK_H + ROAD)
    const w1 = walks[1].from
    expect(w1.gy).toBeGreaterThanOrEqual(PLAZA.gy)
    expect(w1.gy).toBeLessThanOrEqual(PLAZA.gy + PLAZA.h)
  })

  it('길이 모자라면 남는 주민은 걷지 않는다(겹치지 않게)', () => {
    const village = buildVillage([], '2026-10-27')
    const many = RESIDENTS
    const walks = residentWalks(village, many)
    expect(walks.length).toBeLessThan(many.length)
    expect(new Set(walks.map((w) => `${w.from.gx},${w.from.gy}`)).size).toBe(walks.length)
  })

  it('누르면 짧은 한마디. 처음엔 오늘 이야기, 다시 누르면 다른 말', () => {
    const r = RESIDENTS[0]
    const today = '2026-10-27'
    expect(residentLine(r, [e('2026-10-26')], today, 0)).toBe('오늘은 어떤 하루였어요?')
    expect(residentLine(r, [e(today, '라떼 한 잔')], today, 0)).toBe('새로 생긴 카페에 가 봤어요!')
    expect(residentLine(r, [e(today)], today, 0)).toBe('오늘 지은 집, 참 예뻐요.')
    const lines = new Set([1, 2, 3, 4, 5].map((t) => residentLine(r, [e(today)], today, t)))
    expect(lines.size).toBe(5)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(20)
    // 누적 날 수를 말할 뿐 연속 기록은 말하지 않는다(지난 글이 있으면 첫 다음 차례는 지난 이야기)
    const all = [2, 3, 4, 5, 6].map((t) => residentLine(r, days(12), today, t)).join(' ')
    expect(all).toContain('한 줄이 12일')
    expect(all).not.toMatch(/연속|끊/)
  })

  it('잔치 날에는 두 번째로 누르면 잔치 한마디, 그 뒤는 여느 때 말을 차례로 한다', () => {
    const r = RESIDENTS[0]
    const today = '2026-12-24'
    const f = festivalOn([], today)!
    const es = [e(today)]
    expect(residentLine(r, es, today, 0, es, f)).toBe('오늘 지은 집, 참 예뻐요.')
    expect(residentLine(r, es, today, 1, es, f)).toBe(festivalLine(f, r.id))
    expect(residentLine(r, es, today, 2, es, f)).toBe(residentLine(r, es, today, 1))
    expect(residentLine(r, es, today, 3, es, f)).toBe(residentLine(r, es, today, 2))
    // 잔치가 없는 날은 그대로
    expect(residentLine(r, es, today, 1, es, null)).toBe(residentLine(r, es, today, 1))
  })
})

describe('주민 이야기', () => {
  const today = '2026-10-27'
  const past = days(60, '2026-08-01').filter((x) => x.date < today)

  it('지난 글이 없으면 이야기가 없다(오늘 글만 있어도 없다)', () => {
    expect(storyDay(RESIDENTS[0], [], today)).toBeNull()
    expect(storyDay(RESIDENTS[0], [e(today)], today)).toBeNull()
    // 내일 날짜 글(있을 수 없지만)도 꺼내지 않는다
    expect(storyDay(RESIDENTS[0], [e('2026-10-28')], today)).toBeNull()
  })

  it('같은 주민·같은 날은 같은 이야기, 주민·날이 바뀌면 다른 날도 꺼낸다', () => {
    const r = RESIDENTS[0]
    expect(storyDay(r, past, today)?.date).toBe(storyDay(r, [...past].reverse(), today)?.date)
    const byResident = new Set(RESIDENTS.map((x) => storyDay(x, past, today)?.date))
    expect(byResident.size).toBeGreaterThan(3)
    const byDay = new Set(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((t) => storyDay(r, past, t)?.date))
    expect(byDay.size).toBeGreaterThan(1)
  })

  it('오늘·"N일 전 오늘"이 보여 주는 날·지운 날은 꺼내지 않는다', () => {
    // 한 달 전 오늘과 오늘만 남기면 꺼낼 날이 없다
    expect(storyDay(RESIDENTS[0], [e('2026-09-27'), e(today)], today)).toBeNull()
    expect(storyDay(RESIDENTS[0], [e(addDays(today, -100)), e('2025-10-27')], today)).toBeNull()
    const shown = new Set(memoryDates(today).map((m) => m.date))
    for (const r of RESIDENTS) {
      const d = storyDay(r, past, today)!.date
      expect(d < today).toBe(true)
      expect(shown.has(d)).toBe(false)
    }
    // 지운 날은 기록(entries)에 글이 없으니 꺼낼 수 없다: 하나 남은 지난 글만 꺼낸다
    expect(storyDay(RESIDENTS[3], [e('2026-10-01')], today)?.date).toBe('2026-10-01')
  })

  it('이야기는 날짜와 건물 이름만 말하고 글은 옮기지 않는다', () => {
    const t = storyTalk(RESIDENTS[0], [e('2026-03-12', '갓 구운 빵 냄새 비밀일기')], today)!
    expect(t.date).toBe('2026-03-12')
    expect(t.text).toContain('3월 12일')
    expect(t.text).toContain('빵집')
    expect(t.text).not.toContain('비밀일기')
    const house = storyTalk(RESIDENTS[0], [e('2026-03-12', '비밀일기')], today)!
    expect(house.text).toContain('3월 12일')
    expect(house.text).not.toContain('비밀일기')
    // 작년 이야기는 해를 붙인다
    expect(storyTalk(RESIDENTS[0], [e('2025-03-12')], today)!.text).toContain('2025년 3월 12일')
  })

  it('건물 16종과 보통 집마다 이야기 말이 있고, 기분에 따라 말이 달라지지 않는다', () => {
    for (const b of BUILDINGS) {
      const word = b.words.find((w) => findBuilding(w)?.id === b.id)!
      const t = storyTalk(RESIDENTS[0], [e('2026-03-12', word)], today)!
      expect(t.text).toContain(b.name)
    }
    const lines = new Set(BUILDINGS.map((b) => storyTalk(RESIDENTS[0], [e('2026-03-12', b.words[0])], today)!.text))
    expect(lines.size).toBe(BUILDINGS.length)
    const calm = storyTalk(RESIDENTS[0], [e('2026-03-12', '커피')], today)!.text
    for (const mood of ['great', 'meh', 'blue', 'tired'] as const) {
      expect(storyTalk(RESIDENTS[0], [{ ...e('2026-03-12', '커피'), mood }], today)!.text).toBe(calm)
    }
  })

  it('한마디 차례: 첫 한마디는 오늘 이야기, 다음이 지난 이야기, 잔치 날은 잔치 다음', () => {
    const r = RESIDENTS[0]
    const es = [...past, e(today)]
    const story = storyTalk(r, es, today)!
    expect(residentTalk(r, es, today, 0)).toEqual({ text: '오늘 지은 집, 참 예뻐요.' })
    expect(residentTalk(r, es, today, 1)).toEqual(story)
    expect(residentLine(r, es, today, 1)).toBe(story.text)
    // 그 뒤는 여느 때 말을 차례로
    const usual = new Set([2, 3, 4, 5, 6].map((t) => residentLine(r, es, today, t)))
    expect(usual.size).toBe(5)
    expect(usual.has(story.text)).toBe(false)
    expect(residentTalk(r, es, today, 2).date).toBeUndefined()
    // 잔치 날
    const fday = '2026-12-24'
    const f = festivalOn([], fday)!
    const fes = [...past, e(fday)]
    const fstory = storyTalk(r, fes, fday)!
    expect(residentLine(r, fes, fday, 1, fes, f)).toBe(festivalLine(f, r.id))
    expect(residentTalk(r, fes, fday, 2, fes, f)).toEqual(fstory)
  })
})

describe('오늘의 손님', () => {
  const today = '2026-10-14'
  const past = days(40, '2026-09-01').filter((x) => x.date < today)
  const lotOf = (village: ReturnType<typeof buildVillage>, date: string) =>
    village.blocks.flatMap((b) => b.lots).find((l) => l.date === date)!
  const cell = (s: { gx: number; gy: number }) => `${Math.floor(s.gx)},${Math.floor(s.gy)}`

  it('오늘 집이 있으면 주민이 그 집 앞 길가에 놀러 오고, 인원은 주민 수로만 정한다', () => {
    const one = [e(today, '라떼')]
    const v1 = buildVillage(one, today)
    const g1 = todayGuests(v1, residentsOf(one), one, today)
    expect(g1).toHaveLength(1)
    expect(g1[0].waiting).toBe(false)
    expect(g1[0].resident.id).toBe(RESIDENTS[0].id)
    const es = [...past, e(today, '라떼')]
    const v = buildVillage(es, today)
    const gs = todayGuests(v, residentsOf(es), es, today)
    expect(gs).toHaveLength(2)
    expect(new Set(gs.map((g) => g.resident.id)).size).toBe(2)
    const lot = lotOf(v, today)
    for (const g of gs) {
      expect(g.date).toBe(today)
      expect(g.building).toBe('cafe')
      expect(g.play).toBe('cafe')
      // 오늘 집 칸의 앞쪽(화면 아래쪽) 가장자리에 선다
      expect(g.spot.gx).toBeGreaterThanOrEqual(lot.gx)
      expect(g.spot.gx).toBeLessThanOrEqual(lot.gx + 1)
      expect(g.spot.gy).toBeGreaterThanOrEqual(lot.gy)
      expect(g.spot.gy).toBeLessThanOrEqual(lot.gy + 1)
      expect(g.spot.gx === lot.gx + 1 || g.spot.gy === lot.gy + 1).toBe(true)
      // 오늘 집보다 뒤에 그려 집 앞에 보인다
      expect(g.depth).toBeGreaterThan(lot.gx + lot.gy)
      expect(g.depth).toBeLessThan(lot.gx + lot.gy + 1)
    }
    expect(new Set(gs.map((g) => `${g.spot.gx},${g.spot.gy}`)).size).toBe(2)
  })

  it('기분·글 길이와 상관없이 같은 손님이 오고, 같은 날은 언제나 같다', () => {
    const base = [...past, e(today)]
    const v = buildVillage(base, today)
    const rs = residentsOf(base)
    const calm = todayGuests(v, rs, base, today)
    for (const mood of ['great', 'meh', 'blue', 'tired'] as const) {
      const es = [...past, { ...e(today, '아주 긴 하루'.repeat(20)), mood }]
      const gs = todayGuests(buildVillage(es, today), residentsOf(es), es, today)
      expect(gs.map((g) => [g.resident.id, g.spot, g.waiting])).toEqual(calm.map((g) => [g.resident.id, g.spot, g.waiting]))
    }
    expect(todayGuests(v, rs, [...base].reverse(), today)).toEqual(calm)
    // 날이 바뀌면 다른 주민도 온다
    const who = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const t = addDays(today, i)
      const es = [...past, e(t)]
      for (const g of todayGuests(buildVillage(es, t), rs, es, t)) who.add(g.resident.id)
    }
    expect(who.size).toBeGreaterThan(2)
  })

  it('오늘을 아직 안 썼으면 주민 한 명이 오늘 자리 앞에서 기다린다(어제 쓴 집에는 오지 않는다)', () => {
    const es = [...past, e(addDays(today, -1), '커피')]
    const v = buildVillage(es, today)
    const gs = todayGuests(v, residentsOf(es), es, today)
    expect(gs).toHaveLength(1)
    expect(gs[0].waiting).toBe(true)
    expect(gs[0].play).toBeNull()
    expect(gs[0].building).toBeNull()
    const lot = lotOf(v, today)
    expect(gs[0].spot.gx === lot.gx + 1 || gs[0].spot.gy === lot.gy + 1).toBe(true)
    // 주민이 없으면 손님도 없다
    expect(todayGuests(buildVillage([], today), [], [], today)).toEqual([])
  })

  it('보통 집 앞엔 꽃다발, 건물 16종마다 다른 놀이를 한다', () => {
    const house = [e(today)]
    expect(todayGuests(buildVillage(house, today), residentsOf(house), house, today)[0].play).toBe('house')
    const plays = new Set<string>()
    for (const b of BUILDINGS) {
      const word = b.words.find((w) => findBuilding(w)?.id === b.id)!
      const es = [e(today, word)]
      const g = todayGuests(buildVillage(es, today), residentsOf(es), es, today)[0]
      expect(g.play).toBe(b.id)
      expect(GUEST_PLAYS[b.id].prop.length).toBeGreaterThan(0)
      plays.add(GUEST_PLAYS[b.id].prop)
    }
    plays.add(GUEST_PLAYS.house.prop)
    expect(plays.size).toBe(BUILDINGS.length + 1)
  })

  it('손님이 된 주민은 길을 걷지 않아 두 군데에 보이지 않는다', () => {
    const es = [...past, e(today)]
    const v = buildVillage(es, today)
    const rs = residentsOf(es)
    const gs = todayGuests(v, rs, es, today)
    const walks = residentWalks(v, rs, gs)
    const guestIds = new Set(gs.map((g) => g.resident.id))
    for (const w of walks) expect(guestIds.has(w.resident.id)).toBe(false)
    expect(walks.length + gs.length).toBe(rs.length)
  })

  it('손님 자리는 다른 집·광장·놓은 소품 칸에 들어가지 않는다', () => {
    for (const t of ['2026-10-31', '2026-10-30', '2026-10-25', '2026-11-01', today]) {
      const es = [...days(60, '2026-08-20').filter((x) => x.date < t), e(t)]
      const v = buildVillage(es, t)
      const rs = residentsOf(es)
      const lot = lotOf(v, t)
      const front = [
        { gx: lot.gx, gy: lot.gy + 1 },
        { gx: lot.gx + 1, gy: lot.gy },
      ]
      const houses = new Set(v.blocks.flatMap((b) => b.lots.filter((l) => l.entry && l.date !== t).map((l) => cell(l))))
      for (const g of todayGuests(v, rs, es, t)) {
        expect(houses.has(cell(g.spot))).toBe(false)
        const inPlaza = g.spot.gx >= PLAZA.gx && g.spot.gx < PLAZA.gx + PLAZA.w && g.spot.gy >= PLAZA.gy && g.spot.gy < PLAZA.gy + PLAZA.h
        expect(inPlaza).toBe(false)
      }
      // 앞 칸에 소품이 있으면 그 쪽은 피한다
      for (const taken of [[front[0]], [front[1]]]) {
        const gs = todayGuests(v, rs, es, t, taken)
        expect(gs.length).toBeGreaterThanOrEqual(1)
        for (const g of gs) expect(cell(g.spot)).not.toBe(cell(taken[0]))
      }
      // 앞 두 칸이 모두 막히면 손님은 오지 않는다(소품을 가리지 않게)
      expect(todayGuests(v, rs, es, t, front)).toEqual([])
    }
  })

  it('손님 놀이 말은 오늘 건물 이름만 말하고 글은 옮기지 않으며, 기다리는 말은 재촉하지 않는다', () => {
    const es = [e(today, '라떼 비밀일기')]
    const line = guestPlayLine(todayGuests(buildVillage(es, today), residentsOf(es), es, today)[0])
    expect(line).toContain('카페')
    expect(line).not.toContain('비밀일기')
    expect(line).not.toContain('라떼')
    const house = [e(today, '비밀일기')]
    expect(guestLine(todayGuests(buildVillage(house, today), residentsOf(house), house, today)[0])).not.toContain('비밀일기')
    const lines = new Set(
      BUILDINGS.map((b) => {
        const word = b.words.find((w) => findBuilding(w)?.id === b.id)!
        const x = [e(today, word)]
        const l = guestPlayLine(todayGuests(buildVillage(x, today), residentsOf(x), x, today)[0])
        expect(l).toContain(b.name)
        expect(l.length).toBeLessThanOrEqual(30)
        return l
      }),
    )
    expect(lines.size).toBe(BUILDINGS.length)
    const wait = guestLine(todayGuests(buildVillage(past, today), residentsOf(past), past, today)[0])
    expect(wait).toBe('오늘 자리에서 기다리고 있어요.')
    expect(wait).not.toMatch(/빨리|얼른|왜|아직도|안 썼/)
  })

  it('첫 손님은 오늘 글에 맞장구를 치고, 둘째 손님은 놀이 말을 한다(글로 계산하고 저장하지 않는다)', () => {
    const es = [...past, e(today, '친구랑 갓 구운 빵 먹었다')]
    const gs = todayGuests(buildVillage(es, today), residentsOf(es), es, today)
    expect(gs).toHaveLength(2)
    expect(gs[0].reply).toBe(replyOf(es[es.length - 1]))
    expect(guestLine(gs[0])).toBe(gs[0].reply)
    expect(gs[1].reply).toBeNull()
    expect(guestLine(gs[1])).toBe(guestPlayLine(gs[1]))
    expect(guestLine(gs[1])).toContain('빵집')
    // 고치면 말도 따라 바뀐다
    const edited = [...past, e(today, '오늘 너무 속상했다')]
    const g2 = todayGuests(buildVillage(edited, today), residentsOf(edited), edited, today)
    expect(guestLine(g2[0])).toBe(replyOf(edited[edited.length - 1]))
    expect(guestLine(g2[0])).not.toBe(guestLine(gs[0]))
    // 손님이 한 명이어도 그 손님이 맞장구를 친다. 기다리는 손님은 맞장구가 없다
    const one = [e(today, '오늘 회의만 세 번')]
    expect(guestLine(todayGuests(buildVillage(one, today), residentsOf(one), one, today)[0])).toBe(replyOf(one[0]))
    const wait = todayGuests(buildVillage(past, today), residentsOf(past), past, today)
    expect(wait[0].reply).toBeNull()
    expect(guestLine(wait[0])).toBe('오늘 자리에서 기다리고 있어요.')
  })
})
