import { describe, expect, it } from 'vitest'
import {
  FORGET_WAIT,
  HINT_MAX,
  LOCK_KEY,
  RELOCK_AFTER,
  cancelForget,
  checkPin,
  cleanHint,
  forgetLeft,
  hashPin,
  isPin,
  lockOn,
  makeLock,
  newSalt,
  readLock,
  requestForget,
  shouldRelock,
  writeLock,
  type LockSettings,
} from './lock'
import { backupText } from './backup'
import type { KV } from './storage'

const memory = (init: Record<string, string> = {}): KV & { m: Map<string, string> } => {
  const m = new Map(Object.entries(init))
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}

describe('번호 모양', () => {
  it('네 자리 숫자만 번호다', () => {
    expect(isPin('0000')).toBe(true)
    expect(isPin('1234')).toBe(true)
    expect(isPin('123')).toBe(false)
    expect(isPin('12345')).toBe(false)
    expect(isPin('12a4')).toBe(false)
    expect(isPin(' 1234')).toBe(false)
    expect(isPin('１２３４')).toBe(false)
  })

  it('힌트는 앞뒤 빈칸을 걷고 30자까지만 남긴다', () => {
    expect(HINT_MAX).toBe(30)
    expect(cleanHint('  첫 강아지 생일 ')).toBe('첫 강아지 생일')
    expect(Array.from(cleanHint('가'.repeat(40)))).toHaveLength(30)
    expect(cleanHint('줄\n바꿈')).toBe('줄 바꿈')
    expect(cleanHint('')).toBe('')
  })
})

describe('번호 해시', () => {
  it('소금은 매번 다르다', () => {
    expect(newSalt()).toMatch(/^[0-9a-f]{32}$/)
    expect(newSalt()).not.toBe(newSalt())
  })

  it('같은 번호·소금이면 같은 해시, 소금이 다르면 다른 해시', async () => {
    const a = await hashPin('1234', 'aa')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await hashPin('1234', 'aa')).toBe(a)
    expect(await hashPin('1234', 'bb')).not.toBe(a)
    expect(await hashPin('1235', 'aa')).not.toBe(a)
  })

  it('번호를 그대로 담지 않고, 맞는 번호만 맞다고 한다', async () => {
    const lock = await makeLock('2580', ' 우리 집 ')
    expect(JSON.stringify(lock)).not.toContain('2580')
    expect(lock.hint).toBe('우리 집')
    expect(await checkPin(lock, '2580')).toBe(true)
    expect(await checkPin(lock, '2581')).toBe(false)
    expect(await checkPin(lock, '')).toBe(false)
  })

  it('번호 모양이 아니면 잠금을 만들지 않는다', async () => {
    await expect(makeLock('12', '')).rejects.toThrow()
  })
})

describe('잠금 설정 읽기·쓰기', () => {
  it('키는 diary-village: 로 시작한다', () => {
    expect(LOCK_KEY).toBe('diary-village:lock')
  })

  it('처음이거나 못 읽으면 잠그지 않는다', () => {
    expect(readLock(memory())).toBeNull()
    expect(readLock(memory({ [LOCK_KEY]: '이상한 값' }))).toBeNull()
    expect(readLock(memory({ [LOCK_KEY]: JSON.stringify({ salt: 'aa', hash: '1234' }) }))).toBeNull()
    expect(readLock(memory({ [LOCK_KEY]: 'off' }))).toBeNull()
    const broken: KV = {
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {},
    }
    expect(readLock(broken)).toBeNull()
  })

  it('쓴 잠금을 그대로 읽고, 끄면 잠그지 않는다', async () => {
    const kv = memory()
    const lock = await makeLock('1111', '힌트')
    writeLock(kv, lock)
    expect(readLock(kv)).toEqual(lock)
    writeLock(kv, null)
    expect(readLock(kv)).toBeNull()
    expect([...kv.m.keys()]).toEqual([LOCK_KEY])
  })

  it('힌트가 길게 저장돼 있어도 잘라 읽고, 이상한 잊음 시각은 버린다', () => {
    const hash = 'a'.repeat(64)
    const kv = memory({
      [LOCK_KEY]: JSON.stringify({ salt: 'bb', hash, hint: '나'.repeat(50), forgotAt: '어제' }),
    })
    const lock = readLock(kv)!
    expect(Array.from(lock.hint)).toHaveLength(30)
    expect(lock.forgotAt).toBeUndefined()
  })

  it('저장된 기록 키는 건드리지 않는다', async () => {
    const kv = memory({ 'diary-village:save': '{"version":1,"entries":[]}', 'growth-game:x': '1' })
    writeLock(kv, await makeLock('1234', ''))
    expect(kv.m.get('diary-village:save')).toBe('{"version":1,"entries":[]}')
    expect(kv.m.get('growth-game:x')).toBe('1')
  })

  it('백업 파일에 번호·해시를 담지 않는다', async () => {
    const lock = await makeLock('9876', '비밀')
    const text = backupText({ version: 1, entries: [] })
    expect(text).not.toContain(lock.hash)
    expect(text).not.toContain('lock')
  })
})

describe('다시 잠그는 때', () => {
  it('5분 넘게 떠나 있었을 때만 다시 잠근다', () => {
    expect(RELOCK_AFTER).toBe(5 * 60 * 1000)
    const left = 1_000_000
    expect(shouldRelock(left, left + RELOCK_AFTER)).toBe(false)
    expect(shouldRelock(left, left + RELOCK_AFTER + 1)).toBe(true)
    expect(shouldRelock(left, left + 1000)).toBe(false)
  })

  it('떠난 시각을 모르면 다시 잠그지 않는다', () => {
    expect(shouldRelock(null, 5_000_000)).toBe(false)
  })
})

describe('번호를 잊었어요', () => {
  const base: LockSettings = { salt: 'aa', hash: 'b'.repeat(64), hint: '' }

  it('요청하면 24시간 뒤 잠금만 풀린다', () => {
    expect(FORGET_WAIT).toBe(24 * 60 * 60 * 1000)
    const at = 10_000_000
    const asked = requestForget(base, at)
    expect(asked.forgotAt).toBe(at)
    expect(asked.hash).toBe(base.hash)
    expect(lockOn(asked, at + FORGET_WAIT - 1)).toBe(true)
    expect(lockOn(asked, at + FORGET_WAIT)).toBe(false)
    expect(forgetLeft(asked, at + 1000)).toBe(FORGET_WAIT - 1000)
    expect(forgetLeft(asked, at + FORGET_WAIT + 5)).toBe(0)
  })

  it('다시 눌러도 기다림이 늘지 않는다(벌 없음)', () => {
    const asked = requestForget(base, 1000)
    expect(requestForget(asked, 5000).forgotAt).toBe(1000)
  })

  it('요청이 없으면 남은 시간도 없고, 맞는 번호를 넣으면 요청을 거둔다', () => {
    expect(forgetLeft(base, 1000)).toBeNull()
    const asked = requestForget(base, 1000)
    expect(cancelForget(asked).forgotAt).toBeUndefined()
    expect(lockOn(cancelForget(asked), 1000 + FORGET_WAIT * 2)).toBe(true)
  })

  it('잠금이 없으면 잠그지 않는다', () => {
    expect(lockOn(null, 1000)).toBe(false)
    expect(lockOn(base, 1000)).toBe(true)
  })

  it('잊음 시각이 앞날이어도(시계가 돌아가도) 하루를 넘게 기다리지 않는다', () => {
    const asked = requestForget(base, 10_000_000)
    // 폰 시계가 뒤로 갔다 → 남은 시간은 하루를 넘지 않는다
    expect(forgetLeft(asked, 5_000_000)).toBe(FORGET_WAIT)
  })
})
