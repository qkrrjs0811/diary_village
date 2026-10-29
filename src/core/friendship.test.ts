import { describe, expect, it } from 'vitest'
import { FRIEND_STEPS, STORIES, friendOf, friendsOf, friendNote, friendStory, friendTokens, reachedFriends, storiesOf } from './friendship'
import { RESIDENTS, residentTalk } from './resident'
import { addDays } from './date'
import type { Dated } from './types'

/** start 부터 n일을 이어서 지은 날 */
const days = (n: number, start = '2026-01-01'): Dated[] => Array.from({ length: n }, (_, i) => ({ date: addDays(start, i) }))
const byId = (id: string) => RESIDENTS.find((r) => r.id === id)!

describe('함께 쌓는 정', () => {
  it('걸음은 10·30·100일에 안녕·친한·단짝 이웃이 된다', () => {
    expect(FRIEND_STEPS.map((s) => s.days)).toEqual([10, 30, 100])
    expect(FRIEND_STEPS.map((s) => s.name)).toEqual(['안녕 이웃', '친한 이웃', '단짝 이웃'])
  })

  it('이사 온 날부터 지은 날 수를 센다(이사 온 날 포함)', () => {
    const kong = byId('kong') // 첫날 온다
    expect(friendOf(kong, days(9))).toMatchObject({ together: 9, level: 0, step: null, left: 1 })
    expect(friendOf(kong, days(10))).toMatchObject({ together: 10, level: 1, left: 20 })
    expect(friendOf(kong, days(10))!.step!.name).toBe('안녕 이웃')
    expect(friendOf(kong, days(30))).toMatchObject({ level: 2, left: 70 })
    expect(friendOf(kong, days(100))).toMatchObject({ level: 3, left: null })
    expect(friendOf(kong, days(400))).toMatchObject({ together: 400, level: 3, left: null })

    const hodu = byId('hodu') // 10일째에 온다
    expect(friendOf(hodu, days(10))).toMatchObject({ together: 1, level: 0, left: 9 })
    expect(friendOf(hodu, days(19))).toMatchObject({ together: 10, level: 1 })
  })

  it('아직 오지 않은 이웃은 정이 없다', () => {
    expect(friendOf(byId('hodu'), days(9))).toBeNull()
    expect(friendsOf(days(9)).map((f) => f.resident.id)).not.toContain('hodu')
    expect(friendsOf([])).toEqual([])
  })

  it('띄엄띄엄·같은 날 여러 번·순서가 섞여도 누적 날 수로만 센다(빠진 날 벌 없음)', () => {
    const spread: Dated[] = [...days(5, '2026-01-01'), ...days(5, '2026-06-01')].reverse()
    const kong = byId('kong')
    expect(friendOf(kong, spread)).toMatchObject({ together: 10, level: 1 })
    expect(friendOf(kong, [...days(10), ...days(10)])).toMatchObject({ together: 10 })
  })

  it('날이 쌓이면 정은 줄지 않는다', () => {
    const kong = byId('kong')
    let last = 0
    for (let n = 1; n <= 120; n++) {
      const f = friendOf(kong, days(n))!
      expect(f.level).toBeGreaterThanOrEqual(last)
      last = f.level
    }
  })

  it('friendsOf 는 온 이웃마다 하나, 오는 순서대로', () => {
    const list = friendsOf(days(30))
    expect(list.map((f) => f.resident.id)).toEqual(RESIDENTS.filter((r) => r.days <= 30).map((r) => r.id))
  })

  it('한 줄을 지어 걸음이 오른 이웃을 찾는다', () => {
    const got = reachedFriends(days(9), days(10))
    expect(got.map((f) => [f.resident.id, f.level])).toEqual([['kong', 1]])
    expect(reachedFriends(days(10), days(10))).toEqual([])
    // 이미 왔던 날을 다시 써도(같은 날) 오르지 않는다
    expect(reachedFriends(days(10), [...days(10), { date: '2026-01-05' }])).toEqual([])
    // 30일째: 콩이 친한 이웃, 모모(3일째 온다) 28일 → 아직, 감자는 막 이사 옴(정 0)
    expect(reachedFriends(days(29), days(30)).map((f) => f.resident.id)).toEqual(['kong'])
    expect(reachedFriends(days(31), days(32)).map((f) => f.resident.id)).toEqual(['momo'])
  })

  it('이웃마다 세 줄 자기 이야기가 있고, 열린 걸음만큼만 보인다', () => {
    for (const r of RESIDENTS) {
      expect(STORIES[r.id]).toHaveLength(3)
      for (const line of STORIES[r.id]) {
        expect(line.length).toBeGreaterThan(5)
        expect(line.length).toBeLessThanOrEqual(40)
      }
    }
    expect(new Set(Object.values(STORIES).flat()).size).toBe(RESIDENTS.length * 3)
    const kong = byId('kong')
    expect(storiesOf(friendOf(kong, days(9))!)).toEqual([])
    expect(storiesOf(friendOf(kong, days(10))!)).toEqual(STORIES.kong.slice(0, 1))
    expect(storiesOf(friendOf(kong, days(100))!)).toEqual(STORIES.kong)
  })

  it('짓는 알림 한 줄(받침에 맞는 조사)', () => {
    expect(friendNote([])).toBeNull()
    const kong = friendOf(byId('kong'), days(30))!
    expect(friendNote([kong])).toBe('💛 콩이와 친한 이웃이 되었어요')
    const gamja = friendOf(byId('gamja'), days(39))!
    expect(friendNote([gamja])).toBe('💛 감자와 안녕 이웃이 되었어요')
    const dotori = friendOf(byId('donggeul'), days(374))!
    expect(friendNote([dotori])).toBe('💛 동글이와 안녕 이웃이 되었어요')
    const momo = friendOf(byId('momo'), days(102))!
    const ssuk = friendOf(byId('ssuk'), days(309))!
    expect(friendNote([momo, ssuk])).toBe('💛 모모와 단짝 이웃, 쑥이와 안녕 이웃이 되었어요')
  })

  it('받침 있는 이름은 "과"', () => {
    // 이름 끝에 받침이 있는 이웃이 없을 수도 있으니 직접 만든 이웃으로 본다
    const r = { ...byId('kong'), name: '별님' }
    expect(friendNote([{ ...friendOf(byId('kong'), days(10))!, resident: r }])).toBe('💛 별님과 안녕 이웃이 되었어요')
  })

  it('마을 그림 정표: 걸음이 있는 이웃만 지금 걸음의 정표 하나', () => {
    const t = friendTokens(days(30))
    // 콩이(1일)는 30일 함께해 친한 이웃 → 꽃 머리핀, 모모는 아직 안녕 이웃 → 목도리
    expect(t.kong).toBe('pin')
    expect(t.momo).toBe('scarf')
    // 막 이사 온 이웃·아직 안 온 이웃은 정표가 없다
    for (const r of RESIDENTS) {
      const f = friendOf(r, days(30))
      if (!f || f.level === 0) expect(t[r.id]).toBeUndefined()
      else expect(t[r.id]).toBe(f.step!.token)
    }
    expect(friendTokens(days(100)).kong).toBe('star')
    expect(friendTokens([])).toEqual({})
  })

  it('정 이야기 한마디: 열린 이야기 중 하나를 날짜로 고르고, 걸음이 없으면 없다', () => {
    expect(friendStory(friendOf(byId('kong'), days(5))!, '2026-10-29')).toBeNull()
    const kong = friendOf(byId('kong'), days(100))!
    const seen = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const day = addDays('2026-10-01', i)
      const line = friendStory(kong, day)!
      expect(storiesOf(kong)).toContain(line)
      // 같은 날은 같은 이야기
      expect(friendStory(kong, day)).toBe(line)
      seen.add(line)
    }
    expect(seen.size).toBeGreaterThan(1)
    // 안녕 이웃은 첫 이야기만
    expect(friendStory(friendOf(byId('kong'), days(10))!, '2026-10-29')).toBe(STORIES.kong[0])
  })

  it('주민 한마디 차례에 정 이야기가 한 번 끼고, 없으면 차례가 그대로다', () => {
    const r = byId('kong')
    const today = '2026-10-29'
    const story = STORIES.kong[0]
    // 지난 글이 없으면: 오늘 이야기 → 정 이야기 → 여느 때 말
    expect(residentTalk(r, [], today, 1, [], null, story)).toEqual({ text: story })
    expect(residentTalk(r, [], today, 2, [], null, story)).toEqual(residentTalk(r, [], today, 1, [], null, null))
    // 정 이야기는 여느 때 말 차례에서 다시 나오지 않는다
    for (let tap = 2; tap < 8; tap++) expect(residentTalk(r, [], today, tap, [], null, story).text).not.toBe(story)
  })
})
