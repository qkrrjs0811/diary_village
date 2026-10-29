import { describe, expect, it } from 'vitest'
import { BUZZ, CUE_BUZZ, SOUND_KEY, buildTune, cueTune, growthTune, monthSong, soundOn, setSound, type Note } from './sound'
import { MOODS } from './mood'
import type { KV } from './storage'
import type { MoodId } from './types'

const memory = (init: Record<string, string> = {}): KV & { m: Map<string, string> } => {
  const m = new Map(Object.entries(init))
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}

describe('짓는 소리', () => {
  it('기분마다 음 높이만 다르고 음 수·길이·크기는 같다', () => {
    const tunes = MOODS.map((m) => buildTune(m.id, '2026-10-28'))
    const shape = (t: ReturnType<typeof buildTune>) => t.map((n) => [n.at, n.dur, n.gain])
    for (const t of tunes) {
      expect(t.length).toBe(4)
      expect(shape(t)).toEqual(shape(tunes[0]))
    }
    // 기분마다 쓰는 음이 다르다(좋고 나쁨이 아니라 음계가 다르다)
    const sets = tunes.map((t) => t.map((n) => n.freq).sort().join(','))
    expect(new Set(sets).size).toBe(MOODS.length)
  })

  it('울적한 날도 귀에 편한 높이의 맑은 소리다', () => {
    for (const m of MOODS) {
      for (const date of ['2026-10-01', '2026-10-02', '2026-12-31']) {
        for (const n of buildTune(m.id, date)) {
          expect(n.freq).toBeGreaterThan(250)
          expect(n.freq).toBeLessThan(1100)
        }
      }
    }
  })

  it('같은 날은 같은 가락, 날이 바뀌면 가락이 살짝 달라진다', () => {
    expect(buildTune('calm', '2026-10-28')).toEqual(buildTune('calm', '2026-10-28'))
    const days = Array.from({ length: 10 }, (_, i) => `2026-10-${String(i + 10)}`)
    const tunes = new Set(days.map((d) => buildTune('calm', d).map((n) => n.freq).join(',')))
    expect(tunes.size).toBeGreaterThan(1)
  })

  it('짧게 떨린다', () => {
    const total = BUZZ.reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(0)
    expect(total).toBeLessThanOrEqual(150)
  })
})

describe('소리 켜기 설정', () => {
  it('같은 사이트의 다른 앱과 겹치지 않는 키를 쓴다', () => {
    expect(SOUND_KEY.startsWith('diary-village:')).toBe(true)
  })

  it('처음이거나 못 읽으면 켜져 있다', () => {
    expect(soundOn(memory())).toBe(true)
    expect(soundOn(memory({ [SOUND_KEY]: '이상한 값' }))).toBe(true)
    const broken: KV = {
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {},
    }
    expect(soundOn(broken)).toBe(true)
  })

  it('끄고 켠 것을 기억한다', () => {
    const kv = memory()
    setSound(kv, false)
    expect(soundOn(kv)).toBe(false)
    setSound(kv, true)
    expect(soundOn(kv)).toBe(true)
    expect([...kv.m.keys()]).toEqual([SOUND_KEY])
  })
})

describe('짧은 소리(축하·주민·소품)', () => {
  const all = [cueTune('celebrate'), cueTune('resident', 'kong'), cueTune('place'), cueTune('turn')]

  it('모두 귀에 편한 높이이고, 짓는 소리보다 크지 않다', () => {
    const build = buildTune('calm', '2026-10-28')
    for (const t of all) {
      expect(t.length).toBeGreaterThan(0)
      for (const n of t) {
        expect(n.freq).toBeGreaterThan(250)
        expect(n.freq).toBeLessThan(1600)
        expect(n.gain).toBeLessThanOrEqual(build[0].gain)
      }
    }
  })

  it('축하는 짓는 소리보다 길게 올라가는 가락이다', () => {
    const t = cueTune('celebrate')
    const end = (x: Note[]) => Math.max(...x.map((n) => n.at + n.dur))
    expect(t.length).toBeGreaterThan(4)
    expect(end(t)).toBeGreaterThan(end(buildTune('great', '2026-10-28')))
    const freqs = t.map((n) => n.freq)
    expect(freqs).toEqual([...freqs].sort((a, b) => a - b))
  })

  it('주민마다 목소리 높이가 다르고, 같은 주민은 늘 같다', () => {
    expect(cueTune('resident', 'kong')).toEqual(cueTune('resident', 'kong'))
    const ids = ['kong', 'momo', 'bori', 'dubu', 'hodu', 'somi']
    const voices = new Set(ids.map((id) => cueTune('resident', id)[0].freq))
    expect(voices.size).toBeGreaterThan(2)
    for (const id of ids) expect(cueTune('resident', id).length).toBe(2)
  })

  it('소품을 놓을 때는 한 음 짧게 톡', () => {
    const t = cueTune('place')
    expect(t).toHaveLength(1)
    expect(t[0].dur).toBeLessThanOrEqual(0.2)
  })

  it('책장을 넘길 때는 아주 짧고 여린 두 음이 내려가고, 떨지 않는다', () => {
    const t = cueTune('turn')
    expect(t).toHaveLength(2)
    expect(t[1].freq).toBeLessThan(t[0].freq)
    expect(Math.max(...t.map((n) => n.at + n.dur))).toBeLessThanOrEqual(0.3)
    for (const n of t) expect(n.gain).toBeLessThanOrEqual(cueTune('place')[0].gain)
    expect(CUE_BUZZ.turn).toEqual([])
  })

  it('떨림은 짧고, 주민을 누를 때는 떨지 않는다', () => {
    expect(CUE_BUZZ.resident).toEqual([])
    for (const b of Object.values(CUE_BUZZ)) expect(b.reduce((a, x) => a + x, 0)).toBeLessThanOrEqual(150)
  })
})

describe('하트 가락', () => {
  it('그 이웃 목소리 높이에서 시작해 올라가고, 짓는 소리보다 크지 않다', () => {
    const build = buildTune('calm', '2026-10-28')
    for (const id of ['kong', 'momo', 'bori', 'dubu', 'hodu', 'somi', 'gomi', 'dalle']) {
      const t = cueTune('friend', id)
      expect(t[0].freq).toBe(cueTune('resident', id)[0].freq)
      expect(t.length).toBeGreaterThanOrEqual(3)
      for (let i = 1; i < t.length; i++) {
        expect(t[i].freq).toBeGreaterThan(t[i - 1].freq)
        expect(t[i].at).toBeGreaterThan(t[i - 1].at)
      }
      for (const n of t) {
        expect(n.freq).toBeLessThan(1600)
        expect(n.gain).toBeLessThanOrEqual(build[0].gain)
      }
    }
    expect(cueTune('friend', 'kong')).toEqual(cueTune('friend', 'kong'))
    expect(CUE_BUZZ.friend.reduce((a, x) => a + x, 0)).toBeLessThanOrEqual(150)
  })
})

describe('자라 온 길 소리', () => {
  it('집이 오를수록 낮은 음에서 높은 음으로 올라간다(귀에 편한 높이)', () => {
    const n = 30
    const tunes = Array.from({ length: n }, (_, i) => growthTune(i, n))
    for (const t of tunes) expect(t).toHaveLength(1)
    const f = tunes.map((t) => t[0].freq)
    for (let i = 1; i < n; i++) expect(f[i]).toBeGreaterThanOrEqual(f[i - 1])
    expect(f[n - 1]).toBeGreaterThan(f[0])
    for (const x of f) {
      expect(x).toBeGreaterThan(250)
      expect(x).toBeLessThan(1100)
    }
    // 한 채뿐이어도 소리가 난다
    expect(growthTune(0, 1)[0].freq).toBeGreaterThan(250)
  })
})

describe('이 달의 노래', () => {
  const days = (n: number, mood: (i: number) => MoodId = () => 'calm') =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(Date.UTC(2026, 9, 1 + i))
      return { date: d.toISOString().slice(0, 10), mood: mood(i) }
    })

  it('쓴 날이 없으면 빈 가락이다', () => {
    expect(monthSong([])).toEqual([])
  })

  it('쓴 날마다 한 음씩 날짜 순으로 잇고, 맨 끝은 첫 날 기분 으뜸음으로 맺는다', () => {
    const song = monthSong([
      { date: '2026-10-09', mood: 'blue' },
      { date: '2026-10-02', mood: 'great' },
      { date: '2026-10-05', mood: 'tired' },
    ])
    expect(song).toHaveLength(4)
    expect(song.slice(0, 3).map((n) => n.date)).toEqual(['2026-10-02', '2026-10-05', '2026-10-09'])
    expect(song[3].date).toBeNull()
    // 첫 날(10월 2일, great) 음계의 으뜸음 C5
    expect(song[3].freq).toBe(523.25)
    for (let i = 1; i < song.length; i++) expect(song[i].at).toBeGreaterThan(song[i - 1].at)
  })

  it('기분은 음 높이만 바꾸고 음 길이·크기·시작은 같다', () => {
    const shape = (s: Note[]) => s.map((n) => [n.at, n.dur, n.gain])
    const songs = MOODS.map((m) => monthSong(days(10, () => m.id)))
    for (const s of songs) expect(shape(s)).toEqual(shape(songs[0]))
    const mixed = monthSong(days(10, (i) => MOODS[i % MOODS.length].id))
    expect(shape(mixed)).toEqual(shape(songs[0]))
    const dayNotes = mixed.filter((n) => n.date)
    expect(new Set(dayNotes.map((n) => `${n.dur}/${n.gain}`)).size).toBe(1)
    expect(new Set(songs.map((s) => s.map((n) => n.freq).join(','))).size).toBe(MOODS.length)
  })

  it('글 길이와 상관없다(날짜와 기분만 본다)', () => {
    const short = [{ date: '2026-10-03', mood: 'meh' as const, text: '응' }]
    const long = [{ date: '2026-10-03', mood: 'meh' as const, text: '아주 긴 글'.repeat(50), more: '더'.repeat(500) }]
    expect(monthSong(long)).toEqual(monthSong(short))
  })

  it('날이 많아도 전체가 12초 안이고, 귀에 편한 높이다', () => {
    for (const n of [1, 15, 31, 60]) {
      const song = monthSong(days(n))
      expect(song).toHaveLength(n + 1)
      expect(Math.max(...song.map((x) => x.at + x.dur))).toBeLessThanOrEqual(12)
      for (const x of song) {
        expect(x.freq).toBeGreaterThan(250)
        expect(x.freq).toBeLessThan(1100)
      }
    }
  })

  it('같은 달은 같은 가락이다', () => {
    expect(monthSong(days(7))).toEqual(monthSong(days(7)))
  })
})
