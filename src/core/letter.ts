import { addDays, dayKey, isDate } from './date'
import type { Letter, SaveData } from './types'

/** 편지는 일기보다 조금 길게 쓸 수 있다. 길이는 아무 보상과도 무관하다 */
export const MAX_LETTER = 200

/**
 * 광장 우체통이 서는 칸(광장 왼쪽 위가 0,0). 광장 입구 쪽 가운데 돌길이라 명소·소품 자리와 겹치지 않는다.
 * 편지가 있든 없든 늘 서 있다(보상이 아니다)
 */
export const MAILBOX = { col: 3, row: 5 }

/** 열리는 날 고르기: 한 달 뒤·100일 뒤·1년 뒤 */
export type LetterWait = 'month' | 'days100' | 'year'

const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const pad = (n: number) => String(n).padStart(2, '0')

/** 쓴 날에서 열리는 날을 정한다. 다음 달(해)에 같은 날이 없으면 그 달 마지막 날 */
export function opensOnFor(writtenOn: string, wait: LetterWait): string {
  if (wait === 'days100') return addDays(writtenOn, 100)
  const [y, m, d] = writtenOn.split('-').map(Number)
  const [ny, nm] = wait === 'year' ? [y + 1, m] : m === 12 ? [y + 1, 1] : [y, m + 1]
  return `${ny}-${pad(nm)}-${pad(Math.min(d, lastDay(ny, nm)))}`
}

export type LetterCheck = { ok: true; text: string } | { ok: false; reason: 'empty' | 'long' }

/** 줄바꿈은 살리고 앞뒤 빈칸만 걷는다 */
export function checkLetter(raw: string): LetterCheck {
  const text = raw.replace(/\r\n?/g, '\n').trim()
  if (text.length === 0) return { ok: false, reason: 'empty' }
  if ([...text].length > MAX_LETTER) return { ok: false, reason: 'long' }
  return { ok: true, text }
}

function withLetters(save: SaveData, letters: Letter[]): SaveData {
  const { letters: _, ...rest } = save
  return letters.length ? { ...rest, letters } : rest
}

export type WriteLetterResult = { ok: true; save: SaveData; letter: Letter } | { ok: false; reason: 'empty' | 'long' }

/** 편지를 부친다. 하루에 여러 통 써도 된다. 같은 시각이면 1ms씩 밀어 편지마다 쓴 시각이 다르게 한다 */
export function writeLetter(save: SaveData, input: { text: string; wait: LetterWait }, now: number): WriteLetterResult {
  const checked = checkLetter(input.text)
  if (!checked.ok) return checked
  const list = save.letters ?? []
  let writtenAt = now
  while (list.some((l) => l.writtenAt === writtenAt)) writtenAt++
  const writtenOn = dayKey(now)
  const letter: Letter = { writtenOn, writtenAt, opensOn: opensOnFor(writtenOn, input.wait), text: checked.text }
  return { ok: true, save: withLetters(save, sortLetters([...list, letter])), letter }
}

const sortLetters = (list: Letter[]) => [...list].sort((a, b) => a.writtenAt - b.writtenAt)
const isOpen = (l: Letter, now: number) => l.opensOn <= dayKey(now)

/** 열리는 날이 지났고 아직 안 읽은 편지(쓴 순서). 앱을 열 때 차례로 도착한다 */
export function arrivedLetters(save: SaveData, now: number): Letter[] {
  return sortLetters((save.letters ?? []).filter((l) => isOpen(l, now) && l.readAt === undefined))
}

/** 아직 열리지 않은 편지(열리는 날 순). 화면에서는 내용을 숨긴다 */
export function waitingLetters(save: SaveData, now: number): Letter[] {
  return (save.letters ?? []).filter((l) => !isOpen(l, now)).sort((a, b) => a.opensOn.localeCompare(b.opensOn) || a.writtenAt - b.writtenAt)
}

/** 이미 읽은 편지(쓴 순서). 다시 읽을 수 있다 */
export function receivedLetters(save: SaveData, now: number): Letter[] {
  return sortLetters((save.letters ?? []).filter((l) => isOpen(l, now) && l.readAt !== undefined))
}

/** 쓴 날부터 오늘까지 며칠인지("100일 전의 내가") */
export function letterAge(letter: Letter, now: number): number {
  const ms = (d: string) => Date.parse(`${d}T00:00:00Z`)
  return Math.round((ms(dayKey(now)) - ms(letter.writtenOn)) / 86_400_000)
}

/** "11월 28일", 올해가 아니면 "2027년 10월 28일" */
export function letterDay(date: string, today: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${y === Number(today.slice(0, 4)) ? '' : `${y}년 `}${m}월 ${d}일`
}

/** 앱을 열 때 찾아오는 편지 카드의 말. left: 이 편지 뒤에 더 온 편지 수 */
export function arrivalCard(letter: Letter, now: number, left: number): { title: string; body: string; next: string } {
  return {
    title: `${letterAge(letter, now)}일 전의 내가 보낸 편지가 왔어요`,
    body: `${letterDay(letter.writtenOn, dayKey(now))}에 미래의 나에게 부친 편지예요.`,
    next: left > 0 ? `편지가 ${left}통 더 왔어요` : '',
  }
}

export type LetterResult ={ ok: true; save: SaveData } | { ok: false; reason: 'missing' | 'sealed' }

/** 읽음 표시. 처음 읽은 시각만 남기고, 열리기 전 편지는 표시하지 않는다 */
export function markLetterRead(save: SaveData, writtenAt: number, now: number): LetterResult {
  const letter = save.letters?.find((l) => l.writtenAt === writtenAt)
  if (!letter) return { ok: false, reason: 'missing' }
  if (!isOpen(letter, now)) return { ok: false, reason: 'sealed' }
  if (letter.readAt !== undefined) return { ok: true, save }
  const letters = save.letters!.map((l) => (l === letter ? { ...l, readAt: now } : l))
  return { ok: true, save: { ...save, letters } }
}

/** 편지를 지운다(확인은 화면에서 한 번 더 받는다). 열리기 전에도 지울 수 있고 글은 남기지 않는다 */
export function eraseLetter(save: SaveData, writtenAt: number): { ok: true; save: SaveData } | { ok: false; reason: 'missing' } {
  const list = save.letters ?? []
  if (!list.some((l) => l.writtenAt === writtenAt)) return { ok: false, reason: 'missing' }
  return { ok: true, save: withLetters(save, list.filter((l) => l.writtenAt !== writtenAt)) }
}

/** 저장에서 편지 하나를 읽는다. 이상하면 null(그 편지만 버린다). 읽은 시각이 이상하면 그 칸만 버린다 */
export function readLetter(x: unknown): Letter | null {
  if (typeof x !== 'object' || x === null) return null
  const { writtenOn, writtenAt, opensOn, text, readAt } = x as Record<string, unknown>
  if (!isDate(writtenOn) || !isDate(opensOn) || opensOn <= writtenOn) return null
  if (typeof writtenAt !== 'number' || !Number.isFinite(writtenAt)) return null
  if (typeof text !== 'string' || text.trim().length === 0) return null
  const letter: Letter = { writtenOn, writtenAt, opensOn, text }
  if (typeof readAt === 'number' && Number.isFinite(readAt)) letter.readAt = readAt
  return letter
}

/** 편지 목록 읽기. 쓴 시각이 겹치면 앞의 것만, 쓴 순서로 */
export function readLetters(raw: unknown): Letter[] {
  if (!Array.isArray(raw)) return []
  const out: Letter[] = []
  for (const r of raw) {
    const l = readLetter(r)
    if (l && !out.some((o) => o.writtenAt === l.writtenAt)) out.push(l)
  }
  return sortLetters(out)
}

/** 백업 더하기: 폰의 편지는 그대로 두고 폰에 없는 편지만 더한다 */
export function mergeLetters(phone: Letter[], backup: Letter[]): Letter[] {
  return sortLetters([...phone, ...backup.filter((b) => !phone.some((p) => p.writtenAt === b.writtenAt))])
}
