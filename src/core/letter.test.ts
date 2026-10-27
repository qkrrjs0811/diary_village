import { describe, expect, it } from 'vitest'
import { planImport, backupText } from './backup'
import { buildingOf } from './building'
import { unlockedDecors } from './decor'
import { builtDays } from './entries'
import { LANDMARKS, PLAZA, earnedLandmarks } from './landmark'
import {
  MAILBOX,
  MAX_LETTER,
  arrivalCard,
  arrivedLetters,
  eraseLetter,
  letterAge,
  letterDay,
  markLetterRead,
  opensOnFor,
  receivedLetters,
  waitingLetters,
  writeLetter,
} from './letter'
import { canPlace, decorSpots } from './placing'
import { residentsOf } from './resident'
import { PLAZA_TREES } from './scenery'
import { stageOf } from './stage'
import { parseSave } from './storage'
import type { Letter, SaveData } from './types'
import { buildVillage } from './village'

const at = (iso: string) => Date.parse(`${iso}+09:00`)
const now = at('2026-10-28T21:00:00')
const save: SaveData = {
  version: 1,
  entries: [
    { date: '2026-10-27', text: '커피 한 잔', mood: 'calm', writtenAt: 100 },
    { date: '2026-10-28', text: '바다 보러 감', mood: 'great', writtenAt: 200 },
  ],
}

function write(s: SaveData, text: string, wait: 'month' | 'days100' | 'year', when: number): SaveData {
  const r = writeLetter(s, { text, wait }, when)
  if (!r.ok) throw new Error(r.reason)
  return r.save
}

describe('열리는 날', () => {
  it('한 달 뒤는 다음 달 같은 날, 그 날이 없으면 그 달 마지막 날', () => {
    expect(opensOnFor('2026-10-28', 'month')).toBe('2026-11-28')
    expect(opensOnFor('2026-12-15', 'month')).toBe('2027-01-15')
    expect(opensOnFor('2027-01-31', 'month')).toBe('2027-02-28')
    expect(opensOnFor('2028-01-30', 'month')).toBe('2028-02-29')
    expect(opensOnFor('2026-10-31', 'month')).toBe('2026-11-30')
  })

  it('100일 뒤는 날짜를 100일 더한 날', () => {
    expect(opensOnFor('2026-10-28', 'days100')).toBe('2027-02-05')
  })

  it('1년 뒤는 다음 해 같은 날, 2월 29일은 2월 28일', () => {
    expect(opensOnFor('2026-10-28', 'year')).toBe('2027-10-28')
    expect(opensOnFor('2028-02-29', 'year')).toBe('2029-02-28')
  })
})

describe('편지 쓰기', () => {
  it('쓴 날·쓴 시각·열리는 날·글을 남기고 일기는 그대로 둔다', () => {
    const r = writeLetter(save, { text: '  내년의 나, 잘 지내?  ', wait: 'year' }, now)
    if (!r.ok) throw new Error()
    expect(r.letter).toEqual({ writtenOn: '2026-10-28', writtenAt: now, opensOn: '2027-10-28', text: '내년의 나, 잘 지내?' })
    expect(r.save.letters).toEqual([r.letter])
    expect(r.save.entries).toBe(save.entries)
    expect(save.letters).toBeUndefined()
  })

  it('줄바꿈은 그대로 두고 빈 편지는 거절한다', () => {
    const r = writeLetter(save, { text: '안녕\n나에게', wait: 'month' }, now)
    if (!r.ok) throw new Error()
    expect(r.letter.text).toBe('안녕\n나에게')
    expect(writeLetter(save, { text: '  \n ', wait: 'month' }, now)).toEqual({ ok: false, reason: 'empty' })
  })

  it('200자까지 쓸 수 있다', () => {
    expect(MAX_LETTER).toBe(200)
    expect(writeLetter(save, { text: '가'.repeat(200), wait: 'month' }, now).ok).toBe(true)
    expect(writeLetter(save, { text: '가'.repeat(201), wait: 'month' }, now)).toEqual({ ok: false, reason: 'long' })
  })

  it('하루에 여러 통 써도 되고, 같은 시각에 써도 서로 다른 편지로 남는다', () => {
    let s = write(save, '첫째', 'month', now)
    s = write(s, '둘째', 'month', now)
    expect(s.letters?.map((l) => l.text)).toEqual(['첫째', '둘째'])
    expect(new Set(s.letters?.map((l) => l.writtenAt)).size).toBe(2)
  })
})

describe('편지 도착', () => {
  const s = (() => {
    let x = write(save, '한 달 뒤', 'month', now) // 11-28
    x = write(x, '100일 뒤', 'days100', now + 1) // 2027-02-05
    x = write(x, '먼저 쓴 한 달', 'month', at('2026-10-20T09:00:00')) // 11-20
    return x
  })()

  it('열리는 날 전에는 기다리는 편지다(열리는 날 순)', () => {
    expect(arrivedLetters(s, at('2026-11-19T23:59:00'))).toEqual([])
    expect(waitingLetters(s, at('2026-11-19T23:59:00')).map((l) => l.opensOn)).toEqual(['2026-11-20', '2026-11-28', '2027-02-05'])
  })

  it('열리는 날이나 그 뒤에 처음 열면 도착한다(쓴 순서대로)', () => {
    expect(arrivedLetters(s, at('2026-11-20T00:00:00')).map((l) => l.text)).toEqual(['먼저 쓴 한 달'])
    expect(arrivedLetters(s, at('2027-03-01T08:00:00')).map((l) => l.text)).toEqual(['먼저 쓴 한 달', '한 달 뒤', '100일 뒤'])
    expect(waitingLetters(s, at('2027-03-01T08:00:00'))).toEqual([])
  })

  it('읽으면 읽은 시각을 남기고 받은 편지로 옮겨 간다', () => {
    const when = at('2026-11-28T08:00:00')
    const first = arrivedLetters(s, when)
    expect(first.map((l) => l.text)).toEqual(['먼저 쓴 한 달', '한 달 뒤'])
    const r = markLetterRead(s, first[0].writtenAt, when)
    if (!r.ok) throw new Error()
    expect(arrivedLetters(r.save, when).map((l) => l.text)).toEqual(['한 달 뒤'])
    expect(receivedLetters(r.save, when)).toEqual([{ ...first[0], readAt: when }])
    // 다시 읽어도 처음 읽은 시각은 그대로다
    const again = markLetterRead(r.save, first[0].writtenAt, when + 1000)
    if (!again.ok) throw new Error()
    expect(again.save).toBe(r.save)
  })

  it('열리기 전 편지는 읽음 표시할 수 없고, 없는 편지도 안 된다', () => {
    const l = waitingLetters(s, now)[0]
    expect(markLetterRead(s, l.writtenAt, now)).toEqual({ ok: false, reason: 'sealed' })
    expect(markLetterRead(s, 12345, now)).toEqual({ ok: false, reason: 'missing' })
  })

  it('받은 편지는 쓴 순서대로 모인다', () => {
    const when = at('2027-03-01T08:00:00')
    let x = s
    for (const l of [...arrivedLetters(s, when)].reverse()) {
      const r = markLetterRead(x, l.writtenAt, when)
      if (!r.ok) throw new Error()
      x = r.save
    }
    expect(receivedLetters(x, when).map((l) => l.text)).toEqual(['먼저 쓴 한 달', '한 달 뒤', '100일 뒤'])
  })

  it('편지가 며칠 전에 쓴 것인지 센다', () => {
    const l = s.letters!.find((x) => x.text === '100일 뒤')!
    expect(letterAge(l, at('2027-02-05T07:00:00'))).toBe(100)
    expect(letterAge(l, at('2027-02-07T07:00:00'))).toBe(102)
  })
})

describe('편지 지우기', () => {
  it('열리기 전에도 지울 수 있고, 그 편지만 사라진다', () => {
    let s = write(save, '지울 편지', 'year', now)
    s = write(s, '남길 편지', 'month', now + 1)
    const r = eraseLetter(s, now)
    if (!r.ok) throw new Error()
    expect(r.save.letters?.map((l) => l.text)).toEqual(['남길 편지'])
    expect(JSON.stringify(r.save)).not.toContain('지울 편지')
    expect(r.save.entries).toEqual(save.entries)
  })

  it('마지막 편지를 지우면 칸을 남기지 않는다', () => {
    const s = write(save, '하나', 'month', now)
    const r = eraseLetter(s, now)
    if (!r.ok) throw new Error()
    expect(r.save).toEqual(save)
    expect(eraseLetter(save, now)).toEqual({ ok: false, reason: 'missing' })
  })
})

describe('편지는 마을 계산에 들어가지 않는다', () => {
  it('편지를 써도 집·건물·명소·단계·주민·소품은 그대로다', () => {
    let s = save
    for (let i = 0; i < 40; i++) s = write(s, `카페 커피 책방 편지 ${i}`, 'month', now + i)
    expect(s.entries).toEqual(save.entries)
    expect(buildVillage(s.entries, '2026-10-28')).toEqual(buildVillage(save.entries, '2026-10-28'))
    expect(s.entries.map(buildingOf)).toEqual(save.entries.map(buildingOf))
    const days = builtDays(s)
    expect(days).toEqual(builtDays(save))
    expect(earnedLandmarks(days)).toEqual(earnedLandmarks(builtDays(save)))
    expect(stageOf(days)).toEqual(stageOf(builtDays(save)))
    expect(residentsOf(days)).toEqual(residentsOf(builtDays(save)))
    expect(unlockedDecors(days)).toEqual(unlockedDecors(builtDays(save)))
  })
})

describe('편지 저장 읽기', () => {
  const letter: Letter = { writtenOn: '2026-10-28', writtenAt: now, opensOn: '2026-11-28', text: '안녕' }
  const base = { version: 1 as const, entries: save.entries }

  it('편지를 저장하고 다시 읽는다(읽은 시각 포함)', () => {
    const s: SaveData = { ...base, letters: [letter, { ...letter, writtenAt: now + 1, readAt: now + 9 }] }
    expect(parseSave(JSON.stringify(s))).toEqual(s)
  })

  it('편지 칸이 없는 이전 저장·백업도 그대로 읽는다', () => {
    expect(parseSave(JSON.stringify(base))).toEqual(base)
  })

  it('이상한 편지는 그 편지만 버리고 일기와 다른 편지는 지킨다', () => {
    const odd = [
      null,
      'x',
      { ...letter, writtenAt: 1, text: 3 },
      { ...letter, writtenAt: 2, text: '   ' },
      { ...letter, writtenAt: 3, writtenOn: '2026-13-01' },
      { ...letter, writtenAt: 4, opensOn: 'soon' },
      { ...letter, writtenAt: 5, opensOn: '2026-10-28' },
      { ...letter, writtenAt: 'now' },
      { ...letter, writtenAt: Infinity },
    ]
    const s = { ...base, letters: [...odd, letter] }
    expect(parseSave(JSON.stringify(s))).toEqual({ ...base, letters: [letter] })
    expect(parseSave(JSON.stringify({ ...base, letters: 'oops' }))).toEqual(base)
    expect(parseSave(JSON.stringify({ ...base, letters: [null] }))).toEqual(base)
  })

  it('읽은 시각이 이상하면 그 칸만 버리고 편지는 남긴다', () => {
    for (const readAt of ['어제', null, NaN, {}]) {
      const s = { ...base, letters: [{ ...letter, readAt }] }
      expect(parseSave(JSON.stringify(s))).toEqual({ ...base, letters: [letter] })
    }
  })

  it('쓴 시각이 같은 편지가 겹치면 하나만 남긴다', () => {
    const s = { ...base, letters: [letter, { ...letter }] }
    expect(parseSave(JSON.stringify(s))?.letters).toEqual([letter])
  })
})

describe('편지 백업', () => {
  const a: Letter = { writtenOn: '2026-10-01', writtenAt: 10, opensOn: '2026-11-01', text: '폰 편지', readAt: 50 }
  const b: Letter = { writtenOn: '2026-09-01', writtenAt: 5, opensOn: '2027-09-01', text: '백업 편지' }

  it('백업에 편지가 들어가고 빈 폰에 가져오면 그대로 들어온다', () => {
    const s: SaveData = { ...save, letters: [b, a] }
    expect(backupText(s)).toContain('백업 편지')
    const r = planImport({ version: 1, entries: [] }, backupText(s))
    if (!r.ok) throw new Error()
    expect(r.save.letters).toEqual([b, a])
  })

  it('폰의 편지는 그대로 두고, 폰에 없는 편지만 백업에서 더한다', () => {
    const phone: SaveData = { ...save, letters: [{ ...a, readAt: 70 }] }
    const backup: SaveData = { ...save, letters: [a, b] }
    const r = planImport(phone, backupText(backup))
    if (!r.ok) throw new Error()
    expect(r.save.letters).toEqual([b, { ...a, readAt: 70 }])
    // 날은 모두 폰에 있어도 새 편지가 있으면 가져올 거리가 있다
    expect(r.added).toBe(0)
    expect(r.lettersAdded).toBe(1)
  })

  it('폰에 이미 있는 편지만 있으면 새로 더할 편지는 없다', () => {
    const r = planImport({ ...save, letters: [a] }, backupText({ ...save, letters: [a] }))
    if (!r.ok) throw new Error()
    expect(r.lettersAdded).toBe(0)
  })

  it('양쪽 다 편지가 없으면 칸을 만들지 않는다', () => {
    const r = planImport(save, backupText(save))
    if (!r.ok) throw new Error()
    expect(r.save.letters).toBeUndefined()
  })
})

describe('광장 우체통 자리', () => {
  it('광장 돌길 칸이라 명소·모서리 나무 자리가 아니고 소품을 놓을 수 없다', () => {
    expect(MAILBOX.col).toBeGreaterThanOrEqual(0)
    expect(MAILBOX.col).toBeLessThan(PLAZA.w)
    expect(MAILBOX.row).toBeGreaterThanOrEqual(0)
    expect(MAILBOX.row).toBeLessThan(PLAZA.h)
    expect(LANDMARKS.some((l) => l.col === MAILBOX.col && l.row === MAILBOX.row)).toBe(false)
    expect(PLAZA_TREES.some(([c, r]) => c === MAILBOX.col && r === MAILBOX.row)).toBe(false)
    const village = buildVillage(save.entries, '2026-10-28')
    expect(canPlace(village, '2026-10-28', save, { at: 'plaza', col: MAILBOX.col, row: MAILBOX.row })).toBe(false)
    expect(decorSpots(village, '2026-10-28', save).some((s) => s.at === 'plaza' && s.col === MAILBOX.col && s.row === MAILBOX.row)).toBe(false)
  })
})

describe('편지 도착 카드', () => {
  const letter: Letter = { writtenOn: '2026-07-20', writtenAt: at('2026-07-20T22:00:00'), opensOn: '2026-10-28', text: '여름의 나' }

  it('날짜는 올해면 달·날만, 다른 해면 해를 붙인다', () => {
    expect(letterDay('2026-11-28', '2026-10-28')).toBe('11월 28일')
    expect(letterDay('2027-02-05', '2026-10-28')).toBe('2027년 2월 5일')
  })

  it('며칠 전의 내가 언제 보낸 편지인지 알려 주고, 남은 편지 수를 덧붙인다', () => {
    expect(arrivalCard(letter, now, 0)).toEqual({
      title: '100일 전의 내가 보낸 편지가 왔어요',
      body: '7월 20일에 미래의 나에게 부친 편지예요.',
      next: '',
    })
    expect(arrivalCard(letter, now, 2).next).toBe('편지가 2통 더 왔어요')
  })

  it('작년에 쓴 편지는 해를 붙이고, 열리는 날이 지나 열어도 오늘까지 날 수로 센다', () => {
    const old: Letter = { writtenOn: '2025-10-28', writtenAt: at('2025-10-28T08:00:00'), opensOn: '2026-10-28', text: '1년 전' }
    const card = arrivalCard(old, at('2026-10-30T09:00:00'), 0)
    expect(card.title).toBe('367일 전의 내가 보낸 편지가 왔어요')
    expect(card.body).toBe('2025년 10월 28일에 미래의 나에게 부친 편지예요.')
  })
})
