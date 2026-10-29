import { createHash } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'

const KEY = 'diary-village:save'
const LOCK = 'diary-village:lock'

function entryOf(date: string, text: string, mood = 'calm') {
  return { date, text, mood, writtenAt: Date.parse(`${date}T20:00:00+09:00`) }
}
function lockOf(salt: string, pin: string, hint: string) {
  return { salt, hash: createHash('sha256').update(`${salt}:${pin}`).digest('hex'), hint }
}
/** 기록과 잠금을 넣고 다시 연다 */
async function openWith(page: Page, entries: unknown[], lock: unknown) {
  await page.goto('./')
  await page.evaluate(
    ([k, s, lk, l]) => {
      localStorage.setItem(k, s)
      localStorage.setItem(lk, l)
    },
    [KEY, JSON.stringify({ version: 1, entries }), LOCK, JSON.stringify(lock)],
  )
  await page.reload()
}
/** 숫자판으로 번호를 누른다 */
async function pressPin(page: Page, pin: string) {
  for (const d of pin) await page.getByTestId(`lock-key-${d}`).click()
}
/** 다른 앱으로 떠나거나(true) 돌아온다(false) */
async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}
const onDots = (page: Page) => page.getByTestId('lock-dots').locator('i.on')

test('숫자 잠금: 열 때 마을을 흐리게 덮고 글을 그리지 않으며, 맞는 번호로 열리고 5분 넘게 떠나면 다시 잠긴다', async ({ page }) => {
  const entries = [entryOf('2026-09-29', '한 달 전의 한 줄', 'great'), entryOf('2026-10-29', '아무에게도 말 못 한 비밀 한 줄')]
  await page.clock.install({ time: new Date('2026-10-29T21:00:00+09:00') })
  await openWith(page, entries, lockOf('a1b2c3d4e5f60718293a4b5c6d7e8f90', '1234', '고양이 생일'))

  await expect(page.getByTestId('lock')).toBeVisible()
  // 잠긴 동안 글·"N일 전 오늘" 쪽지는 보이지 않는다
  await expect(page.getByTestId('today-line')).toBeHidden()
  await expect(page.getByTestId('memory')).toBeHidden()
  // 숫자판과 작은 단추는 누르기 넉넉하다
  for (const id of ['lock-key-1', 'lock-key-0', 'lock-back', 'lock-hint-btn', 'lock-forget']) {
    const b = (await page.getByTestId(id).boundingBox())!
    expect(b.width).toBeGreaterThanOrEqual(44)
    expect(b.height).toBeGreaterThanOrEqual(44)
  }
  await page.screenshot({ path: 'test-results/screens/lock-screen.png' })

  // 힌트 보기
  await page.getByTestId('lock-hint-btn').click()
  await expect(page.getByTestId('lock-msg')).toHaveText('💡 고양이 생일')
  // 틀려도 벌 없이 다시 누를 수 있다
  await pressPin(page, '1111')
  await expect(page.getByTestId('lock-msg')).toHaveText('번호가 달라요 · 천천히 다시 눌러 보세요')
  await expect(onDots(page)).toHaveCount(0)
  await expect(page.getByTestId('lock')).toBeVisible()
  await pressPin(page, '12')
  await expect(onDots(page)).toHaveCount(2)
  await page.getByTestId('lock-back').click()
  await expect(onDots(page)).toHaveCount(1)
  await pressPin(page, '234')
  await expect(page.getByTestId('lock')).toBeHidden()
  await expect(page.getByTestId('today-line')).toContainText('아무에게도 말 못 한 비밀 한 줄')
  await expect(page.getByTestId('memory')).toBeVisible()

  // 잠깐(1분) 떠났다 오면 그대로, 5분 넘게 떠나면 다시 잠근다
  await setHidden(page, true)
  await page.clock.fastForward('01:00')
  await setHidden(page, false)
  await expect(page.getByTestId('lock')).toBeHidden()
  await setHidden(page, true)
  await page.clock.fastForward('06:00')
  await setHidden(page, false)
  await expect(page.getByTestId('lock')).toBeVisible()
  await expect(page.getByTestId('today-line')).toBeHidden()

  // 키보드로도 누를 수 있다
  await page.keyboard.type('1234')
  await expect(page.getByTestId('lock')).toBeHidden()

  // 잠금은 기록을 바꾸지 않는다
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(saved.entries).toEqual(entries)
})

test('숫자 잠금: 번호를 잊으면 하루 뒤 잠금만 풀리고 글은 그대로, 그사이 맞는 번호를 넣으면 요청을 거둔다', async ({ page }) => {
  const entries = [entryOf('2026-10-20', '스무날의 한 줄'), entryOf('2026-10-27', '이레의 한 줄', 'blue'), entryOf('2026-10-28', '어제의 한 줄', 'great')]
  const forgotAt = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).forgotAt, LOCK)
  await page.clock.install({ time: new Date('2026-10-29T21:00:00+09:00') })
  await openWith(page, entries, lockOf('0f1e2d3c4b5a69788796a5b4c3d2e1f0', '2580', ''))
  await expect(page.getByTestId('lock')).toBeVisible()
  // 힌트를 적지 않았으면 힌트 단추가 없다
  await expect(page.getByTestId('lock-hint-btn')).toBeHidden()

  await page.getByTestId('lock-forget').click()
  await expect(page.getByTestId('lock-forget-ask')).toContainText('글과 사진은 하나도 지우지 않아요')
  await page.screenshot({ path: 'test-results/screens/lock-forget.png' })
  // 다시 생각해 보면 아무것도 바뀌지 않는다
  await page.getByTestId('lock-forget-no').click()
  await expect(page.getByTestId('lock-forget-ask')).toBeHidden()
  expect(await forgotAt()).toBeUndefined()

  await page.getByTestId('lock-forget').click()
  await page.getByTestId('lock-forget-yes').click()
  await expect(page.getByTestId('lock-msg')).toHaveText('24시간 뒤 잠금이 풀려요 · 그사이 번호가 떠오르면 눌러 주세요')
  // 다시 열어도 기다림은 늘지 않는다
  await page.clock.fastForward('02:00:00')
  await page.reload()
  await expect(page.getByTestId('lock-msg')).toHaveText('22시간 뒤 잠금이 풀려요 · 그사이 번호가 떠오르면 눌러 주세요')

  // 번호가 떠올라 열면 잊음 요청을 거둔다
  await pressPin(page, '2580')
  await expect(page.getByTestId('lock')).toBeHidden()
  expect(await forgotAt()).toBeUndefined()

  // 다시 잠긴 채 잊어버리면, 하루 뒤 잠금만 풀린다
  await page.reload()
  await expect(page.getByTestId('lock')).toBeVisible()
  await page.getByTestId('lock-forget').click()
  await page.getByTestId('lock-forget-yes').click()
  await page.clock.fastForward('24:00:30')
  await expect(page.getByTestId('lock')).toBeHidden()
  await expect(page.getByTestId('build-note')).toHaveText('하루가 지나 잠금이 풀렸어요 · ⚙️에서 새 번호를 정할 수 있어요')
  expect(await page.evaluate((k) => localStorage.getItem(k), LOCK)).toBe('off')
  await expect(page.getByTestId('house-2026-10-28')).toBeVisible()
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(saved.entries).toEqual(entries)
  await page.reload()
  await expect(page.getByTestId('lock')).toBeHidden()
})
