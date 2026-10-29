import type { KV } from './storage'

/**
 * 숫자 잠금. 번호는 그대로 두지 않고 폰 안에서 만든 소금과 함께 SHA-256 해시로만 둔다.
 * 잠금은 보기만 가린다 — 기록·사진·꾸밈 자리는 바꾸지 않고, 백업에도 담지 않는다.
 * 틀려도 벌(기다리기·지우기)은 없다
 */
export const LOCK_KEY = 'diary-village:lock'

/** 힌트 한 줄의 글자 한도 */
export const HINT_MAX = 30

/** 이만큼 넘게 다른 앱에 있다가 돌아오면 다시 잠근다 */
export const RELOCK_AFTER = 5 * 60 * 1000

/** "번호를 잊었어요" 뒤 잠금만 풀리기까지 */
export const FORGET_WAIT = 24 * 60 * 60 * 1000

export interface LockSettings {
  salt: string
  hash: string
  hint: string
  /** "번호를 잊었어요"를 누른 시각 */
  forgotAt?: number
}

export function isPin(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin)
}

export function cleanHint(hint: string): string {
  return Array.from(hint.replace(/\s+/g, ' ').trim()).slice(0, HINT_MAX).join('')
}

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

export function newSalt(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)))
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
}

export async function makeLock(pin: string, hint: string, salt = newSalt()): Promise<LockSettings> {
  if (!isPin(pin)) throw new Error('번호는 네 자리 숫자예요')
  return { salt, hash: await hashPin(pin, salt), hint: cleanHint(hint) }
}

export async function checkPin(lock: LockSettings, pin: string): Promise<boolean> {
  if (!isPin(pin)) return false
  return (await hashPin(pin, lock.salt)) === lock.hash
}

/** 처음이거나 못 읽으면 잠그지 않는다(null) */
export function readLock(kv: KV): LockSettings | null {
  try {
    const raw = kv.getItem(LOCK_KEY)
    if (!raw || raw === 'off') return null
    const x = JSON.parse(raw) as Record<string, unknown>
    if (typeof x !== 'object' || x === null) return null
    if (typeof x.salt !== 'string' || x.salt === '') return null
    if (typeof x.hash !== 'string' || !/^[0-9a-f]{64}$/.test(x.hash)) return null
    const lock: LockSettings = { salt: x.salt, hash: x.hash, hint: typeof x.hint === 'string' ? cleanHint(x.hint) : '' }
    if (typeof x.forgotAt === 'number' && Number.isFinite(x.forgotAt)) lock.forgotAt = x.forgotAt
    return lock
  } catch {
    return null
  }
}

/** null 이면 잠금을 끈다 */
export function writeLock(kv: KV, lock: LockSettings | null): void {
  kv.setItem(LOCK_KEY, lock ? JSON.stringify(lock) : 'off')
}

/** 떠난 시각을 모르면 다시 잠그지 않는다 */
export function shouldRelock(leftAt: number | null, now: number): boolean {
  return leftAt !== null && now - leftAt > RELOCK_AFTER
}

/** 이미 눌렀으면 처음 누른 시각 그대로 — 기다림이 늘지 않는다 */
export function requestForget(lock: LockSettings, now: number): LockSettings {
  return lock.forgotAt !== undefined ? lock : { ...lock, forgotAt: now }
}

/** 맞는 번호를 넣으면 잊음 요청을 거둔다 */
export function cancelForget(lock: LockSettings): LockSettings {
  const { forgotAt: _, ...rest } = lock
  void _
  return rest
}

/** 잊음 요청 뒤 남은 시간(하루를 넘지 않음). 요청이 없으면 null */
export function forgetLeft(lock: LockSettings, now: number): number | null {
  if (lock.forgotAt === undefined) return null
  return Math.min(FORGET_WAIT, Math.max(0, lock.forgotAt + FORGET_WAIT - now))
}

/** 지금 잠가야 하는지. 잊음 요청 뒤 하루가 지나면 잠금만 풀린다 */
export function lockOn(lock: LockSettings | null, now: number): boolean {
  if (!lock) return false
  return forgetLeft(lock, now) !== 0
}
