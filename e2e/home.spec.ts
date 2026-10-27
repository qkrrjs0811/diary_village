import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { BUILDING_PROMPTS, PROMPTS, SEASON_PROMPTS, YESTERDAY_PROMPTS, todayPrompt, yesterdayPrompt } from '../src/core/prompt'
import { roomOf } from '../src/core/interior'
import type { Entry } from '../src/core/types'

const KEY = 'diary-village:save'
const moods = ['great', 'calm', 'meh', 'blue', 'tired']
/** 그달 여러 날에 쓴 기록(빈 날도 섞임) */
function monthEntries(month: string, days: number[]) {
  return days.map((d, i) => ({
    date: `${month}-${String(d).padStart(2, '0')}`,
    text: `${month} ${d}일의 한 줄`,
    mood: moods[(d * 7 + i) % moods.length],
    writtenAt: Date.parse(`${month}-${String(d).padStart(2, '0')}T22:00:00+09:00`),
  }))
}

test('처음 열면 오늘 자리가 비어 있고, 한 줄을 쓰면 집이 생기고 눌러서 읽는다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  await expect(page.getByTestId('today-date')).toHaveText('10월 27일 화요일')
  await expect(page.getByTestId('today-spot')).toBeVisible()
  await expect(page.getByTestId('house-count')).toHaveText('🏠 0채')
  await expect(page.getByTestId('write-submit')).toBeDisabled()
  await page.screenshot({ path: 'test-results/screens/home-empty.png' })

  await page.getByTestId('write-input').fill('퇴근길에 노을이 예뻤다')
  await expect(page.getByTestId('write-msg')).toHaveText('오늘 기분을 골라 주세요')
  await page.getByTestId('mood-great').click()
  await expect(page.getByTestId('write-len')).toHaveText('12 / 100')
  await page.getByTestId('write-submit').click()

  await expect(page.getByTestId('house-2026-10-27')).toBeVisible()
  await expect(page.getByTestId('today-spot')).toHaveCount(0)
  await expect(page.getByTestId('house-count')).toHaveText('🏠 1채')
  await expect(page.getByTestId('today-line')).toContainText('퇴근길에 노을이 예뻤다')
  await expect(page.getByTestId('weather')).toHaveText('☀️ 오늘은 맑음')
  await page.clock.runFor(4000) // 짓는 연출이 끝날 때까지
  await page.screenshot({ path: 'test-results/screens/home-first-house.png' })

  await page.getByTestId('house-2026-10-27').click()
  await expect(page.getByTestId('reader-text')).toHaveText('퇴근길에 노을이 예뻤다')
  await expect(page.getByTestId('reader-date')).toHaveText('2026년 10월 27일 화요일')
  await expect(page.getByTestId('reader-mood')).toHaveText('☀️ 좋아요 · 맑음')
  await page.screenshot({ path: 'test-results/screens/reader.png' })
  await page.getByTestId('reader-close').click()
  await expect(page.getByTestId('reader')).toBeHidden()

  // 다시 열어도 남아 있다
  await page.reload()
  await expect(page.getByTestId('house-2026-10-27')).toBeVisible()
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(saved.entries).toHaveLength(1)
})

/** 소리·떨림을 가로채 window.notes·buzz 에 기록한다(실제로 울리지 않는다) */
function listenSound() {
  const w = window as unknown as { notes: number[]; buzz: unknown[]; AudioContext: unknown }
  w.notes = []
  w.buzz = []
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} })
  w.AudioContext = class {
    state = 'running'
    currentTime = 0
    destination = {}
    resume() {
      return Promise.resolve()
    }
    createGain() {
      return { gain: param(), connect: (x: unknown) => x }
    }
    createOscillator() {
      const frequency = param()
      return { type: '', frequency, connect: (x: unknown) => x, start: () => w.notes.push(frequency.value), stop() {} }
    }
  }
  Object.defineProperty(navigator, 'vibrate', { value: (p: unknown) => (w.buzz.push(p), true) })
}

test('집이 쑥 올라오는 순간 그날 기분의 실로폰 소리가 울리고 폰이 짧게 떤다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.addInitScript(listenSound)
  await page.goto('./')
  await page.getByTestId('write-input').fill('비가 와서 창밖만 봤다')
  await page.getByTestId('mood-blue').click()
  await page.clock.pauseAt(new Date('2026-10-27T21:01:00+09:00'))
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('house-2026-10-27')).toBeVisible()
  // 떨림은 집이 올라오는 순간(다가간 뒤)에 온다
  expect(await page.evaluate(() => (window as unknown as { buzz: unknown[] }).buzz)).toEqual([])
  await page.clock.runFor(1000)
  expect(await page.evaluate(() => (window as unknown as { buzz: unknown[] }).buzz)).toEqual([[30, 40, 50]])
  // 네 음, 음마다 바탕음과 옅은 배음. 울적한 날은 A 단조 오음(A4~A5)
  const notes = await page.evaluate(() => (window as unknown as { notes: number[] }).notes)
  expect(notes).toHaveLength(8)
  const base = notes.filter((_, i) => i % 2 === 0)
  for (const f of base) expect([440, 523.25, 587.33, 659.26, 783.99, 880]).toContain(f)
  // 저장은 기록뿐이고 소리 설정은 아직 없다(처음엔 켜짐)
  const keys = await page.evaluate(() => Object.keys(localStorage).sort())
  expect(keys).toEqual(['diary-village:save'])
})

test('설정 창에서 소리를 끄면 다시 열어도 꺼져 있고, 집을 지어도 소리·떨림이 없다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.addInitScript(listenSound)
  await page.goto('./')
  await page.getByTestId('settings-open').click()
  const toggle = page.getByTestId('sound-toggle')
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(toggle).toContainText('🔔 소리')
  const box = (await toggle.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  await expect(page.getByTestId('settings-close')).toBeInViewport()
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/screens/settings-sound-on.png' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(toggle).toContainText('🔕 소리')
  await expect(toggle).toContainText('조용히')
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'test-results/screens/settings-sound-off.png' })
  expect(await page.evaluate(() => localStorage.getItem('diary-village:sound'))).toBe('off')

  // 다시 열어도 꺼져 있다
  await page.reload()
  await page.getByTestId('settings-open').click()
  await expect(page.getByTestId('sound-toggle')).toHaveAttribute('aria-checked', 'false')
  await page.getByTestId('settings-close').click()

  // 집을 지어도 조용하다
  await page.getByTestId('write-input').fill('조용한 밤')
  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('house-2026-10-27')).toBeVisible()
  await page.clock.runFor(2000)
  expect(await page.evaluate(() => (window as unknown as { notes: number[] }).notes)).toEqual([])
  expect(await page.evaluate(() => (window as unknown as { buzz: unknown[] }).buzz)).toEqual([])

  // 다시 켜면 켜짐으로 남고, 기록은 그대로다
  await page.getByTestId('settings-open').click()
  await page.getByTestId('sound-toggle').click()
  await expect(page.getByTestId('sound-toggle')).toHaveAttribute('aria-checked', 'true')
  expect(await page.evaluate(() => localStorage.getItem('diary-village:sound'))).toBe('on')
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(saved.entries).toHaveLength(1)
})

/** 이름표 상자가 어느 집 상자와도 겹치지 않는다 */
async function expectSignClear(page: import('@playwright/test').Page, sign: string) {
  const s = (await page.getByTestId(sign).boundingBox())!
  const houses = await page.locator('[data-testid^="house-20"]').evaluateAll((list) =>
    list.map((h) => {
      const r = h.getBoundingClientRect()
      return { id: h.getAttribute('data-testid'), x: r.x, y: r.y, w: r.width, h: r.height }
    }),
  )
  expect(houses.length).toBeGreaterThan(0)
  const hit = houses.filter((h) => h.x < s.x + s.width && s.x < h.x + h.w && h.y < s.y + s.height && s.y < h.y + h.h)
  expect(hit.map((h) => h.id)).toEqual([])
}

test('하루 한 줄씩 쌓인 한 달은 집이 가득한 구역이 된다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const days = [1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 25, 26]
  const entries = [...monthEntries('2026-09', [12, 13, 20, 28]), ...monthEntries('2026-10', days)]
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await expect(page.getByTestId('house-count')).toHaveText(`🏠 ${entries.length}채`)
  await expect(page.getByTestId('month-2026-10')).toBeVisible()
  await expect(page.getByTestId('today-spot')).toBeVisible()
  // 처음 보기: 이달 섬이 화면 세로 가운데에 오고(아래 빈 하늘이 넓지 않게), 오늘 자리가 보인다
  const scene = (await page.getByTestId('village').boundingBox())!
  const slab = (await page.getByTestId('slab-2026-10').boundingBox())!
  const above = slab.y - scene.y
  const below = scene.y + scene.height - (slab.y + slab.height)
  // 위쪽은 이름표와 뒤쪽 집 지붕이 솟아 조금 더 남긴다
  expect(below).toBeGreaterThanOrEqual(0)
  expect(below).toBeLessThan(140)
  expect(above).toBeGreaterThan(below)
  await expect(page.getByTestId('today-spot')).toBeInViewport()
  await expect(page.getByTestId('house-2026-10-26')).toBeInViewport()
  // 구역 이름표는 화면 안에 보이고, 빽빽한 집 지붕을 가리지 않는다
  await expect(page.getByTestId('month-2026-10')).toBeInViewport()
  await expectSignClear(page, 'month-2026-10')
  await page.screenshot({ path: 'test-results/screens/home-month.png' })

  // 멀리 보고 끌어서 지난달 구역을 본다
  const box = (await page.getByTestId('village').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 200)
  await page.mouse.move(box.x + box.width / 2, box.y + 60)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + 300, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByTestId('month-2026-09')).toBeInViewport()
  await expect(page.getByTestId('reader')).toBeHidden() // 끌기는 누름이 아니다
  await page.screenshot({ path: 'test-results/screens/home-drag.png' })
})

test('일요일에 시작해 날마다 쓴 달도 구역 이름표가 뒤쪽 첫 줄의 높은 등대를 가리지 않는다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-30T12:00:00+09:00') })
  await page.goto('./')
  // 2026년 11월 1일은 일요일이라 뒤쪽 모서리 첫 칸부터 집이 선다. 첫 줄은 모두 등대
  const entries = monthEntries('2026-11', Array.from({ length: 30 }, (_, i) => i + 1)).map((e, i) => (i < 7 || i % 7 === 0 ? { ...e, text: `바닷가 ${e.text}` } : e))
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await expect(page.getByTestId('house-count')).toHaveText('🏠 30채')
  await expect(page.getByTestId('house-2026-11-01')).toHaveAttribute('data-building', 'lighthouse')
  await expectSignClear(page, 'month-2026-11')
  // 조금 멀리 봐서 이름표와 뒤쪽 집을 함께 찍는다
  const box = (await page.getByTestId('village').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 200)
  await page.waitForTimeout(300)
  await expect(page.getByTestId('month-2026-11')).toBeInViewport()
  await expectSignClear(page, 'month-2026-11')
  await page.screenshot({ path: 'test-results/screens/month-sign-dense.png' })
})

test('달 첫날에 열어도 이달 섬이 화면 가운데에 와서 빈 하늘이 한쪽으로 몰리지 않는다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-01T12:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [20, 25, 31])
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await expect(page.getByTestId('today-spot')).toBeInViewport()
  const scene = (await page.getByTestId('village').boundingBox())!
  const slab = (await page.getByTestId('slab-2026-11').boundingBox())!
  const above = slab.y - scene.y
  const below = scene.y + scene.height - (slab.y + slab.height)
  expect(above).toBeGreaterThanOrEqual(0)
  expect(below).toBeGreaterThanOrEqual(0)
  expect(below).toBeLessThan(140)
  await page.screenshot({ path: 'test-results/screens/home-month-start.png' })
})

test('처음엔 오늘 자리 가까이 보고, 휠·두 손가락으로 확대·축소해도 누르기가 된다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [20, 22, 24, 25, 26])
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  const house = page.getByTestId('house-2026-10-26')
  const width = async () => (await house.boundingBox())!.width
  // 처음 열면 집이 작지 않다(칸 48 → 화면 약 80px)
  await expect(house).toBeInViewport()
  const start = await width()
  expect(start).toBeGreaterThan(50)
  await page.screenshot({ path: 'test-results/screens/zoom-start.png' })

  const svg = (await page.getByTestId('village').boundingBox())!
  const cx = svg.x + svg.width / 2
  const cy = svg.y + svg.height / 2
  await page.mouse.move(cx, cy)
  // 휠로 가까이 — 한계에서 멈춘다
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -200)
  const near = await width()
  expect(near).toBeGreaterThan(start * 1.5)
  await page.mouse.wheel(0, -200)
  expect(await width()).toBeCloseTo(near, 0)
  await page.screenshot({ path: 'test-results/screens/zoom-near.png' })
  // 휠로 멀리 — 한계에서 멈춘다
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 200)
  const far = await width()
  expect(far).toBeLessThan(start / 2)
  await page.mouse.wheel(0, 200)
  expect(await width()).toBeCloseTo(far, 0)
  await page.screenshot({ path: 'test-results/screens/zoom-far.png' })

  // 두 손가락을 벌리면 가까이 본다
  await page.evaluate(
    ([x, y]) => {
      const svg = document.querySelector('[data-testid="village"]')!
      const fire = (type: string, id: number, px: number) =>
        svg.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: px, clientY: y, bubbles: true, isPrimary: id === 1 }))
      fire('pointerdown', 1, x - 20)
      fire('pointerdown', 2, x + 20)
      for (let i = 1; i <= 10; i++) {
        fire('pointermove', 1, x - 20 - i * 10)
        fire('pointermove', 2, x + 20 + i * 10)
      }
      fire('pointerup', 1, x - 120)
      fire('pointerup', 2, x + 120)
    },
    [cx, cy],
  )
  const pinched = await width()
  expect(pinched).toBeGreaterThan(far * 2)
  await expect(page.getByTestId('reader')).toBeHidden() // 두 손가락은 누름이 아니다

  // 확대한 채로 집을 누르면 그날 글이 열린다
  await house.click()
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 26일의 한 줄')
})

test('집을 지으면 그 집으로 다가가 짓는 연출을 보이고 원래 보기로 돌아온다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  // 8일 → 9일째(명소·단계가 오르지 않아 축하 카드가 뜨지 않는 날)
  const entries = monthEntries('2026-10', [9, 13, 15, 20, 22, 24, 25, 26])
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  // 조금 멀리 본 상태에서 짓는다
  const svg = (await page.getByTestId('village').boundingBox())!
  await page.mouse.move(svg.x + svg.width / 2, svg.y + svg.height / 2)
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 200)
  const viewBox = () => page.getByTestId('village').getAttribute('viewBox')
  const before = await viewBox()
  const old = page.getByTestId('house-2026-10-26')
  const oldWidth = (await old.boundingBox())!.width

  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('따뜻한 차 한 잔')
  await page.getByTestId('write-submit').click()
  const house = page.getByTestId('house-2026-10-27')
  await expect(house).toBeAttached()
  await expect(page.getByTestId('build-fx')).toBeAttached()

  // 다가가서 머무는 동안: 새 집이 가운데 가까이 크게 보인다
  await page.clock.runFor(1500)
  const near = (await house.boundingBox())!
  expect(near.width).toBeGreaterThan(oldWidth * 1.5)
  const mid = near.x + near.width / 2
  expect(Math.abs(mid - (svg.x + svg.width / 2))).toBeLessThan(40)
  // CSS 연출은 가짜 시계를 따르지 않으니 같은 순간(1.5초)에 멈춰 찍는다
  await page.evaluate(() => document.getAnimations().forEach((a) => ((a.currentTime = 1500), a.pause())))
  await page.screenshot({ path: 'test-results/screens/build-show.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))

  // 잠시 뒤 원래 보기로 돌아온다
  await page.clock.runFor(2500)
  expect(await viewBox()).toBe(before)
  expect((await old.boundingBox())!.width).toBeCloseTo(oldWidth, 0)
  await page.screenshot({ path: 'test-results/screens/build-back.png' })
  await house.click()
  await expect(page.getByTestId('reader-text')).toHaveText('따뜻한 차 한 잔')
})

test('짓는 연출 중에 손을 대면 그 자리에서 멈춘다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  await page.getByTestId('mood-great').click()
  await page.getByTestId('write-input').fill('산책')
  await page.getByTestId('write-submit').click()
  await page.clock.runFor(400)
  const svg = (await page.getByTestId('village').boundingBox())!
  await page.mouse.move(svg.x + svg.width / 2, svg.y + svg.height / 2)
  await page.mouse.wheel(0, 100)
  const stopped = await page.getByTestId('village').getAttribute('viewBox')
  await page.clock.runFor(4000)
  expect(await page.getByTestId('village').getAttribute('viewBox')).toBe(stopped)
})

test('어제를 안 썼으면 "어제도 남길까요?"로 어제 칸에 쓴다', async ({ page }) => {
  // 자정을 넘긴 늦은 밤. 그 전날(24일)까지는 써 두었다
  await page.clock.install({ time: new Date('2026-10-27T00:40:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [20, 22, 24, 25])
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await expect(page.getByTestId('write-yesterday')).toHaveText('🌙 어제(10월 26일)도 남길까요?')
  await expect(page.getByTestId('write-yesterday')).toBeInViewport()
  expect((await page.getByTestId('write-yesterday').boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: 'test-results/screens/yesterday-offer.png' })

  // 오늘 쓰던 글은 어제 칸으로 갔다 와도 남아 있다
  await page.getByTestId('write-input').fill('오늘 쓰던 글')
  await page.getByTestId('write-yesterday').click()
  await expect(page.getByTestId('today-date')).toHaveText('10월 26일 월요일')
  await expect(page.getByTestId('write-input')).toHaveValue('')
  await expect(page.getByTestId('write-msg')).toHaveText('어제 기분을 골라 주세요')
  await page.getByTestId('back-today').click()
  await expect(page.getByTestId('today-date')).toHaveText('10월 27일 화요일')
  await expect(page.getByTestId('write-input')).toHaveValue('오늘 쓰던 글')

  await page.getByTestId('write-yesterday').click()
  await page.getByTestId('mood-tired').click()
  await page.getByTestId('write-input').fill('야근하고 와서 늦게 남기는 어제')
  await page.screenshot({ path: 'test-results/screens/yesterday-form.png' })
  await page.getByTestId('write-submit').click()

  await expect(page.getByTestId('house-2026-10-26')).toBeAttached()
  await expect(page.getByTestId('house-count')).toHaveText('🏠 5채')
  // 어제를 쓰면 다시 오늘 칸이고, 어제 버튼은 사라진다. 오늘 자리는 그대로 비어 있다
  await expect(page.getByTestId('today-date')).toHaveText('10월 27일 화요일')
  await expect(page.getByTestId('write-yesterday')).toHaveCount(0)
  await expect(page.getByTestId('today-spot')).toBeAttached()
  await page.clock.runFor(4000)
  await page.screenshot({ path: 'test-results/screens/yesterday-built.png' })

  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  const y = saved.entries.find((e: { date: string }) => e.date === '2026-10-26')
  expect(y).toMatchObject({ text: '야근하고 와서 늦게 남기는 어제', mood: 'tired' })
  await page.getByTestId('house-2026-10-26').click()
  await expect(page.getByTestId('reader-text')).toHaveText('야근하고 와서 늦게 남기는 어제')
})

test('오늘을 먼저 써도 어제 칸은 남아 있고, 그보다 전 날은 열지 않는다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  await page.getByTestId('mood-great').click()
  await page.getByTestId('write-input').fill('오늘 먼저')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('today-line')).toContainText('오늘 먼저')
  await expect(page.getByTestId('write-yesterday')).toBeVisible()
  await page.clock.runFor(4000)
  await page.screenshot({ path: 'test-results/screens/yesterday-after-today.png' })
  await page.getByTestId('write-yesterday').click()
  await expect(page.getByTestId('back-today')).toHaveText('오늘의 한 줄 보기')
  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('어제도')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('today-line')).toContainText('오늘 먼저')
  await expect(page.getByTestId('write-yesterday')).toHaveCount(0)
  await expect(page.getByTestId('house-count')).toHaveText('🏠 2채')
})

test('읽기 창에서 쓴 글과 기분을 고친다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [20, 22, 24, 25, 26])
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  const before = entries.find((e) => e.date === '2026-10-26')!
  await page.getByTestId('house-2026-10-26').click()
  await expect(page.getByTestId('reader-edited')).toBeHidden()
  await page.screenshot({ path: 'test-results/screens/reader-edit-button.png' })
  await page.getByTestId('reader-edit').click()
  await expect(page.getByTestId('edit-input')).toHaveValue(before.text)
  await expect(page.getByTestId(`edit-mood-${before.mood}`)).toHaveAttribute('aria-pressed', 'true')

  // 비우면 고칠 수 없고, 그만두면 원래 글 그대로다
  await page.getByTestId('edit-input').fill('  ')
  await expect(page.getByTestId('edit-save')).toBeDisabled()
  await expect(page.getByTestId('edit-msg')).toHaveText('한 줄을 남겨 주세요')
  await page.getByTestId('edit-cancel').click()
  await expect(page.getByTestId('reader-text')).toHaveText(before.text)

  await page.getByTestId('reader-edit').click()
  await page.getByTestId('edit-mood-blue').click()
  await page.getByTestId('edit-input').fill('다시 생각해 보니 조금 쓸쓸한 날')
  await page.screenshot({ path: 'test-results/screens/reader-edit.png' })
  await page.getByTestId('edit-save').click()
  await expect(page.getByTestId('reader-text')).toHaveText('다시 생각해 보니 조금 쓸쓸한 날')
  await expect(page.getByTestId('reader-mood')).toContainText('🌧️')
  await expect(page.getByTestId('reader-edited')).toHaveText('✏️ 10월 27일에 고쳤어요')
  await page.screenshot({ path: 'test-results/screens/reader-edited.png' })
  await page.getByTestId('reader-close').click()

  // 마을의 그 집 색이 바뀌고, 집 수는 그대로다. 다시 열어도 남아 있다
  await expect(page.getByTestId('house-2026-10-26')).toHaveAttribute('data-mood', 'blue')
  await expect(page.getByTestId('house-count')).toHaveText('🏠 5채')
  await page.reload()
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  const y = saved.entries.find((e: { date: string }) => e.date === '2026-10-26')
  // 처음 쓴 시각은 그대로, 고친 시각이 새로 남는다
  expect(y).toMatchObject({ ...before, text: '다시 생각해 보니 조금 쓸쓸한 날', mood: 'blue' })
  expect(y.editedAt).toBeGreaterThanOrEqual(Date.parse('2026-10-27T21:00:00+09:00'))
  await page.getByTestId('house-2026-10-26').click()
  await expect(page.getByTestId('reader-text')).toHaveText('다시 생각해 보니 조금 쓸쓸한 날')
})

test('읽기 창에서 쓴 글을 지우면 확인을 한 번 더 받고, 빈 땅이 되어도 명소·단계는 그대로다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [17, 18, 19, 20, 21, 22, 23, 24, 25, 26])
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries, villageName: '노을 마을' })])
  await page.reload()
  await expect(page.getByTestId('village-stage')).toHaveText('🏘️ 마을')
  await expect(page.locator('[data-landmark="well"].landmark')).toHaveCount(1)
  const gone = entries.find((e) => e.date === '2026-10-25')!

  await page.getByTestId('house-2026-10-25').click()
  const buttons = ['reader-edit', 'reader-erase', 'reader-close']
  for (const id of buttons) {
    const box = (await page.getByTestId(id).boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
  }
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/screens/reader-erase-button.png' })

  // 한 번 더 묻고, 그만두면 글은 그대로다
  await page.getByTestId('reader-erase').click()
  await expect(page.getByTestId('erase-text')).toHaveText(gone.text)
  await expect(page.getByTestId('erase-note')).toContainText('명소와 마을 단계는 그대로예요')
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/screens/erase-confirm.png' })
  await page.getByTestId('erase-cancel').click()
  await expect(page.getByTestId('reader-text')).toHaveText(gone.text)
  let saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(saved.entries).toHaveLength(10)

  await page.getByTestId('reader-erase').click()
  await page.getByTestId('erase-confirm').click()
  await expect(page.getByTestId('reader')).toBeHidden()
  await expect(page.getByTestId('build-note')).toHaveText('🌱 10월 25일 자리가 빈 땅으로 돌아갔어요')
  await expect(page.getByTestId('house-2026-10-25')).toHaveCount(0)
  await expect(page.getByTestId('house-count')).toHaveText('🏠 9채')
  // 지운 날도 집을 지었던 날로 센다
  await expect(page.getByTestId('village-stage')).toHaveText('🏘️ 마을')
  await expect(page.locator('[data-landmark="well"].landmark')).toHaveCount(1)
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'test-results/screens/erased.png' })

  // 저장에는 글 없이 날짜와 지운 시각만 남고, 다른 글과 이름은 그대로다
  saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(saved.entries).toHaveLength(9)
  expect(saved.erased).toEqual([{ date: '2026-10-25', erasedAt: expect.any(Number) }])
  expect(JSON.stringify(saved)).not.toContain(gone.text)
  expect(saved.villageName).toBe('노을 마을')

  await page.getByTestId('village-stage').click()
  await expect(page.getByTestId('book-stage')).toContainText('10일')
  await page.reload()
  await expect(page.getByTestId('house-2026-10-25')).toHaveCount(0)
  await expect(page.getByTestId('house-2026-10-24')).toBeVisible()
  await expect(page.getByTestId('village-stage')).toHaveText('🏘️ 마을')
})

test('흔한 하루의 말로 새 건물(식당·공원 등)이 서고, 원래 건물의 말이 든 날은 그대로다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const texts: [number, string, string][] = [
    [22, '김밥 싸서 소풍 갔다', 'restaurant'],
    [23, '시험 공부를 했다', 'school'],
    [24, '산책하다 커피 한 잔', 'cafe'], // 원래 건물의 말이 있으면 원래 건물
    [25, '그냥 조용한 하루', 'house'],
  ]
  const entries = texts.map(([d, text], i) => ({
    date: `2026-10-${d}`,
    text,
    mood: moods[i % moods.length],
    writtenAt: Date.parse(`2026-10-${d}T22:00:00+09:00`),
  }))
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  for (const [d, , kind] of texts) await expect(page.getByTestId(`house-2026-10-${d}`)).toHaveAttribute('data-building', kind)

  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('저녁에 동네 산책')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('house-2026-10-27')).toHaveAttribute('data-building', 'park')
  await expect(page.getByTestId('build-note')).toHaveText("🌳 '산책'을 찾아 공원이 생겼어요")
  await page.clock.runFor(1500)
  await page.evaluate(() => document.getAnimations().forEach((a) => ((a.currentTime = 1500), a.pause())))
  await page.screenshot({ path: 'test-results/screens/build-note-park.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
  await page.clock.runFor(6000)

  // 세 건물은 제 그림(식당 가림막·학교 시계·공원 나무)으로 선다
  await expect(page.getByTestId('house-2026-10-22').locator('.restaurant-cloth')).toHaveCount(3)
  await expect(page.getByTestId('house-2026-10-23').locator('.school-clock')).toHaveCount(1)
  await expect(page.getByTestId('house-2026-10-27').locator('.park-tree')).toHaveCount(2)
  await expect(page.getByTestId('house-2026-10-27').locator('.park-bench')).toHaveCount(1)
  const mid = (await page.getByTestId('house-2026-10-22').boundingBox())!
  await page.mouse.move(mid.x + mid.width / 2, mid.y + mid.height / 2)
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -200)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/buildings-new.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
  await page.mouse.wheel(0, 1000)

  await page.getByTestId('house-2026-10-27').click()
  await expect(page.getByTestId('reader-building')).toHaveText("🌳 공원 · '산책'에서 생겼어요")
  await page.getByTestId('reader-close').click()

  await page.getByTestId('village-stage').click()
  await expect(page.getByTestId('book-count')).toHaveText('4 / 16')
  await expect(page.getByTestId('book-park').locator('.book-name')).toHaveText('공원')
  await page.getByTestId('book-farm').click()
  await expect(page.getByTestId('book-detail')).toHaveText('❔ 흙을 만지고 싹을 돌본 날에 생겨요')
  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(stored.entries.find((e: { date: string }) => e.date === '2026-10-24').text).toBe('산책하다 커피 한 잔')
})

test('기차역·미술관·텃밭이 제 그림으로 서고, 읽기 창과 도감에 보인다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const texts: [number, string, string][] = [
    [24, '기차 타고 산으로 여행', 'station'],
    [25, '미술관에서 전시를 봤다', 'gallery'],
    [26, '텃밭에 상추 씨앗을 심었다', 'farm'],
  ]
  const entries = texts.map(([d, text], i) => ({
    date: `2026-10-${d}`,
    text,
    mood: moods[i % moods.length],
    writtenAt: Date.parse(`2026-10-${d}T22:00:00+09:00`),
  }))
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  for (const [d, , kind] of texts) await expect(page.getByTestId(`house-2026-10-${d}`)).toHaveAttribute('data-building', kind)

  await expect(page.getByTestId('house-2026-10-24').locator('.station-train')).toHaveCount(1)
  await expect(page.getByTestId('house-2026-10-24').locator('.station-rail')).toHaveCount(2)
  await expect(page.getByTestId('house-2026-10-24').locator('.station-clock')).toHaveCount(1)
  await expect(page.getByTestId('house-2026-10-25').locator('.gallery-column')).toHaveCount(4)
  await expect(page.getByTestId('house-2026-10-25').locator('.gallery-frame')).toHaveCount(2)
  await expect(page.getByTestId('house-2026-10-25').locator('.gallery-easel')).toHaveCount(1)
  await expect(page.getByTestId('house-2026-10-26').locator('.farm-row')).toHaveCount(3)
  await expect(page.getByTestId('house-2026-10-26').locator('.farm-sprout')).toHaveCount(12)
  await expect(page.getByTestId('house-2026-10-26').locator('.farm-scarecrow')).toHaveCount(1)

  const mid = (await page.getByTestId('house-2026-10-25').boundingBox())!
  await page.mouse.move(mid.x + mid.width / 2, mid.y + mid.height / 2)
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -200)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/buildings-new-2.png' })
  // 건물마다 가까이 본 사진(앞의 나무·주민을 잠시 가리고 건물만 본다)
  await page.addStyleTag({ content: '.tree, .resident { visibility: hidden }' })
  for (const [d, name] of [[24, 'station'], [25, 'gallery'], [26, 'farm']]) {
    const house = page.getByTestId(`house-2026-10-${d}`)
    const b = (await house.boundingBox())!
    // 빈 하늘 쪽을 끌어서 그 건물을 화면 가운데로
    const dx = 195 - (b.x + b.width / 2)
    const dy = 330 - (b.y + b.height / 2)
    const from = { x: dx < 0 ? 370 : 20, y: dy < 0 ? 560 : 120 }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 })
    await page.mouse.up()
    await house.screenshot({ path: `test-results/screens/building-${name}.png` })
  }
  await page.evaluate(() => document.querySelectorAll('style').forEach((s) => s.textContent?.includes('.tree, .resident') && s.remove()))
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
  await page.mouse.wheel(0, 1000)

  await page.getByTestId('house-2026-10-26').click()
  await expect(page.getByTestId('reader-building')).toHaveText("🌱 텃밭 · '텃밭'에서 생겼어요")
  await page.getByTestId('reader-close').click()

  await page.getByTestId('village-stage').click()
  await expect(page.getByTestId('book-count')).toHaveText('3 / 16')
  for (const [id, name] of [['station', '기차역'], ['gallery', '미술관'], ['farm', '텃밭']]) {
    await expect(page.getByTestId(`book-${id}`).locator('.book-name')).toHaveText(name)
  }
  // 도감 16칸이 수첩 안에서 잘리지 않는다
  const grid = (await page.getByTestId('book-buildings').boundingBox())!
  expect(grid.x).toBeGreaterThanOrEqual(0)
  expect(grid.x + grid.width).toBeLessThanOrEqual(390)
  await page.getByTestId('book-farm').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/screens/book-new-buildings.png' })
  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(stored.entries.map((e: { text: string }) => e.text)).toEqual(entries.map((e) => e.text))
})

test('글에 나온 말로 건물이 정해지고, 지으면 알려 주고, 읽기 창에 건물 이름이 보인다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const texts: [number, string, string][] = [
    [14, '도서관에서 소설을 빌렸다', 'bookstore'],
    [15, '저녁에 한강 달리기', 'field'],
    [16, '길에서 만난 고양이', 'catHouse'],
    [17, '옆집 강아지가 반겨 줬다', 'dogHouse'],
    [19, '튤립 한 단을 샀다', 'flowerShop'],
    [20, '갓 구운 빵 냄새', 'bakery'],
    [21, '바다를 보고 왔다', 'lighthouse'],
    [22, '좋아하는 노래를 들었다', 'musicHall'],
    [23, '영화 한 편', 'cinema'],
    [24, '아침 라떼가 맛있었다', 'cafe'],
    [25, '그냥 조용한 하루', 'house'],
  ]
  const entries = texts.map(([d, text], i) => ({
    date: `2026-10-${d}`,
    text,
    mood: moods[i % moods.length],
    writtenAt: Date.parse(`2026-10-${d}T22:00:00+09:00`),
  }))
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  for (const [d, , kind] of texts) await expect(page.getByTestId(`house-2026-10-${d}`)).toHaveAttribute('data-building', kind)
  await expect(page.getByTestId('build-note')).toBeHidden()
  // 조금 가까이 본다
  const svg = (await page.getByTestId('village').boundingBox())!
  await page.mouse.move(svg.x + svg.width / 2, svg.y + svg.height / 2 - 40)
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -200)
  await page.screenshot({ path: 'test-results/screens/buildings.png' })
  await page.mouse.wheel(0, 600)

  // 오늘 '커피'를 쓰면 카페가 생기고 알려 준다
  await page.getByTestId('mood-great').click()
  await page.getByTestId('write-input').fill('퇴근길 커피 한 잔')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('house-2026-10-27')).toHaveAttribute('data-building', 'cafe')
  await expect(page.getByTestId('build-note')).toHaveText("☕ '커피'를 찾아 카페가 생겼어요")
  await page.clock.runFor(1500)
  await page.evaluate(() => document.getAnimations().forEach((a) => ((a.currentTime = 1500), a.pause())))
  await page.screenshot({ path: 'test-results/screens/build-note.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
  // 잠시 뒤 저절로 사라진다
  await page.clock.runFor(6000)
  await expect(page.getByTestId('build-note')).toBeHidden()

  // 읽기 창에 건물 이름이 보이고, 보통 집은 보이지 않는다
  await page.getByTestId('house-2026-10-27').click()
  await expect(page.getByTestId('reader-building')).toHaveText("☕ 카페 · '커피'에서 생겼어요")
  await page.waitForTimeout(400) // 창이 올라오는 연출이 끝날 때까지
  await page.screenshot({ path: 'test-results/screens/reader-building.png' })
  // 글을 고치면 건물도 바뀐다(기획서 8번)
  await page.getByTestId('reader-edit').click()
  await page.getByTestId('edit-input').fill('퇴근길에 책 한 권')
  await page.getByTestId('edit-save').click()
  await expect(page.getByTestId('reader-building')).toHaveText("📚 책방 · '책'에서 생겼어요")
  await page.getByTestId('reader-close').click()
  await expect(page.getByTestId('house-2026-10-27')).toHaveAttribute('data-building', 'bookstore')
  await page.getByTestId('house-2026-10-25').click()
  await expect(page.getByTestId('reader-building')).toBeHidden()

  // 보통 집을 지으면 알림이 없다
  await page.getByTestId('reader-close').click()
  await page.getByTestId('write-yesterday').click()
  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('일찍 잤다')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('house-2026-10-26')).toHaveAttribute('data-building', 'house')
  await expect(page.getByTestId('build-note')).toBeHidden()
})

test('저장이 깨져 있으면 덮어쓰지 않고 쓰기를 막는다', async ({ page }) => {
  await page.goto('./')
  await page.evaluate((k) => localStorage.setItem(k, '{broken'), KEY)
  await page.reload()
  await expect(page.getByTestId('storage-warning')).toBeVisible()
  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('안녕')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('write-msg')).toHaveText('지금은 쓸 수 없어요')
  // 백업을 가져와 덮어쓰지도 못한다
  await page.getByTestId('settings-open').click()
  await expect(page.getByTestId('backup-import')).toBeDisabled()
  await expect(page.getByTestId('backup-export')).toBeDisabled()
  await expect(page.getByTestId('name-input')).toBeDisabled()
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('{broken')
})

test('설정 창에서 백업을 내려받고, 다른 폰에서 가져오면 마을이 다시 지어진다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [3, 10, 20])
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  const gear = page.getByTestId('settings-open')
  const box = (await gear.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: 'test-results/screens/settings-gear.png' })

  await gear.click()
  await expect(page.getByTestId('settings')).toBeVisible()
  await page.waitForTimeout(400) // 창이 올라오는 연출이 끝나면 찍는다
  await page.screenshot({ path: 'test-results/screens/settings.png' })
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export').click()])
  expect(download.suggestedFilename()).toBe('diary-village-2026-10-27.json')
  const file = readFileSync(await download.path(), 'utf8')
  expect(JSON.parse(file).entries).toEqual(entries)
  await expect(page.getByTestId('settings-msg')).toHaveText('📦 백업 파일을 내려받았어요')
  await page.getByTestId('settings-close').click()
  await expect(page.getByTestId('settings')).toBeHidden()

  // 새 폰: 오늘 하나만 쓴 상태에서 가져온다
  const today = { date: '2026-10-27', text: '새 폰의 첫 줄', mood: 'great', writtenAt: Date.parse('2026-10-27T20:00:00+09:00') }
  const backup = JSON.stringify({ version: 1, entries: [...entries, { ...today, text: '백업의 같은 날' }] })
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries: [today] })])
  await page.reload()
  await expect(page.getByTestId('house-count')).toHaveText('🏠 1채')
  await page.getByTestId('settings-open').click()

  // 형식이 틀린 파일은 거절한다
  await page.getByTestId('backup-file').setInputFiles({ name: 'note.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') })
  await expect(page.getByTestId('settings-msg')).toHaveText('한 줄 마을 백업 파일이 아니에요. 다른 파일을 골라 주세요')
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/screens/settings-bad-file.png' })

  await page.getByTestId('backup-file').setInputFiles({ name: 'diary-village-2026-10-27.json', mimeType: 'application/json', buffer: Buffer.from(backup) })
  await expect(page.getByTestId('import-summary')).toHaveText('백업에 4일의 한 줄이 있어요. 그중 3일을 마을에 더해요. 이미 쓴 1일은 지금 글을 그대로 둬요.')
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/screens/settings-import-confirm.png' })
  // 그만두면 아무것도 바뀌지 않는다
  await page.getByTestId('import-cancel').click()
  await expect(page.getByTestId('house-count')).toHaveText('🏠 1채')

  await page.getByTestId('backup-file').setInputFiles({ name: 'diary-village-2026-10-27.json', mimeType: 'application/json', buffer: Buffer.from(backup) })
  await page.getByTestId('import-ok').click()
  await expect(page.getByTestId('settings-msg')).toHaveText('🏠 3일의 집을 다시 지었어요')
  await expect(page.getByTestId('house-count')).toHaveText('🏠 4채')
  await page.screenshot({ path: 'test-results/screens/settings-imported.png' })
  await page.getByTestId('settings-close').click()
  await expect(page.getByTestId('house-2026-10-03')).toBeAttached()
  await expect(page.getByTestId('today-line')).toContainText('새 폰의 첫 줄')

  await page.reload()
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(saved.entries.map((e: { date: string }) => e.date)).toEqual(['2026-10-03', '2026-10-10', '2026-10-20', '2026-10-27'])
  expect(saved.entries[3].text).toBe('새 폰의 첫 줄')
})

test('한 번 연 뒤에는 인터넷 없이도 열리고, 쓴 한 줄이 남는다', async ({ page, context }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  // 서비스워커가 앱 파일을 모두 담고 이 화면을 맡을 때까지 기다린다
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }))
    }
  })
  const cached = await page.evaluate(async () => {
    const urls: string[] = []
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname)
    }
    return urls
  })
  expect(cached).toContain('/diary_village/index.html')
  expect(cached).toContain('/diary_village/manifest.webmanifest')
  expect(cached.some((u) => /\/assets\/index-.*\.js$/.test(u))).toBe(true)
  expect(cached.some((u) => /\/assets\/index-.*\.css$/.test(u))).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('today-date')).toHaveText('10월 27일 화요일')
  await expect(page.getByTestId('today-spot')).toBeVisible()
  await page.getByTestId('write-input').fill('지하철에서 인터넷이 끊겼다')
  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('house-2026-10-27')).toBeVisible()
  await page.clock.runFor(4000)
  await page.screenshot({ path: 'test-results/screens/offline.png' })

  // 인터넷 없이 다시 열어도 그대로다
  await page.reload()
  await expect(page.getByTestId('house-2026-10-27')).toBeVisible()
  await expect(page.getByTestId('house-count')).toHaveText('🏠 1채')
  await context.setOffline(false)
})

/** start 부터 n일을 이어서 쓴 기록 */
function dayEntries(start: string, n: number) {
  const t0 = Date.parse(`${start}T22:00:00+09:00`)
  return Array.from({ length: n }, (_, i) => {
    const date = new Date(t0 + i * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
    return { date, text: `${date}의 한 줄`, mood: moods[i % moods.length], writtenAt: t0 + i * 86400000 }
  })
}

/** 끝이 있는 CSS 연출(쑥 올라옴·카드 등장)을 끝까지 돌려 둔다(가짜 시계를 따르지 않으므로) */
async function finishAnimations(page: import('@playwright/test').Page) {
  await page.evaluate(() => document.getAnimations().forEach((a) => a.effect?.getComputedTiming().endTime !== Infinity && a.finish()))
}

/** 멀리 본 뒤 광장 쪽으로 휠을 굴려 가까이 간다 */
async function zoomToPlaza(page: import('@playwright/test').Page, steps = 4) {
  const svg = (await page.getByTestId('village').boundingBox())!
  await page.mouse.move(svg.x + svg.width / 2, svg.y + svg.height / 2)
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 300)
  const plaza = (await page.getByTestId('plaza').boundingBox())!
  await page.mouse.move(plaza.x + plaza.width / 2, plaza.y + plaza.height / 2)
  for (let i = 0; i < steps; i++) await page.mouse.wheel(0, -200)
}

test('7일째 한 줄을 쓰면 광장에 우물이 생기고 축하 카드가 뜬다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  // 띄엄띄엄 6일(연속이 아니어도 된다)
  const entries = monthEntries('2026-10', [2, 5, 9, 14, 20, 26])
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await expect(page.getByTestId('plaza')).toBeAttached()
  await expect(page.getByTestId('next-landmark')).toHaveText('1일 더 쓰면우물이 생겨요')
  await expect(page.locator('.landmark')).toHaveCount(0)
  await zoomToPlaza(page)
  await page.screenshot({ path: 'test-results/screens/plaza-sign.png' })

  await page.getByTestId('mood-great').click()
  await page.getByTestId('write-input').fill('일주일째 한 줄')
  await page.getByTestId('write-submit').click()
  // 짓는 연출이 끝난 뒤에 축하 카드가 뜬다
  await expect(page.getByTestId('celebrate')).toBeHidden()
  await page.clock.runFor(4000)
  await expect(page.getByTestId('celebrate')).toBeVisible()
  await expect(page.getByTestId('celebrate-title')).toHaveText('🪣 우물이 생겼어요!')
  await expect(page.getByTestId('celebrate-body')).toHaveText('한 줄을 7일 남겼어요. 광장에 우물이 섰어요.')
  await expect(page.getByTestId('celebrate-next')).toHaveText('다음은 7일 더 쓰면 꽃 정원이에요')
  for (const id of ['celebrate-close', 'celebrate-visit']) expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/celebrate.png' })

  // 보러 가면 광장의 우물이 가운데 온다
  await page.getByTestId('celebrate-visit').click()
  await expect(page.getByTestId('celebrate')).toBeHidden()
  await page.clock.runFor(1500)
  const well = page.getByTestId('landmark-well')
  const box = (await well.boundingBox())!
  const svg = (await page.getByTestId('village').boundingBox())!
  expect(Math.abs(box.x + box.width / 2 - (svg.x + svg.width / 2))).toBeLessThan(40)
  await expect(page.getByTestId('next-landmark')).toHaveText('7일 더 쓰면꽃 정원이 생겨요')
  await page.waitForTimeout(1700) // 우물이 쑥 올라오는 연출(실제 시간)이 끝나면 찍는다
  await page.screenshot({ path: 'test-results/screens/plaza-well.png' })

  // 우물을 누르면 언제 생겼는지 알려 준다
  await well.click()
  await expect(page.getByTestId('build-note')).toHaveText('🪣 우물 · 한 줄을 7일 남겨 생겼어요')

  // 다시 열어도 그대로이고, 축하 카드는 다시 뜨지 않는다
  await page.reload()
  await expect(page.getByTestId('landmark-well')).toBeAttached()
  await expect(page.getByTestId('celebrate')).toBeHidden()
})

test('10일째 한 줄을 쓰면 작은 동네가 마을로 자라고, 머리줄 단계가 바뀐다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  await expect(page.getByTestId('village-stage')).toHaveText('🏡 작은 동네')
  // 띄엄띄엄 9일(우물은 이미 생겼다)
  const entries = monthEntries('2026-10', [1, 3, 6, 9, 12, 15, 19, 22, 25])
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await expect(page.getByTestId('village-stage')).toHaveText('🏡 작은 동네')
  await expect(page.getByTestId('celebrate')).toBeHidden()

  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('열흘째 한 줄')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('village-stage')).toHaveText('🏘️ 마을')
  await page.clock.runFor(4000)
  await expect(page.getByTestId('celebrate')).toBeVisible()
  await expect(page.getByTestId('celebrate-title')).toHaveText('🏘️ 마을이 되었어요!')
  await expect(page.getByTestId('celebrate-body')).toHaveText('한 줄을 10일 남겼어요. 작은 동네가 마을로 자랐어요.')
  await expect(page.getByTestId('celebrate-next')).toHaveText('다음은 20일 더 쓰면 큰 마을이 돼요')
  // 단계만 오르면 보러 갈 명소가 없어 버튼은 하나
  await expect(page.getByTestId('celebrate-visit')).toHaveCount(0)
  await expect(page.getByTestId('celebrate-close')).toHaveText('좋아요')
  expect((await page.getByTestId('celebrate-close').boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/stage-up.png' })
  await page.getByTestId('celebrate-close').click()
  await expect(page.getByTestId('celebrate')).toBeHidden()

  // 머리줄: 이름·단계·집 수·설정이 한 줄에 겹치지 않는다
  const boxes = await Promise.all(['village-name', 'village-stage', 'house-count', 'settings-open'].map(async (id) => (await page.getByTestId(id).boundingBox())!))
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width - 1)
  expect(boxes[3].x + boxes[3].width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'test-results/screens/stage-header.png' })

  // 다시 열어도 단계는 그대로이고 카드는 다시 뜨지 않는다
  await page.reload()
  await expect(page.getByTestId('village-stage')).toHaveText('🏘️ 마을')
  await expect(page.getByTestId('celebrate')).toBeHidden()
})

test('설정 창에서 마을 이름을 짓고, 다시 열어도 머리줄에 그 이름이 남는다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  const entries = dayEntries('2026-07-01', 120)
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await expect(page.getByTestId('village-name')).toHaveText('한 줄 마을')

  await page.getByTestId('settings-open').click()
  const input = page.getByTestId('name-input')
  const save = page.getByTestId('name-save')
  await expect(input).toHaveValue('')
  await expect(save).toBeDisabled()
  for (const el of [input, save]) expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await input.fill('햇살 언덕 마을')
  await expect(save).toBeEnabled()
  await save.click()
  await expect(page.getByTestId('name-msg')).toHaveText('🏡 마을에 새 이름을 지었어요')
  await expect(save).toBeDisabled()
  await expect(page.getByTestId('village-name')).toHaveText('햇살 언덕 마을')
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/screens/settings-name.png' })

  // 백업 파일에도 이름이 담긴다
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export').click()])
  expect(JSON.parse(readFileSync(await download.path(), 'utf8')).villageName).toBe('햇살 언덕 마을')
  await page.getByTestId('settings-close').click()

  // 가장 긴 이름과 긴 단계 이름표도 머리줄 한 줄에 겹치지 않는다
  const boxes = await Promise.all(['village-name', 'village-stage', 'house-count', 'settings-open'].map(async (id) => (await page.getByTestId(id).boundingBox())!))
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width - 1)
  expect(boxes[3].x + boxes[3].width).toBeLessThanOrEqual(390)
  expect(boxes[0].height).toBeLessThan(30)
  await page.screenshot({ path: 'test-results/screens/name-header.png' })

  // 다시 열어도 이름과 글이 그대로
  await page.reload()
  await expect(page.getByTestId('village-name')).toHaveText('햇살 언덕 마을')
  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(stored.entries).toEqual(entries)
  expect(stored.villageName).toBe('햇살 언덕 마을')

  // 비우면 처음 이름으로 돌아간다
  await page.getByTestId('settings-open').click()
  await expect(page.getByTestId('name-input')).toHaveValue('햇살 언덕 마을')
  await page.getByTestId('name-input').fill('  ')
  await page.getByTestId('name-input').press('Enter')
  await expect(page.getByTestId('name-msg')).toHaveText('🏡 처음 이름으로 돌아왔어요')
  await expect(page.getByTestId('village-name')).toHaveText('한 줄 마을')
  expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!).villageName).toBeUndefined()
})

test('365일을 쓴 마을에는 명소 7곳이 모두 서고, 가져오기로 한꺼번에 넘으면 함께 축하한다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const entries = dayEntries('2025-10-27', 365)
  await page.getByTestId('settings-open').click()
  await page.getByTestId('backup-file').setInputFiles({ name: 'diary-village.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, entries })) })
  await page.getByTestId('import-ok').click()
  await expect(page.getByTestId('celebrate')).toBeVisible()
  // 마을 단계도 끝까지 올라 한 카드에 함께 축하한다
  await expect(page.getByTestId('celebrate-title')).toHaveText('✨ 동화 나라가 되었어요!')
  await expect(page.getByTestId('celebrate-body')).toHaveText('한 줄을 365일 남겼어요. 작은 동네가 동화 나라로 자랐어요. 광장에 우물, 꽃 정원, 분수, 다리, 시계탑, 풍차, 무지개 큰 나무가 섰어요.')
  await expect(page.getByTestId('village-stage')).toHaveText('✨ 동화 나라')
  await expect(page.getByTestId('celebrate-next')).toHaveText('명소를 모두 모았어요. 고마워요!')
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/celebrate-many.png' })
  await page.getByTestId('celebrate-close').click()
  await page.getByTestId('settings-close').click()

  for (const id of ['well', 'garden', 'fountain', 'bridge', 'clockTower', 'windmill', 'bigTree']) await expect(page.getByTestId(`landmark-${id}`)).toBeAttached()
  await expect(page.getByTestId('next-landmark')).toHaveCount(0)
  await zoomToPlaza(page, 3)
  await page.evaluate(() => document.getAnimations().forEach((a) => ((a.currentTime = 0), a.pause())))
  await page.screenshot({ path: 'test-results/screens/plaza-all.png' })
})

test('쓴 날이 쌓이면 둥근 주민이 늘어 길을 걷고, 누르면 한마디 한다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  await expect(page.getByTestId('today-spot')).toBeVisible()
  await expect(page.locator('.resident')).toHaveCount(0)

  // 첫 한 줄을 쓰면 첫 주민이 온다. 오늘은 오늘의 손님으로 새 집 앞에 서 있다(걷는 길에는 없다)
  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('라떼 한 잔 마신 날')
  await page.getByTestId('write-submit').click()
  await expect(page.locator('.guest')).toHaveCount(1)
  await expect(page.locator('.resident')).toHaveCount(0)
  await page.clock.runFor(4000)
  await finishAnimations(page)
  const kong = page.getByTestId('guest-kong')
  await expect(kong).toBeInViewport()
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/resident-first.png' })

  // 누르면 짧은 한마디. 다시 누르면 다른 말
  await kong.click({ force: true })
  await expect(page.getByTestId('build-note')).toHaveText('콩이: “오늘 생긴 카페에 커피 마시러 왔어요.”')
  const box = (await page.getByTestId('build-note').boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'test-results/screens/resident-talk.png' })
  await kong.click({ force: true })
  await expect(page.getByTestId('build-note')).not.toHaveText('콩이: “오늘 생긴 카페에 커피 마시러 왔어요.”')
  await expect(page.getByTestId('build-note')).toContainText('콩이: “')

  // 40일을 쓴 마을에는 주민 10명. 둘은 오늘 집 손님이고 여덟이 오늘 구역 길과 광장을 걷는다
  const entries = dayEntries('2026-09-18', 40)
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await expect(page.locator('.resident')).toHaveCount(8)
  await expect(page.locator('.guest')).toHaveCount(2)
  await finishAnimations(page)
  // 걷는 중이다
  const walking = await page.evaluate(() => document.getAnimations().some((a) => (a as CSSAnimation).animationName === 'stroll' && a.playState === 'running'))
  expect(walking).toBe(true)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/residents-town.png' })
  await zoomToPlaza(page, 3)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/residents-plaza.png' })

  // 다시 열어도 주민은 그대로(마을은 기록에서 계산한다)
  await page.reload()
  await expect(page.locator('.resident')).toHaveCount(8)
  await expect(page.locator('.guest')).toHaveCount(2)
})

test('오늘의 손님: 쓰기 전엔 한 명이 오늘 자리 앞에서 기다리고, 쓰면 둘이 놀이 소품을 들고 오늘 집 앞에 온다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T13:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [3, 6, 9, 12, 15])
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()

  // 주민 셋 중 한 명이 오늘 자리 앞에서 기다린다(소품 없음, 재촉하지 않는 말)
  const guests = page.locator('.guest')
  await expect(guests).toHaveCount(1)
  await expect(guests).toHaveClass(/waiting/)
  await expect(page.locator('.resident')).toHaveCount(2)
  await expect(page.locator('.guest .prop')).toHaveCount(0)
  const waiter = guests.first()
  await expect(waiter.locator('.wait-bubble')).toBeVisible()
  await expect(waiter).toBeInViewport()
  await finishAnimations(page)
  const hit = (await waiter.locator('.hit').boundingBox())!
  expect(Math.min(hit.width, hit.height)).toBeGreaterThanOrEqual(44)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/guest-waiting.png' })
  await page.screenshot({ path: 'test-results/screens/guest-waiting-close.png', clip: { x: hit.x - 40, y: hit.y - 40, width: hit.width + 80, height: hit.height + 60 } })
  await waiter.click({ force: true })
  await expect(page.getByTestId('build-note')).toContainText('“오늘 자리에서 기다리고 있어요.”')
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))

  // 빵집을 지으면 손님 둘이 빵 바구니를 들고 오늘 집 앞에 온다
  await page.getByTestId('mood-great').click()
  await page.getByTestId('write-input').fill('갓 구운 빵 냄새가 좋았다')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('house-2026-10-20')).toHaveAttribute('data-building', 'bakery')
  await expect(guests).toHaveCount(2)
  await expect(page.locator('.guest.waiting')).toHaveCount(0)
  await expect(page.locator('.guest [data-testid="prop-bakery"]')).toHaveCount(2)
  await expect(page.locator('.resident')).toHaveCount(1)
  // 같은 주민이 두 군데 보이지 않는다
  const ids = await page.locator('[data-guest], [data-resident]').evaluateAll((list) => list.map((n) => n.getAttribute('data-guest') ?? n.getAttribute('data-resident')))
  expect(new Set(ids).size).toBe(3)
  await page.clock.runFor(4000)
  await finishAnimations(page)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/guest-visit.png' })
  const house = (await page.getByTestId('house-2026-10-20').boundingBox())!
  await page.screenshot({ path: 'test-results/screens/guest-visit-close.png', clip: { x: house.x - 40, y: house.y - 10, width: house.width + 80, height: house.height + 40 } })

  // 누르면 손님 한마디(글은 옮기지 않는다)
  const first = guests.first()
  const name = await first.getAttribute('data-guest')
  await first.click({ force: true })
  const note = page.getByTestId('build-note')
  await expect(note).toContainText('“오늘 생긴 빵집에 빵 사러 왔어요.”')
  await expect(note).not.toContainText('냄새')
  await page.screenshot({ path: 'test-results/screens/guest-talk.png' })
  expect(name).toBeTruthy()

  // 집 누르기는 그대로이고, 읽는 동안 손님은 옅어지지 않는다
  await page.getByTestId('house-2026-10-20').click()
  await expect(page.getByTestId('reader-text')).toHaveText('갓 구운 빵 냄새가 좋았다')
  await expect(page.locator('.guest.veiled')).toHaveCount(0)
  await page.getByTestId('reader-close').click()

  // 다시 열어도 같은 손님(날짜·주민으로 정하고 저장하지 않는다)
  await page.reload()
  await expect(page.locator(`[data-guest="${name}"]`)).toHaveCount(1)
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(Object.keys(saved).some((k) => /guest/i.test(k))).toBe(false)
})

test('밤에도 오늘의 손님이 오늘 집 앞에 보인다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T21:30:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [3, 6, 9, 12, 15, 20])
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await expect(page.locator('.guest')).toHaveCount(2)
  await expect(page.locator('.guest [data-testid="prop-house"]')).toHaveCount(2)
  await expect(page.locator('.guest').first()).toBeInViewport()
  await finishAnimations(page)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/guest-night.png' })
})

test('오늘의 손님: 짓는 연출 뒤 통통 뛰어 오고, 고치면 놀이 소품이 바뀌고, 지우면 다시 기다린다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T13:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [3, 6, 9, 12, 15])
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  // 처음 열 때 기다리는 손님은 뛰어 오지 않는다
  await expect(page.locator('.guest.waiting')).toHaveCount(1)
  await expect(page.locator('.guest.arrive')).toHaveCount(0)

  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('갓 구운 빵 냄새가 좋았다')
  await page.getByTestId('write-submit').click()
  const guests = page.locator('.guest')
  await expect(guests).toHaveCount(2)
  await expect(page.locator('.guest.arrive')).toHaveCount(2)
  // 짓는 연출 뒤에 시작해 바깥 길에서 오는 길이다
  const come = await page.evaluate(() =>
    document.getAnimations().filter((a) => (a as CSSAnimation).animationName === 'guest-come').map((a) => Number(a.effect!.getComputedTiming().delay)),
  )
  expect(come).toHaveLength(2)
  for (const d of come) expect(d).toBeGreaterThanOrEqual(800 + 700)
  // 오는 중간 모습
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      a.pause()
      if ((a as CSSAnimation).animationName === 'guest-come') a.currentTime = Number(a.effect!.getComputedTiming().delay) + 450
      else a.currentTime = 2400
    }
  })
  const house = (await page.getByTestId('house-2026-10-20').boundingBox())!
  const mid = (await guests.first().locator('.hit').boundingBox())!
  await page.screenshot({ path: 'test-results/screens/guest-arrive.png', clip: { x: house.x - 70, y: house.y - 10, width: house.width + 140, height: house.height + 70 } })
  await finishAnimations(page)
  const end = (await guests.first().locator('.hit').boundingBox())!
  expect(Math.hypot(mid.x - end.x, mid.y - end.y)).toBeGreaterThan(3)
  await expect(page.locator('.guest [data-testid="prop-bakery"]')).toHaveCount(2)

  // 고치기로 책방이 되면 손님 소품도 책으로 바뀐다(다시 뛰어 오지는 않는다)
  await page.getByTestId('house-2026-10-20').click()
  await page.getByTestId('reader-edit').click()
  await page.getByTestId('edit-input').fill('퇴근길에 책 한 권')
  await page.getByTestId('edit-save').click()
  await expect(page.getByTestId('house-2026-10-20')).toHaveAttribute('data-building', 'bookstore')
  await expect(page.locator('.guest [data-testid="prop-bookstore"]')).toHaveCount(2)
  await expect(page.locator('.guest [data-testid="prop-bakery"]')).toHaveCount(0)
  await expect(page.locator('.guest.arrive')).toHaveCount(0)
  await page.getByTestId('reader-close').click()
  await finishAnimations(page)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  const box = (await page.getByTestId('house-2026-10-20').boundingBox())!
  await page.screenshot({ path: 'test-results/screens/guest-edited.png', clip: { x: box.x - 40, y: box.y - 10, width: box.width + 80, height: box.height + 40 } })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))

  // 지우면 오늘 자리로 돌아가 한 명이 다시 기다린다
  await page.getByTestId('house-2026-10-20').click()
  await page.getByTestId('reader-erase').click()
  await page.getByTestId('erase-confirm').click()
  await expect(page.getByTestId('house-2026-10-20')).toHaveCount(0)
  await expect(guests).toHaveCount(1)
  await expect(page.locator('.guest.waiting')).toHaveCount(1)
  await expect(page.locator('.guest .prop')).toHaveCount(0)
})

test('움직임 줄이기면 오늘의 손님이 뛰어 오지 않고 바로 그 자리에 있다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: new Date('2026-10-20T13:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [3, 6, 9, 12, 15])
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('갓 구운 빵 냄새가 좋았다')
  await page.getByTestId('write-submit').click()
  await expect(page.locator('.guest')).toHaveCount(2)
  const running = await page.evaluate(() => document.getAnimations().some((a) => (a as CSSAnimation).animationName === 'guest-come'))
  expect(running).toBe(false)
  await expect(page.locator('.guest').first()).toBeVisible()
})

test('오늘 기분에 따라 마을 하늘에 해·구름·비·별이 뜨고, 누르기를 막지 않는다', async ({ page }) => {
  // 낮 하늘(저녁·밤은 아래 테스트)
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  // 오늘 자리가 비었으면 구름 조금 낀 하늘
  await expect(page.getByTestId('sky').locator('.sun')).toHaveCount(1)
  await expect(page.getByTestId('sky').locator('.cloud')).toHaveCount(3)
  await expect(page.getByTestId('rain').locator('.drop')).toHaveCount(0)

  const today = (mood: string, text = '오늘의 한 줄') =>
    JSON.stringify({ version: 1, entries: [{ date: '2026-10-27', text, mood, writtenAt: Date.parse('2026-10-27T12:00:00+09:00') }] })
  const shots: [string, string][] = [['great', 'sunny'], ['meh', 'cloudy'], ['blue', 'rain'], ['tired', 'starry']]
  for (const [mood, name] of shots) {
    await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, today(mood)])
    await page.reload()
    await expect(page.getByTestId('house-2026-10-27')).toBeVisible()
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
    await page.screenshot({ path: `test-results/screens/weather-${name}.png` })
  }

  // 비 오는 날: 빗방울이 마을 앞으로 떨어진다
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, today('blue', '비 오는 날')])
  await page.reload()
  await expect(page.getByTestId('weather')).toHaveText('🌧️ 오늘은 비')
  expect(await page.getByTestId('rain').locator('.drop').count()).toBeGreaterThanOrEqual(20)
  await expect(page.getByTestId('sky').locator('.sun')).toHaveCount(0)
  const falling = await page.evaluate(() => document.getAnimations().some((a) => (a as CSSAnimation).animationName === 'fall' && a.playState === 'running'))
  expect(falling).toBe(true)
  // 빗방울 너머의 집도 그대로 눌린다
  await page.getByTestId('house-2026-10-27').click()
  await expect(page.getByTestId('reader-text')).toHaveText('비 오는 날')
  await page.getByTestId('reader-close').click()

  // 별밤: 달과 별. 날씨 이름표와 하늘 그림이 겹치지 않는다
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, today('tired')])
  await page.reload()
  await expect(page.getByTestId('sky').locator('.moon')).toHaveCount(1)
  const chip = (await page.getByTestId('weather').boundingBox())!
  for (const b of await page.getByTestId('sky').locator('.sky-bit').all()) {
    const r = (await b.boundingBox())!
    const overlap = r.x < chip.x + chip.width && r.x + r.width > chip.x && r.y < chip.y + chip.height && r.y + r.height > chip.y
    expect(overlap).toBe(false)
  }
})

const SEASON_SKIES: [string, string, string][] = [
  ['2027-04-12T13:00:00+09:00', 'petal', 'spring'],
  ['2027-07-20T21:00:00+09:00', 'firefly', 'summer'],
  ['2026-10-27T13:00:00+09:00', 'leaf', 'autumn'],
  ['2026-12-20T13:00:00+09:00', 'snow', 'winter'],
]
for (const [time, kind, name] of SEASON_SKIES) {
  test(`${name}: 하늘에 계절 흩날림(${kind})이 보이고, 누르기를 막지 않는다`, async ({ page }) => {
    const date = time.slice(0, 10)
    await page.clock.install({ time: new Date(time) })
    const entries = [{ date, text: `${name}의 한 줄`, mood: 'calm', writtenAt: Date.parse(time) }]
    await page.addInitScript(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
    await page.goto('./')
    const drift = page.getByTestId('rain').locator('.drift')
    expect(await drift.count()).toBeGreaterThanOrEqual(8)
    expect(await page.getByTestId('rain').locator(`.drift.${kind}`).count()).toBe(await drift.count())
    if (kind !== 'firefly') {
      const falling = await page.evaluate(() => document.getAnimations().some((a) => (a as CSSAnimation).animationName === 'drift-fall' && a.playState === 'running'))
      expect(falling).toBe(true)
    }
    // 흩날리는 것 너머의 집도 그대로 눌린다
    await page.getByTestId(`house-${date}`).click()
    await expect(page.getByTestId('reader-text')).toHaveText(`${name}의 한 줄`)
    await page.getByTestId('reader-close').click()
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
    await page.screenshot({ path: `test-results/screens/season-${name}.png` })
  })
}

const ISLAND_SEASONS: [string, string[], string][] = [
  ['2027-04-12T13:00:00+09:00', ['2027-02', '2027-03', '2027-04'], 'spring'],
  ['2026-12-20T13:00:00+09:00', ['2026-10', '2026-11', '2026-12'], 'winter'],
]
for (const [time, months, name] of ISLAND_SEASONS) {
  test(`${name}: 섬 가장자리에 흙 옆면·풀숲이 보이고, 누르기를 막지 않는다`, async ({ page }) => {
    const date = time.slice(0, 10)
    await page.clock.install({ time: new Date(time) })
    const entries = [...months.flatMap((m) => monthEntries(m, [3, 8, 10])), { date, text: `${name}의 섬`, mood: 'calm', writtenAt: Date.parse(time) }]
    await page.addInitScript(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
    await page.goto('./')
    // 구역 셋과 광장 모두 바깥으로 드러난 쪽이 있다
    for (const key of [...months, 'plaza']) {
      const edge = page.getByTestId(`edge-${key}`)
      await expect(edge).toHaveAttribute('pointer-events', 'none')
      expect(await edge.locator('*').count()).toBeGreaterThan(0)
    }
    // 가장자리 장식이 있어도 집과 오늘 쓴 집이 그대로 눌린다
    await page.getByTestId(`house-${date}`).click()
    await expect(page.getByTestId('reader-text')).toHaveText(`${name}의 섬`)
    await page.getByTestId('reader-close').click()
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
    await page.screenshot({ path: `test-results/screens/island-${name}.png` })
    // 멀리서 본 섬 전체
    const svg = (await page.getByTestId('village').boundingBox())!
    await page.mouse.move(svg.x + svg.width / 2, svg.y + svg.height / 2)
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 300)
    await page.screenshot({ path: `test-results/screens/island-${name}-far.png` })
  })
}

const FAR_VIEWS: [string, string[], string][] = [
  ['2027-04-12T13:00:00+09:00', ['2027-02', '2027-03', '2027-04'], 'day'],
  ['2026-12-20T21:30:00+09:00', ['2026-10', '2026-11', '2026-12'], 'night'],
  ['2026-10-27T13:00:00+09:00', [], 'first'],
]
for (const [time, months, name] of FAR_VIEWS) {
  test(`${name}: 섬 아래·뒤로 먼 산과 구름 바다가 깔리고, 끌어도 끝이 드러나지 않으며 누르기를 막지 않는다`, async ({ page }) => {
    const date = time.slice(0, 10)
    await page.clock.install({ time: new Date(time) })
    const entries = [...months.flatMap((m) => monthEntries(m, [3, 8, 10])), { date, text: `${name}의 먼 바다`, mood: 'calm', writtenAt: Date.parse(time) }]
    await page.addInitScript(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
    await page.goto('./')
    const far = page.getByTestId('far')
    await expect(far).toHaveAttribute('data-part', name === 'night' ? 'night' : 'day')
    await expect(far).toHaveCSS('pointer-events', 'none')
    expect(await far.locator('.far-hills path').count()).toBeGreaterThanOrEqual(6)
    await expect(far.locator('.far-puffs')).toHaveCount(2)
    if (name === 'night') expect(await far.locator('[clip-path]').count()).toBeGreaterThan(0)
    // 구름 바다는 화면 아래 끝까지, 양옆 끝까지 덮는다
    const scene = (await page.getByTestId('scene').boundingBox())!
    const sea = (await far.locator('.far-sea').boundingBox())!
    expect(sea.x).toBeLessThanOrEqual(scene.x + 1)
    expect(sea.x + sea.width).toBeGreaterThanOrEqual(scene.x + scene.width - 1)
    expect(sea.y + sea.height).toBeGreaterThanOrEqual(scene.y + scene.height - 1)
    const flowing = await page.evaluate(() => document.getAnimations().some((a) => (a as CSSAnimation).animationName === 'sea-flow'))
    expect(flowing).toBe(true)
    // 먼 바깥이 있어도 집이 그대로 눌린다
    await page.getByTestId(`house-${date}`).click()
    await expect(page.getByTestId('reader-text')).toHaveText(`${name}의 먼 바다`)
    await page.getByTestId('reader-close').click()
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
    await page.screenshot({ path: `test-results/screens/far-${name}.png` })
    // 멀리 보고 끌어 둘러봐도 먼 바깥은 화면에 붙어 있어 끝이 드러나지 않는다
    const svg = (await page.getByTestId('village').boundingBox())!
    await page.mouse.move(svg.x + svg.width / 2, svg.y + svg.height / 2)
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 300)
    await page.mouse.down()
    await page.mouse.move(svg.x + svg.width / 2 - 140, svg.y + svg.height / 2 - 160, { steps: 6 })
    await page.mouse.up()
    const after = (await far.locator('.far-sea').boundingBox())!
    expect(after).toEqual(sea)
    await page.screenshot({ path: `test-results/screens/far-${name}-far.png` })
  })
}

test('움직임 줄이기를 켜면 구름 바다가 흐르지 않는다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  await expect(page.getByTestId('far').locator('.far-puffs')).toHaveCount(2)
  const flowing = await page.evaluate(() => document.getAnimations().some((a) => (a as CSSAnimation).animationName === 'sea-flow'))
  expect(flowing).toBe(false)
})

test('여름 낮에는 반딧불이 없다', async ({ page }) => {
  await page.clock.install({ time: new Date('2027-07-20T13:00:00+09:00') })
  await page.goto('./')
  await expect(page.getByTestId('rain').locator('.drift')).toHaveCount(0)
})

test('움직임 줄이기를 켜면 계절 흩날림이 멈춰 제자리에 있고, 비 오는 날엔 반만 흩날린다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: new Date('2026-12-20T13:00:00+09:00') })
  await page.goto('./')
  const snow = page.getByTestId('rain').locator('.drift.snow')
  const clear = await snow.count()
  expect(clear).toBeGreaterThanOrEqual(8)
  const moving = await page.evaluate(() => document.getAnimations().some((a) => ['drift-fall', 'drift-sway'].includes((a as CSSAnimation).animationName)))
  expect(moving).toBe(false)
  // 멈춘 눈송이도 마을 화면 안에 퍼져 있다
  const scene = (await page.getByTestId('scene').boundingBox())!
  const ys = await Promise.all((await snow.all()).map(async (s) => (await s.boundingBox())!.y))
  expect(ys.filter((y) => y > scene.y + scene.height / 2).length).toBeGreaterThan(0)
  expect(ys.filter((y) => y < scene.y + scene.height / 2).length).toBeGreaterThan(0)

  const rainy = { version: 1, entries: [{ date: '2026-12-20', text: '비', mood: 'blue', writtenAt: Date.parse('2026-12-20T12:00:00+09:00') }] }
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify(rainy)])
  await page.reload()
  expect(await page.getByTestId('rain').locator('.drop').count()).toBeGreaterThanOrEqual(20)
  expect(await snow.count()).toBe(Math.ceil(clear / 2))
  await page.screenshot({ path: 'test-results/screens/season-winter-rain.png' })
})

test('지금 시각에 따라 낮·저녁·밤 하늘이 되고, 저녁·밤에는 창문에 불이 켜진다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  const entries = monthEntries('2026-10', [1, 3, 4, 6, 8, 9, 11, 13, 15, 16, 18, 20, 21, 23, 24, 26])
  entries.push({ date: '2026-10-27', text: '좋은 하루', mood: 'great', writtenAt: Date.parse('2026-10-27T12:00:00+09:00') })
  await page.addInitScript(([k, s]) => localStorage.getItem(k) || localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.goto('./')
  const scene = page.getByTestId('scene')
  const sky = page.getByTestId('sky')
  const win = page.locator('.house .win').first()
  const winFill = () => win.evaluate((n) => getComputedStyle(n).fill)
  const top = () => scene.evaluate((n) => n.style.getPropertyValue('--sky-top'))
  const shot = async (name: string) => {
    await page.waitForTimeout(700)
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
    await page.screenshot({ path: `test-results/screens/${name}.png` })
    await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
  }

  // 낮: 맑은 하늘에 해, 창문은 맑은 유리
  await expect(scene).toHaveAttribute('data-time', 'day')
  await expect(sky.locator('.sun')).toHaveCount(1)
  await expect(sky.locator('.sun.dusk')).toHaveCount(0)
  expect(await winFill()).toBe('rgb(220, 236, 238)')
  const noon = await top()
  await shot('time-day')

  // 켜 둔 채 저녁이 되면 노을 하늘에 낮은 해, 창문에 불
  await page.clock.fastForward('05:00:00')
  await expect(scene).toHaveAttribute('data-time', 'evening')
  await expect(sky.locator('.sun.dusk')).toHaveCount(1)
  await expect.poll(winFill).toBe('rgb(255, 213, 110)')
  const evening = await top()
  expect(evening).not.toBe(noon)
  await shot('time-evening')

  // 밤: 해 대신 달과 별, 창문 불빛은 그대로. 날씨 이름표는 오늘 기분 그대로다
  await page.clock.fastForward('03:00:00')
  await expect(scene).toHaveAttribute('data-time', 'night')
  await expect(sky.locator('.sun')).toHaveCount(0)
  await expect(sky.locator('.moon')).toHaveCount(1)
  expect(await sky.locator('.star').count()).toBeGreaterThanOrEqual(8)
  await expect.poll(winFill).toBe('rgb(255, 213, 110)')
  expect(await top()).not.toBe(evening)
  await expect(page.getByTestId('weather')).toHaveText('☀️ 오늘은 맑음')
  await shot('time-night')

  // 밤에도 집은 그대로 눌린다
  await page.getByTestId('house-2026-10-27').click()
  await expect(page.getByTestId('reader-text')).toHaveText('좋은 하루')
  await page.getByTestId('reader-close').click()

  // 다시 열어도 밤 하늘(시각으로 계산한다). 비 오는 밤엔 비가 그대로 내린다
  const rainy = { version: 1, entries: [{ date: '2026-10-27', text: '비', mood: 'blue', writtenAt: Date.parse('2026-10-27T21:00:00+09:00') }] }
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify(rainy)])
  await page.reload()
  await expect(scene).toHaveAttribute('data-time', 'night')
  expect(await page.getByTestId('rain').locator('.drop').count()).toBeGreaterThanOrEqual(20)
  await shot('time-night-rain')
})

test('가을·겨울 저녁·밤에는 굴뚝에서 연기가 천천히 피어오른다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', Array.from({ length: 26 }, (_, i) => i + 1))
  const saved = JSON.stringify({ version: 1, entries })
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, saved])
  await page.reload()
  const scene = page.getByTestId('scene')
  const smoke = page.locator('.smoke')
  // 굴뚝 있는 집마다 연기가 있지만 가을 낮에는 보이지 않는다
  const chimneys = await smoke.count()
  expect(chimneys).toBeGreaterThan(3)
  expect(chimneys).toBeLessThan(26)
  await expect(scene).not.toHaveClass(/smoky/)
  await expect(smoke.first()).toBeHidden()

  // 저녁이 되면 피어오른다. 연기 줌은 두세 개, 집마다 박자가 다르다
  await page.clock.fastForward('05:00:00')
  await expect(scene).toHaveAttribute('data-time', 'evening')
  await expect(scene).toHaveClass(/smoky/)
  await expect(smoke.first()).toBeVisible()
  const puffs = await smoke.evaluateAll((l) => l.map((g) => g.querySelectorAll('.puff').length))
  expect(puffs.every((n) => n >= 2 && n <= 3)).toBe(true)
  expect(new Set(await smoke.evaluateAll((l) => l.map((g) => (g as SVGElement).style.getPropertyValue('--d')))).size).toBeGreaterThan(2)
  const moving = await page.evaluate(() => document.getAnimations().filter((a) => (a as CSSAnimation).animationName === 'puff').length)
  expect(moving).toBeGreaterThanOrEqual(chimneys * 2)
  // 연기는 누르기를 가로막지 않는다
  expect(await smoke.first().evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none')
  const hit = await smoke.last().evaluate((g) => {
    const r = g.querySelector('.puff')!.getBoundingClientRect()
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.classList.contains('puff') ?? false
  })
  expect(hit).toBe(false)
  // 연기가 피는 저녁에도 집은 그대로 눌린다
  await page.getByTestId('house-2026-10-26').click()
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 26일의 한 줄')
  await page.getByTestId('reader-close').click()

  const shot = async (name: string) => {
    await page.waitForTimeout(700)
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
    await page.screenshot({ path: `test-results/screens/${name}.png` })
    await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
  }
  const box = (await page.getByTestId('village').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -200)
  await page.clock.fastForward('03:00:00')
  await expect(scene).toHaveAttribute('data-time', 'night')
  await expect(scene).toHaveClass(/smoky/)
  await shot('chimney-smoke-night')

  // 움직임 줄이기면 멈춘 옅은 연기
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => (a as CSSAnimation).animationName === 'puff').length)).toBe(0)
  const still = await page.locator('.smoke .puff').first().evaluate((e) => Number(getComputedStyle(e).opacity))
  expect(still).toBeGreaterThan(0.3)
  expect(still).toBeLessThan(1)
  await shot('chimney-smoke-still')
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(saved)
})

test('봄·여름 밤에는 굴뚝 연기가 없다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-04-20T21:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-04', Array.from({ length: 20 }, (_, i) => i + 1))
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await expect(page.getByTestId('scene')).toHaveAttribute('data-time', 'night')
  await expect(page.getByTestId('scene')).not.toHaveClass(/smoky/)
  expect(await page.locator('.smoke').count()).toBeGreaterThan(0)
  await expect(page.locator('.smoke').first()).toBeHidden()
})

test('보통 집마다 문 색·창 모양·꽃상자·현관·지붕 위 작은 것이 달라 보인다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  const days = Array.from({ length: 26 }, (_, i) => i + 1)
  const entries = monthEntries('2026-10', days)
  const saved = JSON.stringify({ version: 1, entries })
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, saved])
  await page.reload()
  await expect(page.getByTestId('house-count')).toHaveText('🏠 26채')
  const plain = page.locator('[data-building="house"]')
  const n = await plain.count()
  expect(n).toBe(26)
  // 보통 집마다 색 문이 하나, 창 모양은 세 가지가 모두 보인다
  await expect(page.locator('[data-building="house"] .house-door')).toHaveCount(n)
  const colors = new Set(await page.locator('.house-door').evaluateAll((l) => l.map((d) => d.getAttribute('data-color'))))
  expect(colors.size).toBeGreaterThanOrEqual(4)
  for (const shape of ['square', 'round', 'arch']) expect(await page.locator(`[data-building="house"] .win[data-shape="${shape}"]`).count()).toBeGreaterThan(0)
  for (const part of ['flower-box', 'porch-lamp', 'porch-step', 'roof-vane', 'roof-bird']) expect(await page.locator(`.${part}`).count()).toBeGreaterThan(0)
  // 이웃한 날 집은 손길이 똑같지 않다
  const touch = (d: string) => page.getByTestId(`house-2026-10-${d}`).getAttribute('data-touch')
  expect(await touch('11')).not.toBe(await touch('12'))
  // 집은 그대로 눌린다
  await page.getByTestId('house-2026-10-26').click()
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 26일의 한 줄')
  await page.getByTestId('reader-close').click()

  const shot = async (name: string) => {
    await page.waitForTimeout(700)
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
    await page.screenshot({ path: `test-results/screens/${name}.png` })
    await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
  }
  const box = (await page.getByTestId('village').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -200)
  await shot('house-touches-day')

  // 밤: 둥근·반달 창과 현관 등에도 불이 켜진다
  await page.clock.fastForward('08:00:00')
  await expect(page.getByTestId('scene')).toHaveAttribute('data-time', 'night')
  const lit = (sel: string) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).fill)
  await expect.poll(() => lit('.win[data-shape="round"]')).toBe('rgb(255, 213, 110)')
  await expect.poll(() => lit('.win[data-shape="arch"]')).toBe('rgb(255, 213, 110)')
  await expect.poll(() => lit('.porch-lamp .win')).toBe('rgb(255, 213, 110)')
  await shot('house-touches-night')
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(saved)
})

test('머리줄 단계 이름표를 누르면 마을 수첩이 열려 건물 도감과 명소를 모아 본다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  const entries = dayEntries('2026-10-10', 12)
  entries[0].text = '아침에 커피를 마셨다'
  entries[3].text = '라떼가 맛있었다'
  entries[5].text = '고양이가 창가에 앉아 있었다'
  entries[8].text = '바닷가를 걸었다'
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()

  const badge = page.getByTestId('village-stage')
  await expect(badge).toHaveText('🏘️ 마을')
  expect((await badge.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await badge.click()
  const book = page.getByTestId('book')
  await expect(book).toBeVisible()
  await expect(page.getByTestId('book-stage')).toContainText('마을 · 한 줄을 12일 남겼어요')
  await expect(page.getByTestId('book-stage')).toContainText('18일 더 쓰면 🌳 큰 마을')
  await expect(page.getByTestId('book-count')).toHaveText('3 / 16')
  await expect(page.getByTestId('book-cafe')).toHaveAttribute('data-found', 'true')
  await expect(page.getByTestId('book-cinema')).toHaveAttribute('data-found', 'false')
  await expect(page.getByTestId('book-cinema').locator('.book-name')).toHaveText('???')

  // 칸은 손가락으로 누르기 충분히 크다
  for (const id of ['book-cafe', 'book-well', 'book-close']) {
    const b = (await page.getByTestId(id).boundingBox())!
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(b.width).toBeGreaterThanOrEqual(44)
  }

  await page.getByTestId('book-cafe').click()
  await expect(page.getByTestId('book-detail')).toHaveText("☕ 카페 · 2채 · 10월 10일에 '커피'에서 처음 생겼어요")
  await page.getByTestId('book-cinema').click()
  await expect(page.getByTestId('book-detail')).toHaveText('❔ 큰 화면 앞에 앉은 날에 생겨요')
  await page.getByTestId('book-well').click()
  await expect(page.getByTestId('book-landmark-detail')).toHaveText('🪣 우물 · 한 줄을 7일 남겨 생겼어요')
  await page.getByTestId('book-garden').click()
  await expect(page.getByTestId('book-landmark-detail')).toHaveText('❔ 2일 더 쓰면 광장에 새 명소가 생겨요')
  // 꾸밈 소품: 12일이면 다섯 개가 열렸다
  await expect(page.getByTestId('book-decor-count')).toHaveText('5 / 12')
  await expect(page.getByTestId('book-decor-mailbox')).toHaveAttribute('data-found', 'true')
  await expect(page.getByTestId('book-decor-fence').locator('.book-name')).toHaveText('16일')
  for (const id of ['book-decor-pot', 'book-decor-tent']) {
    const b = (await page.getByTestId(id).boundingBox())!
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(b.width).toBeGreaterThanOrEqual(44)
  }
  await page.getByTestId('book-decor-bench').click()
  await expect(page.getByTestId('book-decor-detail')).toHaveText('🪑 벤치 · 한 줄을 4일 남겨 열렸어요')
  await page.getByTestId('book-decor-fence').click()
  await expect(page.getByTestId('book-decor-detail')).toHaveText('❔ 4일 더 쓰면 새 소품이 열려요')
  await page.waitForTimeout(400)
  await page.getByTestId('book-decors').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/screens/book-decor.png' })
  await page.getByTestId('book-stage').scrollIntoViewIfNeeded()
  // 수첩이 화면 안에 다 들어온다
  const sheet = (await book.boundingBox())!
  expect(sheet.y).toBeGreaterThanOrEqual(0)
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(845)
  await page.screenshot({ path: 'test-results/screens/book.png' })

  await page.getByTestId('book-close').click()
  await expect(book).toBeHidden()

  // 오늘 영화 이야기를 쓰면 도감에 영화관이 들어온다(저장은 기록뿐)
  await page.getByTestId('write-input').fill('친구랑 영화를 봤다')
  await page.getByTestId('mood-great').click()
  await page.getByTestId('write-submit').click()
  await page.clock.runFor(4000)
  await badge.click()
  await expect(page.getByTestId('book-count')).toHaveText('4 / 16')
  await expect(page.getByTestId('book-cinema').locator('.book-name')).toHaveText('영화관')
  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(Object.keys(stored).sort()).toEqual(['entries', 'version'])
})

test('빈 마을의 수첩은 모두 힌트 칸이다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  await page.getByTestId('village-stage').click()
  await expect(page.getByTestId('book-count')).toHaveText('0 / 16')
  await expect(page.getByTestId('book-stage')).toContainText('10일 더 쓰면 🏘️ 마을')
  await expect(page.locator('[data-testid="book"] [data-found="true"]')).toHaveCount(0)
  await expect(page.getByTestId('book-decorate')).toHaveCount(0) // 열린 소품이 없으면 꾸미기 버튼도 없다
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/screens/book-empty.png' })
})

test('놓아 둔 꾸밈 소품 12종이 광장과 구역 빈 땅에 그려지고, 다시 열어도 자리가 그대로다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  const entries = dayEntries('2026-07-19', 100) // 10월 26일까지 100일: 소품 12종이 모두 열렸다
  const decor = [
    { id: 'tent', at: 'plaza', col: 2, row: 0 },
    { id: 'roseArch', at: 'plaza', col: 4, row: 0 },
    { id: 'pot', at: 'plaza', col: 0, row: 1 },
    { id: 'lamp', at: 'plaza', col: 1, row: 1 },
    { id: 'bench', at: 'plaza', col: 2, row: 1 },
    { id: 'mailbox', at: 'plaza', col: 4, row: 1 },
    { id: 'birdhouse', at: 'plaza', col: 5, row: 1 },
    { id: 'sunflower', at: 'plaza', col: 6, row: 1 },
    { id: 'pond', at: 'plaza', col: 2, row: 4 },
    { id: 'flowerbed', at: 'plaza', col: 4, row: 4 },
    { id: 'bulbs', at: 'plaza', col: 6, row: 4 },
    { id: 'fence', at: 'plaza', col: 5, row: 5 },
    { id: 'pot', at: '2026-10', col: 1, row: 5 }, // 10월 구역 달력 밖 칸(같은 소품 두 번째)
    { id: 'bench', at: '2026-10', col: 6, row: 1 }, // 10월 10일: 집이 선 칸이라 그리지 않는다
  ]
  const save = { version: 1, entries, decor }
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify(save)])
  await page.reload()
  await expect(page.locator('.decor')).toHaveCount(13)
  for (const [i, d] of decor.slice(0, 13).entries()) await expect(page.getByTestId(`decor-${i}`)).toHaveAttribute('data-decor', d.id)
  await expect(page.getByTestId('decor-13')).toHaveCount(0)
  await finishAnimations(page)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/decor-block.png' })
  await zoomToPlaza(page, 6)
  // 광장이 화면 가운데에 오도록 오른쪽으로 끌어 둔다
  await page.mouse.move(150, 300)
  await page.mouse.down()
  await page.mouse.move(250, 300, { steps: 5 })
  await page.mouse.move(330, 250, { steps: 5 })
  await page.mouse.up()
  await page.evaluate(() => document.getAnimations().forEach((a) => ((a.currentTime = 0), a.pause())))
  await page.screenshot({ path: 'test-results/screens/decor-plaza.png' })

  // 그리지 않은 소품도 저장에서 지우지 않는다. 다시 열어도 그대로다
  await page.reload()
  await expect(page.locator('.decor')).toHaveCount(13)
  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(stored.decor).toEqual(decor)
})

test('쓴 날이 쌓여 꾸밈 소품이 열리면 지은 건물과 함께 알려 준다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  const entries = dayEntries('2026-10-24', 3)
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await page.getByTestId('village-stage').click()
  await expect(page.getByTestId('book-decor-count')).toHaveText('1 / 12')
  await expect(page.getByTestId('book-decor-bench').locator('.book-name')).toHaveText('4일')
  await page.getByTestId('book-close').click()

  // 넷째 날을 쓰면 카페와 함께 벤치가 열렸다고 두 줄로 알려 준다
  await page.getByTestId('mood-great').click()
  await page.getByTestId('write-input').fill('퇴근길 커피 한 잔')
  await page.getByTestId('write-submit').click()
  const note = page.getByTestId('build-note')
  await expect(note).toHaveText("☕ '커피'를 찾아 카페가 생겼어요\n🪑 꾸밈 소품 벤치가 열렸어요")
  await page.clock.runFor(1500)
  await finishAnimations(page)
  const box = (await note.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  expect(box.height).toBeGreaterThan(40) // 두 줄
  await page.screenshot({ path: 'test-results/screens/decor-note.png' })
  await page.clock.runFor(6000)
  await expect(note).toBeHidden()

  await page.getByTestId('village-stage').click()
  await expect(page.getByTestId('book-decor-count')).toHaveText('2 / 12')
  await expect(page.getByTestId('book-decor-bench').locator('.book-name')).toHaveText('벤치')
  // 소품은 기록에서 계산한다(저장은 기록뿐)
  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(Object.keys(stored).sort()).toEqual(['entries', 'version'])
})

/** 요소 상자의 가운데(화면 좌표) */
async function centerOf(loc: import('@playwright/test').Locator) {
  const b = (await loc.boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

test('마을 수첩에서 꾸미기에 들어가 소품을 빈 자리에 놓고, 끌어 옮기고, 치운다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  const entries = dayEntries('2026-10-10', 5) // 10월 10~14일: 화분·벤치가 열렸다
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  const stored = async () => JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)

  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-decorate').click()
  await expect(page.getByTestId('book')).toBeHidden()
  await expect(page.getByTestId('write-card')).toBeHidden()
  const tray = page.getByTestId('decorate')
  await expect(tray).toBeVisible()
  await expect(tray.locator('.decor-pick')).toHaveCount(2)
  for (const b of await tray.locator('button:visible').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(page.locator('.spot')).toHaveCount(0)

  // 꾸미기 중에는 집을 눌러도 읽기 창이 열리지 않는다
  await page.locator('[data-date="2026-10-12"]').first().dispatchEvent('click')
  await expect(page.getByTestId('reader')).toBeHidden()

  // 벤치를 고르면 빈 자리가 점선으로 보이고, 집 자리를 누르면 놓지 않는다
  await page.getByTestId('decorate-pick-bench').click()
  await expect(page.getByTestId('decorate-pick-bench')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('decorate-msg')).toHaveText('🪑 벤치를 놓을 빈 자리를 눌러요')
  expect(await page.locator('.spot').count()).toBeGreaterThan(10)
  await expect(page.getByTestId('spot-2026-10-1-2')).toHaveCount(0) // 10월 12일: 집
  await expect(page.getByTestId('spot-2026-10-2-4')).toHaveCount(0) // 오늘
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/decorate-pick.png' })
  const house = await centerOf(page.locator('[data-date="2026-10-12"]').first())
  await page.mouse.click(house.x, house.y)
  await expect(page.getByTestId('decorate-msg')).toHaveText('거기에는 놓을 수 없어요. 점선 자리를 골라요')
  expect((await stored()).decor).toBeUndefined()

  // 10월 20일(지난 빈 날)에 놓는다
  const spot = await centerOf(page.getByTestId('spot-2026-10-2-3'))
  await page.mouse.click(spot.x, spot.y)
  await expect(page.getByTestId('decorate-msg')).toHaveText('🪑 벤치를 놓았어요')
  await expect(page.getByTestId('decor-0')).toHaveAttribute('data-decor', 'bench')
  await expect(page.locator('.spot')).toHaveCount(0)
  expect((await stored()).decor).toEqual([{ id: 'bench', at: '2026-10', col: 2, row: 3 }])

  // 놓은 벤치를 눌러 고르고, 옆 칸(10월 21일)으로 끌어 옮긴다
  const bench = await centerOf(page.getByTestId('decor-0'))
  await page.mouse.click(bench.x, bench.y)
  await expect(page.getByTestId('decor-0')).toHaveClass(/picked/)
  await expect(page.getByTestId('decorate-remove')).toBeVisible()
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/decorate-picked.png' })
  const foot = await centerOf(page.locator('.pick-ring'))
  const next = await centerOf(page.getByTestId('spot-2026-10-3-3'))
  await page.mouse.move(bench.x, bench.y)
  await page.mouse.down()
  await page.mouse.move(bench.x + (next.x - foot.x) / 2, bench.y + (next.y - foot.y) / 2, { steps: 4 })
  await expect(page.getByTestId('decor-0')).toHaveClass(/lifted/)
  await page.mouse.move(bench.x + next.x - foot.x, bench.y + next.y - foot.y, { steps: 4 })
  await page.mouse.up()
  await expect(page.getByTestId('decorate-msg')).toHaveText('🪑 벤치를 옮겼어요')
  expect((await stored()).decor).toEqual([{ id: 'bench', at: '2026-10', col: 3, row: 3 }])

  // 다시 골라 치운다. 기록(글)은 그대로다
  const moved = await centerOf(page.getByTestId('decor-0'))
  await page.mouse.click(moved.x, moved.y)
  await page.getByTestId('decorate-remove').click()
  await expect(page.getByTestId('decorate-msg')).toHaveText('🪑 벤치를 치웠어요. 다시 놓을 수 있어요')
  await expect(page.locator('.decor')).toHaveCount(0)
  const after = await stored()
  expect(after.decor).toBeUndefined()
  expect(after.entries).toEqual(entries)

  // 화분을 하나 놓고 다 했어요를 누르면 한 줄 카드로 돌아오고, 다시 열어도 화분이 있다
  await page.getByTestId('decorate-pick-pot').click()
  const plot = await centerOf(page.getByTestId('spot-2026-10-2-3'))
  await page.mouse.click(plot.x, plot.y)
  await expect(page.getByTestId('decorate-msg')).toHaveText('🪴 화분을 놓았어요')
  await page.getByTestId('decorate-done').click()
  await expect(tray).toBeHidden()
  await expect(page.getByTestId('write-card')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('decor-0')).toHaveAttribute('data-decor', 'pot')
  await expect(page.getByTestId('decorate')).toBeHidden()
})

test('한 달 전·100일 전·작년 오늘의 글이 있으면 카드 아래에 작게 보이고, 누르면 그 집으로 날아가 글을 연다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T21:00:00+09:00') })
  await page.goto('./')
  // 오늘 자리는 비었고, 한 달 전(9월 28일)과 100일 전(7월 20일)에 썼다
  const entries = [...monthEntries('2026-07', [20]), ...monthEntries('2026-09', [27, 28]), ...monthEntries('2026-10', [26, 27])]
  entries.find((e) => e.date === '2026-09-28')!.text = '가을 바람이 처음 차가웠던 날, 따뜻한 차를 마시며 한참 창밖을 보았다'
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()

  // 드문 것(100일 전)을 먼저 보인다. 쓰는 칸과 함께 있어도 화면 안에 들어온다
  const memory = page.getByTestId('memory')
  await expect(memory).toContainText('📖 100일 전 오늘 · 7월 20일')
  await expect(memory).toContainText('2026-07 20일의 한 줄')
  await expect(memory).toBeInViewport()
  await expect(page.getByTestId('write-submit')).toBeInViewport()
  expect((await memory.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: 'test-results/screens/memory-card.png' })

  await memory.click()
  await page.clock.runFor(1500)
  await expect(page.getByTestId('reader-text')).toHaveText('2026-07 20일의 한 줄')
  await expect(page.getByTestId('reader-date')).toHaveText('2026년 7월 20일 월요일')
  // 그 집이 화면 안으로 왔다
  await page.getByTestId('reader-close').click()
  await expect(page.getByTestId('house-2026-07-20')).toBeInViewport()
  await page.screenshot({ path: 'test-results/screens/memory-visit.png' })

  // 100일 전 글을 지우면 다음으로 드문 한 달 전 글이 보인다. 긴 글은 한 줄로 줄인다
  await page.getByTestId('house-2026-07-20').click()
  await page.getByTestId('reader-erase').click()
  await page.getByTestId('erase-confirm').click()
  await expect(memory).toContainText('📖 한 달 전 오늘 · 9월 28일')
  expect((await memory.boundingBox())!.height).toBeLessThan(70)

  // 오늘을 써도 쪽지는 남는다. 저장에는 기록뿐이다
  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('오늘도 한 줄')
  await page.getByTestId('write-submit').click()
  await page.clock.runFor(4000)
  await expect(memory).toBeInViewport()
  await page.screenshot({ path: 'test-results/screens/memory-done.png' })
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(Object.keys(saved).sort()).toEqual(['entries', 'erased', 'version'])
})

test('돌아볼 지난 글이 없으면 쪽지를 보이지 않는다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T21:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [20, 26, 27])
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await expect(page.getByTestId('write-card')).toBeVisible()
  await expect(page.getByTestId('memory')).toHaveCount(0)
})

test('마을 수첩에서 기분 달력을 열어 달을 넘기고, 칠한 날을 누르면 그 집으로 가서 글을 연다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T21:00:00+09:00') })
  await page.goto('./')
  const entries = [...monthEntries('2026-08', [30, 31]), ...monthEntries('2026-10', [1, 2, 3, 5, 8, 9, 12, 15, 16, 20, 22, 26, 27])]
  const erased = [{ date: '2026-10-10', erasedAt: Date.parse('2026-10-11T09:00:00+09:00') }]
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries, erased })])
  await page.reload()

  await page.getByTestId('village-stage').click()
  const open = page.getByTestId('book-calendar')
  await expect(open).toBeInViewport()
  expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await open.click()
  await expect(page.getByTestId('book')).toBeHidden()

  // 이번 달: 쓴 날은 기분 색, 지운 날은 새싹, 오늘은 테두리, 아직 안 온 날은 누를 수 없다
  const cal = page.getByTestId('calendar')
  await expect(cal).toBeVisible()
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년 10월')
  await expect(page.getByTestId('calendar-count')).toHaveText('한 줄 13일')
  await expect(page.getByTestId('cal-2026-10-03')).toHaveAttribute('data-state', 'written')
  await expect(page.getByTestId('cal-2026-10-03')).toHaveAttribute('data-mood', entries.find((e) => e.date === '2026-10-03')!.mood)
  await expect(page.getByTestId('cal-2026-10-10')).toHaveAttribute('data-state', 'erased')
  await expect(page.getByTestId('cal-2026-10-28')).toHaveClass(/today/)
  await expect(page.getByTestId('cal-2026-10-29')).toBeDisabled()
  await expect(page.getByTestId('calendar-next')).toBeDisabled()
  await expect(page.getByTestId('calendar-band').locator('span')).not.toHaveCount(0)
  // 칸·버튼이 손가락으로 누를 만하고, 창이 화면 안에 들어온다
  for (const id of ['cal-2026-10-01', 'cal-2026-10-31', 'calendar-prev', 'calendar-close']) {
    const box = (await page.getByTestId(id).boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
    await expect(page.getByTestId(id)).toBeInViewport()
  }
  await page.getByTestId('cal-2026-10-10').click()
  await expect(page.getByTestId('calendar-detail')).toHaveText('🌱 10월 10일 · 지운 날이에요. 집을 지었던 날로 세어요')
  await page.getByTestId('cal-2026-10-14').click()
  await expect(page.getByTestId('calendar-detail')).toHaveText('🌿 10월 14일 · 쉬어 간 날이에요')
  await page.screenshot({ path: 'test-results/screens/calendar.png' })

  // 지난달은 쓴 날이 없고, 그 전 달(처음 지은 달)에서 더 넘길 수 없다
  await page.getByTestId('calendar-prev').click()
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년 9월')
  await expect(page.getByTestId('calendar-count')).toHaveText('아직 쓴 날이 없어요')
  await page.getByTestId('calendar-prev').click()
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년 8월')
  await expect(page.getByTestId('calendar-prev')).toBeDisabled()
  await expect(page.getByTestId('cal-2026-08-31')).toHaveAttribute('data-state', 'written')
  await page.screenshot({ path: 'test-results/screens/calendar-august.png' })

  // 칠한 날을 누르면 달력이 닫히고 그 집으로 가서 글을 연다
  await page.getByTestId('cal-2026-08-31').click()
  await expect(cal).toBeHidden()
  await page.clock.runFor(1500)
  await expect(page.getByTestId('reader-text')).toHaveText('2026-08 31일의 한 줄')
  await page.getByTestId('reader-close').click()
  await expect(page.getByTestId('house-2026-08-31')).toBeInViewport()

  // 달력은 저장에 아무것도 더하지 않는다
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(Object.keys(saved).sort()).toEqual(['entries', 'erased', 'version'])
  expect(saved.entries).toHaveLength(entries.length)
})

test('기분 달력 위 찾기 칸에 말을 넣으면 그 말이 든 지난 한 줄을 찾고, 누르면 그 집으로 간다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T21:00:00+09:00') })
  await page.goto('./')
  const say: Record<string, string> = {
    '2026-09-03': '비 오는 날 Coffee 한 잔',
    '2026-09-12': '바다를 보러 갔다',
    '2026-10-05': '커피 마시고 산책했다',
    '2026-10-20': '<b>새 커피집</b>에서 친구와 수다',
  }
  const entries = [...monthEntries('2026-09', [3, 12]), ...monthEntries('2026-10', [2, 5, 9, 20, 26])].map((e) => ({ ...e, text: say[e.date] ?? e.text }))
  const erased = [{ date: '2026-10-10', erasedAt: Date.parse('2026-10-11T09:00:00+09:00') }]
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries, erased })])
  await page.reload()

  await page.getByTestId('village-stage').click()
  await expect(page.getByTestId('book-calendar')).toContainText('찾기')
  await page.getByTestId('book-calendar').click()
  const search = page.getByTestId('calendar-search')
  await expect(search).toBeInViewport()
  expect((await search.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(page.getByTestId('calendar-days')).toBeVisible()

  // 커피를 찾으면 달력 대신 최근 날부터 찾은 한 줄이 보이고, 찾은 말이 칠해진다
  await search.fill('커피')
  await expect(page.getByTestId('calendar-days')).toHaveCount(0)
  await expect(page.getByTestId('search-count')).toHaveText('"커피" · 한 줄 2개를 찾았어요')
  const hits = page.getByTestId('search-hits').locator('.cal-hit')
  await expect(hits).toHaveCount(2)
  await expect(hits.nth(0)).toHaveAttribute('data-testid', 'hit-2026-10-20')
  await expect(hits.nth(1)).toHaveAttribute('data-testid', 'hit-2026-10-05')
  // 글 속 꺾쇠는 글자 그대로 보인다
  await expect(page.getByTestId('hit-2026-10-20')).toContainText('<b>새 커피집</b>에서')
  await expect(page.getByTestId('hit-2026-10-20').locator('mark')).toHaveText('커피')
  await expect(page.getByTestId('hit-2026-10-20')).toContainText('2026년 10월 20일 화요일')
  for (const id of ['hit-2026-10-20', 'hit-2026-10-05', 'calendar-search-clear', 'calendar-close']) {
    const box = (await page.getByTestId(id).boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    await expect(page.getByTestId(id)).toBeInViewport()
  }
  await page.getByTestId('calendar').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  await page.screenshot({ path: 'test-results/screens/search.png' })

  // 영어는 대소문자를 가리지 않고, 두 말은 모두 든 글만 찾는다
  await search.fill('coffee 비')
  await expect(hits).toHaveCount(1)
  await expect(hits.nth(0)).toHaveAttribute('data-testid', 'hit-2026-09-03')
  await expect(page.getByTestId('hit-2026-09-03').locator('mark')).toHaveText(['비', 'Coffee'])

  // 없는 말이면 다정하게 알려 준다
  await search.fill('등산')
  await expect(hits).toHaveCount(0)
  await expect(page.getByTestId('search-count')).toHaveText('"등산"이(가) 들어간 한 줄은 아직 없어요')
  await page.screenshot({ path: 'test-results/screens/search-none.png' })

  // 지우기 단추로 비우면 달력으로 돌아온다
  await page.getByTestId('calendar-search-clear').click()
  await expect(search).toHaveValue('')
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년 10월')
  await expect(page.getByTestId('calendar-search-clear')).toBeHidden()

  // 찾은 한 줄을 누르면 창이 닫히고 그 집으로 가서 글을 연다
  await search.fill('바다')
  await page.getByTestId('hit-2026-09-12').click()
  await expect(page.getByTestId('calendar')).toBeHidden()
  await page.clock.runFor(1500)
  await expect(page.getByTestId('reader-text')).toHaveText('바다를 보러 갔다')
  await page.getByTestId('reader-close').click()
  await expect(page.getByTestId('house-2026-09-12')).toBeInViewport()

  // 다시 열면 찾기 칸은 비어 있고 달력이 보인다
  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-calendar').click()
  await expect(search).toHaveValue('')
  await expect(page.getByTestId('calendar-days')).toBeVisible()

  // 찾기는 저장에 아무것도 더하지 않는다
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(Object.keys(saved).sort()).toEqual(['entries', 'erased', 'version'])
  expect(saved.entries).toEqual(entries)
})

test('기분 달력을 한 해 보기로 바꾸면 열두 달이 기분 색으로 칠해지고, 해를 넘기고, 달을 누르면 그달 달력이 열린다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T21:00:00+09:00') })
  await page.goto('./')
  // 2025년 11~12월에 시작해 2026년 1·3·10월에 썼다. 2026년에 카페 2채·공원 1채(카페는 2025년에 먼저 만남)
  const old = [...monthEntries('2025-11', [20, 21]), ...monthEntries('2025-12', [5])]
  old[0].text = '커피 한 잔'
  old.forEach((e) => (e.mood = 'calm'))
  const now = [...monthEntries('2026-01', [2, 3, 9]), ...monthEntries('2026-03', [14]), ...monthEntries('2026-10', [1, 20, 27])]
  now[0].text = '라떼를 마셨다'
  now[1].text = '공원 산책'
  now[4].text = '카페에서 쉬었다'
  now.slice(0, 3).forEach((e) => (e.mood = 'great'))
  now.slice(4).forEach((e) => (e.mood = 'blue'))
  const entries = [...old, ...now]
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()

  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-calendar').click()
  await expect(page.getByTestId('calendar-mode-month')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('calendar-mode-year').click()
  await expect(page.getByTestId('calendar-mode-year')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년')
  await expect(page.getByTestId('calendar-count')).toHaveText('한 줄 7일')
  await expect(page.getByTestId('calendar-months').locator('.cal-month')).toHaveCount(12)
  await expect(page.getByTestId('calm-2026-01')).toHaveAttribute('data-mood', 'great')
  await expect(page.getByTestId('calm-2026-01')).toContainText('3일')
  await expect(page.getByTestId('calm-2026-10')).toHaveAttribute('data-mood', 'blue')
  await expect(page.getByTestId('calm-2026-10')).toHaveClass(/today/)
  await expect(page.getByTestId('calm-2026-02')).not.toHaveAttribute('data-mood')
  await expect(page.getByTestId('calm-2026-02')).toBeEnabled()
  await expect(page.getByTestId('calm-2026-11')).toBeDisabled()
  await expect(page.getByTestId('calendar-next')).toBeDisabled()
  await expect(page.getByTestId('calendar-year-top')).toHaveText('가장 많이 지은 건물 · ☕ 카페 2채')
  await expect(page.getByTestId('calendar-year-found')).toHaveText('처음 만난 건물 · 🌳 공원')
  await expect(page.getByTestId('calendar-year-first')).toHaveText('그해 첫 한 줄 · 1월 2일')
  // 칸·버튼이 손가락으로 누를 만하고 화면 안에 들어온다
  for (const id of ['calendar-mode-year', 'calm-2026-01', 'calm-2026-12', 'calendar-prev', 'calendar-close']) {
    const box = (await page.getByTestId(id).boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
    await expect(page.getByTestId(id)).toBeInViewport()
  }
  await page.getByTestId('calendar').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  await page.screenshot({ path: 'test-results/screens/calendar-year.png' })

  // 지난해(처음 지은 해)로 넘기면 더 넘길 수 없고, 처음 지은 달 전은 누를 수 없다
  await page.getByTestId('calendar-prev').click()
  await expect(page.getByTestId('calendar-title')).toHaveText('2025년')
  await expect(page.getByTestId('calendar-count')).toHaveText('한 줄 3일')
  await expect(page.getByTestId('calendar-prev')).toBeDisabled()
  await expect(page.getByTestId('calm-2025-10')).toBeDisabled()
  await expect(page.getByTestId('calm-2025-11')).toHaveAttribute('data-mood', 'calm')
  await expect(page.getByTestId('calendar-year-found')).toHaveText('처음 만난 건물 · ☕ 카페')
  await page.screenshot({ path: 'test-results/screens/calendar-year-2025.png' })

  // 한 달 보기로 돌아가면 그해 마지막 달, 달 칸을 누르면 그달 달력
  await page.getByTestId('calendar-mode-month').click()
  await expect(page.getByTestId('calendar-title')).toHaveText('2025년 12월')
  await page.getByTestId('calendar-mode-year').click()
  await page.getByTestId('calendar-next').click()
  await page.getByTestId('calm-2026-03').click()
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년 3월')
  await expect(page.getByTestId('calendar-mode-month')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('cal-2026-03-14')).toHaveAttribute('data-state', 'written')

  // 찾는 동안에는 보기 바꾸기를 숨긴다
  await page.getByTestId('calendar-search').fill('커피')
  await expect(page.getByTestId('calendar-mode-year')).toBeHidden()
  await page.getByTestId('calendar-search-clear').click()
  await expect(page.getByTestId('calendar-mode-year')).toBeVisible()

  // 저장에는 기록뿐이다
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(Object.keys(saved).sort()).toEqual(['entries', 'version'])
  expect(saved.entries).toEqual(entries)
})

test('새 달 첫 주에는 카드 아래에 지난달 기분 색 띠와 가장 많이 지은 건물을 보이고, 누르면 그달 달력을 연다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-03T21:00:00+09:00') })
  await page.goto('./')
  // 10월에 다섯 날을 썼다(카페 3채, 책방 1채). 10월 3일은 한 달 전 오늘이지만 돌아보기가 먼저 보인다
  const entries = monthEntries('2026-10', [3, 8, 15, 22, 30])
  const words = ['커피 한 잔', '책을 읽었다', '라떼가 달았다', '그냥 조용한 하루', '카페에서 쉬었다']
  entries.forEach((e, i) => (e.text = words[i]))
  entries.push(...monthEntries('2026-11', [1]))
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()

  const recap = page.getByTestId('recap')
  await expect(recap).toContainText('🗓️ 10월 돌아보기 · 한 줄 5일')
  await expect(recap).toContainText('가장 많이 지은 건물 · ☕ 카페 3채')
  await expect(page.getByTestId('memory')).toHaveCount(0)
  await expect(page.getByTestId('recap-band').locator('span')).not.toHaveCount(0)
  await expect(recap).toBeInViewport()
  await expect(page.getByTestId('write-submit')).toBeInViewport()
  expect((await recap.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: 'test-results/screens/recap-card.png' })

  // 누르면 10월 달력이 열리고, 달력에도 가장 많이 지은 건물이 보인다
  await recap.click()
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년 10월')
  await expect(page.getByTestId('calendar-recap')).toHaveText('가장 많이 지은 건물 · ☕ 카페 3채')
  await page.getByTestId('calendar').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  await page.screenshot({ path: 'test-results/screens/recap-calendar.png' })
  // 11월은 아직 보통 집뿐이다
  await page.getByTestId('calendar-next').click()
  await expect(page.getByTestId('calendar-recap')).toHaveText('🏡 아담한 보통 집들로 채운 달이에요')
  await page.getByTestId('calendar-close').click()

  // 첫 주가 지나면 돌아보기는 들어가고, 저장에는 기록뿐이다
  await page.clock.setSystemTime(new Date('2026-11-08T21:00:00+09:00'))
  await page.reload()
  await expect(page.getByTestId('write-card')).toBeVisible()
  await expect(recap).toHaveCount(0)
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(Object.keys(saved).sort()).toEqual(['entries', 'version'])
  expect(saved.entries).toEqual(entries)
})

test('새해 첫 주에는 지난달 대신 지난해 돌아보기 쪽지를 보이고, 누르면 달력 한 해 보기를 연다', async ({ page }) => {
  await page.clock.install({ time: new Date('2027-01-03T21:00:00+09:00') })
  await page.goto('./')
  // 2026년 3·10·12월에 썼다(카페 2채). 12월 돌아보기 대신 한 해 돌아보기가 보인다
  const entries = [...monthEntries('2026-03', [14]), ...monthEntries('2026-10', [1, 20]), ...monthEntries('2026-12', [24, 31])]
  entries[1].text = '커피 한 잔'
  entries[3].text = '카페에서 쉬었다'
  entries.forEach((e, i) => (e.mood = i < 2 ? 'great' : 'calm'))
  entries.push(...monthEntries('2027-01', [1]))
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()

  const recap = page.getByTestId('recap')
  await expect(recap).toContainText('🗓️ 2026년 돌아보기 · 한 줄 5일')
  await expect(recap).toContainText('가장 많이 지은 건물 · ☕ 카페 2채')
  await expect(recap).not.toContainText('12월 돌아보기')
  await expect(page.getByTestId('recap-band').locator('span')).toHaveCount(12)
  await expect(recap).toBeInViewport()
  await expect(page.getByTestId('write-submit')).toBeInViewport()
  expect((await recap.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: 'test-results/screens/recap-year-card.png' })

  // 누르면 달력이 2026년 한 해 보기로 열린다
  await recap.click()
  await expect(page.getByTestId('calendar-mode-year')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년')
  await expect(page.getByTestId('calendar-count')).toHaveText('한 줄 5일')
  await expect(page.getByTestId('calm-2026-12')).toHaveAttribute('data-mood', 'calm')
  await page.getByTestId('calendar-close').click()

  // 첫 주가 지나면 쪽지는 들어가고, 저장에는 기록뿐이다
  await page.clock.setSystemTime(new Date('2027-01-08T21:00:00+09:00'))
  await page.reload()
  await expect(page.getByTestId('write-card')).toBeVisible()
  await expect(recap).toHaveCount(0)
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(Object.keys(saved).sort()).toEqual(['entries', 'version'])
  expect(saved.entries).toEqual(entries)
})

test('명소 축하·주민 누르기·소품 놓기에도 짧은 소리가 나고, 소리를 끄면 조용하다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.addInitScript(listenSound)
  await page.goto('./')
  const entries = dayEntries('2026-10-10', 6) // 7일째를 쓰면 우물이 생긴다
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  type Heard = { notes: number[]; buzz: unknown[] }
  const heard = () => page.evaluate(() => ({ notes: (window as unknown as Heard).notes, buzz: (window as unknown as Heard).buzz }))
  const hush = () => page.evaluate(() => (((window as unknown as Heard).notes = []), ((window as unknown as Heard).buzz = [])))

  // 축하 카드가 뜨는 순간 짓는 가락(네 음) 뒤에 길게 올라가는 축하 가락(다섯 음)이 울린다
  await page.getByTestId('mood-great').click()
  await page.getByTestId('write-input').fill('일주일째 한 줄')
  await page.clock.pauseAt(new Date('2026-10-27T13:01:00+09:00'))
  await page.getByTestId('write-submit').click()
  await page.clock.runFor(4000)
  await expect(page.getByTestId('celebrate')).toBeVisible()
  let h = await heard()
  expect(h.notes).toHaveLength(18)
  const fanfare = h.notes.slice(8).filter((_, i) => i % 2 === 0)
  expect(fanfare).toEqual([523.25, 659.26, 783.99, 1046.5, 1318.51])
  expect(h.buzz).toEqual([[30, 40, 50], [20, 40, 20, 40, 20]])
  await page.getByTestId('celebrate-close').click()
  await finishAnimations(page)

  // 주민을 누르면 "뾰롱" 두 음, 떨지 않는다. 같은 주민은 같은 목소리
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await hush()
  const kong = page.getByTestId('resident-kong')
  await kong.click({ force: true })
  await expect(page.getByTestId('build-note')).toContainText('콩이')
  h = await heard()
  expect(h.notes).toHaveLength(4)
  expect(h.buzz).toEqual([])
  await kong.click({ force: true })
  const again = (await heard()).notes
  expect(again.slice(4)).toEqual(again.slice(0, 4))

  // 소품을 놓으면 나무 "톡" 한 음과 아주 짧은 떨림
  await hush()
  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-decorate').click()
  await page.getByTestId('decorate-pick-bench').click()
  await finishAnimations(page)
  // 고르기만 해서는 소리가 없다
  expect((await heard()).notes).toEqual([])
  const spot = await centerOf(page.getByTestId('spot-2026-10-2-3')) // 10월 20일(지난 빈 날)
  await page.mouse.click(spot.x, spot.y)
  await expect(page.getByTestId('decorate-msg')).toHaveText('🪑 벤치를 놓았어요')
  await page.clock.runFor(100)
  h = await heard()
  expect(h.notes).toEqual([329.63, 1318.52])
  expect(h.buzz).toEqual([[15]])
  await page.getByTestId('decorate-done').click()

  // 소리를 끄면 주민을 눌러도 조용하다
  await page.getByTestId('settings-open').click()
  await page.getByTestId('sound-toggle').click()
  await page.getByTestId('settings-close').click()
  await hush()
  await kong.click({ force: true })
  await expect(page.getByTestId('build-note')).toContainText('콩이')
  expect(await heard()).toEqual({ notes: [], buzz: [] })
  // 저장은 기록·소품 자리·소리 설정뿐이다
  const keys = await page.evaluate(() => Object.keys(localStorage).sort())
  expect(keys).toEqual(['diary-village:save', 'diary-village:sound'])
})

test('잔치 날에는 광장에 깃발 줄과 잔치 장식이 서고, 여느 날에는 없다', async ({ page }) => {
  // 첫 집은 작년 10월 28일 → 올해 10월 28일이 마을 생일
  await page.clock.install({ time: new Date('2026-10-28T13:00:00+09:00') })
  await page.goto('./')
  const entries = [...monthEntries('2025-10', [28, 29]), ...monthEntries('2026-10', [3, 9, 15, 21, 27])]
  const saved = JSON.stringify({ version: 1, entries })
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, saved])
  const visit = async (time: string, festival: string | null, shot?: string) => {
    await page.clock.setSystemTime(new Date(time))
    await page.reload()
    await expect(page.getByTestId('plaza')).toBeAttached()
    if (!festival) {
      await expect(page.locator('.festival, .bunting')).toHaveCount(0)
      return
    }
    await expect(page.getByTestId('festival')).toHaveAttribute('data-festival', festival)
    await expect(page.locator('.festival')).toHaveCount(2)
    // 기둥 세 개 + 두 변의 깃발 13칸
    await expect(page.locator('.bunting')).toHaveCount(16)
    // 잔치 카드를 닫으면 광장 쪽으로 간다
    await page.getByTestId('celebrate-close').click()
    await expect(page.getByTestId('celebrate')).toBeHidden()
    await page.waitForTimeout(1000)
    if (shot) {
      // 멀리 본 뒤 잔치 장식 쪽으로 가까이 간다
      const svg = (await page.getByTestId('village').boundingBox())!
      await page.mouse.move(svg.x + svg.width / 2, svg.y + svg.height / 2)
      for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 300)
      // 장식을 가운데로 끌어온 뒤 가운데에서 가까이 본다
      const f = (await page.getByTestId('festival').boundingBox())!
      const cx = svg.x + svg.width / 2
      const cy = svg.y + svg.height / 2
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      await page.mouse.move(cx + (cx - f.x - f.width / 2) + 40, cy + (cy - f.y - f.height / 2), { steps: 8 })
      await page.mouse.up()
      await page.mouse.move(cx, cy)
      for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -200)
      await page.screenshot({ path: `test-results/screens/${shot}.png` })
    }
  }
  await visit('2026-10-28T13:00:00+09:00', 'birthday', 'festival-birthday')
  await visit('2026-10-29T13:00:00+09:00', null)
  await visit('2026-10-31T13:00:00+09:00', 'pumpkin', 'festival-pumpkin')
  await visit('2026-12-24T13:00:00+09:00', 'christmas', 'festival-christmas')
  await visit('2027-01-01T13:00:00+09:00', 'newYear', 'festival-newyear')
  // 음력 설·추석은 날짜 표로, 앞뒤 하루까지 사흘
  await visit('2027-02-06T13:00:00+09:00', 'seollal', 'festival-seollal')
  await visit('2027-02-09T13:00:00+09:00', null)
  await visit('2027-09-16T20:00:00+09:00', 'chuseok', 'festival-chuseok')
  await visit('2027-09-17T13:00:00+09:00', null)
  // 잔치 장식은 계산만 한다: 저장은 처음 기록 그대로
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(saved)
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([KEY])
})

test('잔치 날 처음 열면 잔치 카드가 한 번 뜨고, 누르면 축하 가락과 함께 광장으로 간다. 주민도 잔치 한마디를 한다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T13:00:00+09:00') })
  await page.addInitScript(listenSound)
  await page.goto('./')
  const entries = [...monthEntries('2025-10', [28, 29]), ...monthEntries('2026-10', [3, 9, 15, 21, 27])]
  const saved = JSON.stringify({ version: 1, entries })
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, saved])
  await page.reload()
  const heard = () => page.evaluate(() => {
    const w = window as unknown as { notes: number[]; buzz: unknown[] }
    return { notes: w.notes.length, buzz: w.buzz }
  })
  // 마을 생일: 첫 집을 지은 지 1년
  const cardEl = page.getByTestId('celebrate')
  await expect(cardEl).toBeVisible()
  await expect(page.getByTestId('celebrate-title')).toHaveText('🎂 오늘은 마을 생일이에요')
  await expect(page.getByTestId('celebrate-body')).toContainText('첫 집을 지은 지 1년')
  const btn = page.getByTestId('celebrate-close')
  await expect(btn).toHaveText('🎉 잔치 즐기기')
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(btn).toBeInViewport()
  // 연 것만으로는 소리를 내지 않는다(폰이 막는다)
  expect(await heard()).toEqual({ notes: 0, buzz: [] })
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/screens/festival-card.png' })
  await btn.click()
  await expect(cardEl).toBeHidden()
  // 축하 가락 다섯 음(바탕음·배음)과 떨림
  expect((await heard()).notes).toBe(10)
  await page.waitForTimeout(1000)
  expect((await heard()).buzz).toEqual([[20, 40, 20, 40, 20]])
  // 광장 잔치 장식이 화면 안에 보인다
  await expect(page.getByTestId('festival')).toBeInViewport()
  await page.screenshot({ path: 'test-results/screens/festival-plaza.png' })

  // 광장을 걷는 주민(한 명은 오늘 자리 앞에서 기다리는 손님): 처음엔 오늘 이야기, 두 번째는 잔치 한마디
  await expect(page.locator('.guest.waiting')).toHaveCount(1)
  const shown = await page.locator('.resident').evaluateAll((list) => list.find((n) => {
    const r = n.getBoundingClientRect()
    return r.x > 0 && r.right < innerWidth && r.y > 0 && r.bottom < innerHeight
  })?.getAttribute('data-resident'))
  const walker = page.locator(`[data-resident="${shown}"]`)
  await walker.click({ force: true })
  await expect(page.getByTestId('build-note')).toContainText('“')
  await walker.click({ force: true })
  await expect(page.getByTestId('build-note')).toContainText(/생일/)

  // 같은 날 다시 열어도 카드는 이번 열기에 한 번(본 표시는 저장하지 않는다)
  await page.reload()
  await expect(cardEl).toBeVisible()
  await page.getByTestId('celebrate-close').click()
  // 여느 날에는 잔치 카드가 없다
  await page.clock.setSystemTime(new Date('2026-10-29T13:00:00+09:00'))
  await page.reload()
  await expect(page.getByTestId('plaza')).toBeAttached()
  await page.waitForTimeout(300)
  await expect(cardEl).toBeHidden()
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(saved)
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([KEY])
})

test('집·건물 바로 앞 칸에는 나무 대신 꽃·풀이 나서 집을 가리지 않는다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-31T21:00:00+09:00') })
  await page.goto('./')
  const days = Array.from({ length: 31 }, (_, i) => i + 1)
  const saved = JSON.stringify({ version: 1, entries: monthEntries('2026-10', days) })
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, saved])
  await page.reload()
  await expect(page.getByTestId('house-2026-10-31')).toBeVisible()
  await page.getByTestId('celebrate-close').click() // 10월 31일은 호박 축제

  // 2026년 10월 1일은 목요일: d일의 칸은 (요일, 몇째 주)
  const lots = new Set(days.map((d) => `${(3 + d) % 7},${Math.floor((3 + d) / 7)}`))
  const cells = async (sel: string) =>
    (await page.locator(sel).evaluateAll((els) => els.map((e) => e.getAttribute('data-cell') ?? ''))).map((c) => c.split(',').map(Number))
  const trees = (await cells('.tree')).filter(([, gy]) => gy < 6) // 10월 구역(광장 위)
  expect(trees.length).toBeGreaterThan(0)
  for (const [gx, gy] of trees) {
    for (const [c, r] of [[gx - 1, gy], [gx, gy - 1], [gx - 1, gy - 1]]) expect(lots.has(`${c},${r}`)).toBe(false)
  }
  // 여섯째 주 줄은 달력 밖이고 다섯째 주 집들 바로 앞이라 나무가 없고 꽃·풀이 난다
  expect(trees.filter(([, gy]) => gy === 5)).toEqual([])
  expect((await cells('.meadow')).filter(([, gy]) => gy === 5).length).toBeGreaterThan(0)

  const house = (await page.getByTestId('house-2026-10-27').boundingBox())!
  await page.mouse.move(house.x + house.width / 2, house.y + house.height / 2)
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -200)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/houses-front-clear.png' })
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(saved)
})

test('집을 짓거나 읽을 때 그 집 앞을 가리는 나무·주민이 잠깐 옅어졌다가 돌아온다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const days = [2, 3, 5, 8, 9, 12, 13, 15, 16, 19, 20, 22, 24, 25, 26]
  const saved = JSON.stringify({ version: 1, entries: monthEntries('2026-10', days) })
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, saved])
  await page.reload()
  const veiled = page.locator('svg .veiled')
  const kong = page.getByTestId('resident-kong')
  await expect(kong).toBeAttached()
  await expect(veiled).toHaveCount(0)

  // 26일 집 앞 길을 걷는 주민(콩)은 그 집을 읽는 동안 옅어지고, 누르기를 막지 않는다
  await page.getByTestId('house-2026-10-26').dispatchEvent('click')
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 26일의 한 줄')
  await expect(kong).toHaveClass(/veiled/)
  await expect.poll(() => kong.evaluate((e) => Number(getComputedStyle(e).opacity))).toBeLessThan(0.5)
  expect(await kong.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none')
  // 집 뒤(먼저 그린 것)는 옅어지지 않는다
  for (const node of await veiled.all()) {
    expect(await node.evaluate((n) => !!(document.querySelector('[data-testid="house-2026-10-26"]')!.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
  }
  const house = (await page.getByTestId('house-2026-10-26').boundingBox())!
  await page.mouse.move(house.x + house.width / 2, house.y + house.height / 2)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/read-unveil.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
  await page.getByTestId('reader-close').click()
  await expect(veiled).toHaveCount(0)
  await expect.poll(() => kong.evaluate((e) => Number(getComputedStyle(e).opacity))).toBe(1)

  // 짓는 동안 새 집 앞을 가리는 것이 옅어졌다가, 원래 보기로 돌아올 때 되돌아온다
  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('따뜻한 차 한 잔')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('house-2026-10-27')).toBeAttached()
  expect(await veiled.count()).toBeGreaterThan(0)
  await page.clock.runFor(1500)
  expect(await veiled.count()).toBeGreaterThan(0)
  await page.evaluate(() => document.getAnimations().forEach((a) => ((a.currentTime = 1500), a.pause())))
  await page.screenshot({ path: 'test-results/screens/build-unveil.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
  await page.clock.runFor(2500)
  await expect(veiled).toHaveCount(0)
  expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!).entries).toHaveLength(days.length + 1)
})

test('주민이 지난날 집 이야기를 들려주고, "보러 가기"를 누르면 그 집으로 날아가 글을 연다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const days = [3, 10, 15]
  const saved = JSON.stringify({ version: 1, entries: monthEntries('2026-10', days) })
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, saved])
  await page.reload()
  const kong = page.getByTestId('resident-kong')
  await expect(kong).toBeAttached()
  const note = page.getByTestId('build-note')
  const go = page.getByTestId('note-go')

  // 첫 한마디는 오늘 이야기라 "보러 가기"가 없다
  await kong.click({ force: true })
  await expect(note).toContainText('콩이: “')
  await expect(go).toHaveCount(0)

  // 두 번째는 지난 이야기: 날짜와 함께 "보러 가기"
  await kong.click({ force: true })
  await expect(go).toBeVisible()
  const said = (await note.textContent())!
  const day = Number(said.match(/10월 (\d+)일/)![1])
  expect(days).toContain(day)
  expect((await go.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  const box = (await note.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await page.waitForTimeout(600) // 말풍선이 다 떠오를 때까지
  await page.screenshot({ path: 'test-results/screens/resident-story.png' })

  // 누르면 그 집으로 날아가 그날 글을 연다
  await go.click()
  await expect(note).toBeHidden()
  await page.clock.runFor(1500)
  await expect(page.getByTestId('reader-text')).toHaveText(`2026-10 ${day}일의 한 줄`)
  await expect(page.getByTestId(`house-2026-10-${String(day).padStart(2, '0')}`)).toBeInViewport()

  // 다음 한마디는 여느 때 말이라 버튼이 없다
  await page.getByTestId('reader-close').click()
  await kong.dispatchEvent('click') // 날아간 뒤라 콩이는 화면 밖일 수 있다
  await expect(note).toContainText('콩이: “')
  await expect(go).toHaveCount(0)
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(saved)
})

test('쓰기 칸·어제 칸 빈 글자 자리에 오늘의 물음이 뜨고, 날이 바뀌면 물음도 바뀐다. 저장은 쓴 글 그대로다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T23:59:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [20, 22, 24])
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  const input = page.getByTestId('write-input')
  const today = todayPrompt(entries as Entry[], '2026-10-27').text
  await expect(input).toHaveAttribute('placeholder', today)

  // 물음이 쓰기 칸 안에서 잘리지 않는다(모든 물음을 이 칸의 글꼴로 재어 본다)
  const all = [...PROMPTS, ...Object.values(SEASON_PROMPTS).flat(), ...Object.values(BUILDING_PROMPTS), ...YESTERDAY_PROMPTS]
  const over = await input.evaluate((el, texts) => {
    const st = getComputedStyle(el)
    const room = el.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight)
    const ctx = document.createElement('canvas').getContext('2d')!
    ctx.font = st.font
    return texts.filter((t) => ctx.measureText(t).width > room)
  }, all)
  expect(over).toEqual([])
  expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: 'test-results/screens/prompt-today.png' })

  // 어제 칸에는 어제 물음
  await page.getByTestId('write-yesterday').click()
  await expect(input).toHaveAttribute('placeholder', yesterdayPrompt('2026-10-27'))
  await page.screenshot({ path: 'test-results/screens/prompt-yesterday.png' })
  await page.getByTestId('back-today').click()

  // 자정을 넘기면 새 물음
  await page.clock.runFor(90_000)
  await expect(page.getByTestId('today-date')).toHaveText('10월 28일 수요일')
  const next = todayPrompt(entries as Entry[], '2026-10-28').text
  expect(next).not.toBe(today)
  await expect(input).toHaveAttribute('placeholder', next)

  // 물음은 글에 들어가지 않는다: 쓴 글 그대로 저장된다
  await input.fill('귤을 까 먹었다')
  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('today-line')).toContainText('귤을 까 먹었다')
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(saved.entries).toHaveLength(4)
  expect(saved.entries.find((e: Entry) => e.date === '2026-10-28').text).toBe('귤을 까 먹었다')
})

test('읽기 창에서 앞뒤 쓴 날로 넘겨 읽고, 마을 보기도 그 집으로 옮겨 간다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const erased = [{ date: '2026-10-07', erasedAt: Date.parse('2026-10-08T09:00:00+09:00') }]
  const saved = JSON.stringify({ version: 1, entries: monthEntries('2026-10', [2, 5, 9, 26]), erased })
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, saved])
  await page.reload()

  await page.getByTestId('house-2026-10-26').dispatchEvent('click')
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 26일의 한 줄')
  const prev = page.getByTestId('reader-prev')
  const next = page.getByTestId('reader-next')
  await expect(next).toBeDisabled() // 가장 최근 날
  await expect(prev).toBeEnabled()
  for (const id of ['reader-prev', 'reader-next']) {
    const box = (await page.getByTestId(id).boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
  }
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/screens/reader-turn.png' })

  // 빈 날과 지운 날(7일)은 건너뛴다. 넘기면 마을 보기도 그 집으로 옮겨 간다
  const viewBox = () => page.getByTestId('village').getAttribute('viewBox')
  const before = await viewBox()
  await prev.click()
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 9일의 한 줄')
  await expect(page.getByTestId('reader-date')).toHaveText('2026년 10월 9일 금요일')
  await page.clock.runFor(1500)
  expect(await viewBox()).not.toBe(before)
  await expect(next).toBeEnabled()
  await prev.click()
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 5일의 한 줄')
  await prev.click()
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 2일의 한 줄')
  await expect(prev).toBeDisabled() // 가장 처음 날
  await page.clock.runFor(1500)
  await page.screenshot({ path: 'test-results/screens/reader-turn-first.png' })
  await next.click()
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 5일의 한 줄')

  // 넘긴 날에서 고치기를 하면 그 날을 고친다
  await page.getByTestId('reader-edit').click()
  await expect(page.getByTestId('reader-date')).toHaveText('2026년 10월 5일 월요일')
  await page.getByTestId('edit-cancel').click()
  await page.getByTestId('reader-close').click()
  await expect(page.locator('svg .veiled')).toHaveCount(0)
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(saved)
})

test('읽기 창을 옆으로 밀어 넘기고, 넘길 때 책장 소리, 처음·최근 날엔 다정한 한마디', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.addInitScript(listenSound)
  await page.goto('./')
  const saved = JSON.stringify({ version: 1, entries: monthEntries('2026-10', [2, 5, 9, 26]) })
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, saved])
  await page.reload()

  await page.getByTestId('house-2026-10-09').dispatchEvent('click')
  const text = page.getByTestId('reader-text')
  const edge = page.getByTestId('reader-edge')
  await expect(text).toHaveText('2026-10 9일의 한 줄')
  await expect(edge).toBeHidden() // 가운데 날엔 한마디 없음
  const notes = () => page.evaluate(() => (window as unknown as { notes: number[] }).notes.length)
  const buzz = () => page.evaluate(() => (window as unknown as { buzz: unknown[] }).buzz)
  const quiet = await notes()

  // 마우스로 글 위를 끌면 글자 고르기라 넘기지 않는다
  const tb = (await text.boundingBox())!
  await page.mouse.move(tb.x + tb.width - 4, tb.y + tb.height / 2)
  await page.mouse.down()
  await page.mouse.move(tb.x + 4, tb.y + tb.height / 2, { steps: 4 })
  await page.mouse.up()
  expect(await page.evaluate(() => window.getSelection()!.toString())).not.toBe('')
  await expect(text).toHaveText('2026-10 9일의 한 줄')
  await page.evaluate(() => window.getSelection()!.removeAllRanges())

  // 손가락으로 창(글 위)을 민다. 왼쪽으로 밀면 뒷 날, 오른쪽으로 밀면 앞 날
  const swipe = async (dx: number, dy = 0) => {
    const box = (await text.boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    const at = (px: number, py: number) => ({ pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: px, clientY: py, bubbles: true })
    await text.dispatchEvent('pointerdown', at(x, y))
    await text.dispatchEvent('pointermove', at(x + dx / 2, y + dy / 2))
    await text.dispatchEvent('pointerup', at(x + dx, y + dy))
  }
  await swipe(-120)
  await expect(text).toHaveText('2026-10 26일의 한 줄')
  await expect(edge).toHaveText('🏡 가장 최근에 지은 집이에요')
  // 책장 소리(두 음, 음마다 바탕음과 배음)가 나고 떨지는 않는다
  expect((await notes()) - quiet).toBe(4)
  expect(await buzz()).toEqual([])
  await swipe(-120) // 더 넘길 날이 없으면 그대로
  await expect(text).toHaveText('2026-10 26일의 한 줄')
  await swipe(120)
  await expect(text).toHaveText('2026-10 9일의 한 줄')

  // 조금만 밀거나 세로로 움직이면 넘기지 않는다
  await swipe(-30)
  await swipe(-70, 120)
  await expect(text).toHaveText('2026-10 9일의 한 줄')

  await swipe(120)
  await swipe(120)
  await expect(text).toHaveText('2026-10 2일의 한 줄')
  await expect(edge).toHaveText('🌱 가장 처음 지은 집이에요')
  await page.clock.runFor(1500)
  await page.screenshot({ path: 'test-results/screens/reader-turn-edge.png' })

  // 소리를 끄면 넘겨도 조용하다
  await page.getByTestId('reader-close').click()
  await page.evaluate(() => localStorage.setItem('diary-village:sound', 'off'))
  await page.getByTestId('house-2026-10-05').dispatchEvent('click')
  const before = await notes()
  await page.getByTestId('reader-next').click()
  await expect(text).toHaveText('2026-10 9일의 한 줄')
  expect(await notes()).toBe(before)

  // 고치기 창에서는 밀어도 넘기지 않고, 넘긴 날을 지우면 그 날만 지워진다
  await page.getByTestId('reader-edit').click()
  const input = page.getByTestId('edit-input')
  const box = (await input.boundingBox())!
  await page.mouse.move(box.x + 200, box.y - 40)
  await page.mouse.down()
  await page.mouse.move(box.x + 40, box.y - 40)
  await page.mouse.up()
  await expect(page.getByTestId('reader-date')).toHaveText('2026년 10월 9일 금요일')
  await page.getByTestId('edit-cancel').click()
  await page.getByTestId('reader-erase').click()
  await page.getByTestId('erase-confirm').click()
  const after = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(after.entries.map((e: Entry) => e.date)).toEqual(['2026-10-02', '2026-10-05', '2026-10-26'])
  expect(after.erased.map((e: { date: string }) => e.date)).toEqual(['2026-10-09'])

  // 하나뿐인 집에는 "처음 지은 집"
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries: monthEntries('2026-10', [20]) })])
  await page.reload()
  await page.getByTestId('house-2026-10-20').dispatchEvent('click')
  await expect(edge).toHaveText('🌱 마을에 처음 지은 집이에요')
})

/** 소중한 날 표시를 뺀 기록(글·기분·쓴 시각) */
const plain = (list: Entry[]) => list.map(({ treasured: _, ...e }) => e)

test('읽기 창에서 소중한 날을 켜고 끄면, 그 집 마당에 하트 깃발이 서고 새로고침해도 남는다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T14:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [2, 5, 9, 26]) as Entry[]
  entries[2] = { ...entries[2], treasured: true }
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  const stored = async () => JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!).entries as Entry[]

  // 표시한 날(9일)에만 깃발이 있다
  await expect(page.locator('.treasure-flag')).toHaveCount(1)
  await expect(page.getByTestId('treasure-2026-10-09')).toHaveCount(1)

  // 26일 집을 열어 소중한 날로 표시한다
  await page.getByTestId('house-2026-10-26').click()
  const heart = page.getByTestId('reader-treasure')
  await expect(heart).toHaveText('🤍 소중한 날')
  await expect(heart).toHaveAttribute('aria-pressed', 'false')
  const box = (await heart.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await heart.click()
  await expect(heart).toHaveText('💛 소중한 날')
  await expect(heart).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 26일의 한 줄')
  await expect(page.getByTestId('treasure-2026-10-26')).toHaveCount(1)
  expect((await stored()).find((e) => e.date === '2026-10-26')).toEqual({ ...entries[3], treasured: true })
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/screens/reader-treasure.png' })

  // 고치기를 그만둬도 표시는 그대로다
  await page.getByTestId('reader-edit').click()
  await page.getByTestId('edit-cancel').click()
  await expect(heart).toHaveText('💛 소중한 날')

  // 앞 날(9일)로 넘기면 그 날 표시가 보이고, 끄면 그 날만 풀린다
  await page.getByTestId('reader-prev').click()
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 9일의 한 줄')
  await expect(heart).toHaveText('💛 소중한 날')
  await heart.click()
  await expect(heart).toHaveText('🤍 소중한 날')
  await expect(page.getByTestId('treasure-2026-10-09')).toHaveCount(0)
  expect((await stored()).find((e) => e.date === '2026-10-09')).toEqual(plain(entries)[2])
  await page.getByTestId('reader-prev').click()
  await expect(heart).toHaveText('🤍 소중한 날')
  await page.getByTestId('reader-close').click()
  await expect(page.locator('svg .veiled')).toHaveCount(0)

  // 깃발은 누르기를 가로막지 않고, 표시해도 건물은 그대로다
  const caught = await page.getByTestId('treasure-2026-10-26').evaluate((f) => {
    const r = f.querySelector('.heart')!.getBoundingClientRect()
    return !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.treasure-flag')
  })
  expect(caught).toBe(false)
  await expect(page.getByTestId('house-2026-10-26')).toHaveAttribute('data-building', 'house')

  // 새로고침해도 남는다
  await page.reload()
  await expect(page.locator('.treasure-flag')).toHaveCount(1)
  await expect(page.getByTestId('treasure-2026-10-26')).toHaveCount(1)
  await page.getByTestId('house-2026-10-26').click()
  await expect(heart).toHaveText('💛 소중한 날')
  await page.getByTestId('reader-close').click()
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/treasure-flag-day.png' })
  // 글·기분·쓴 시각은 그대로다
  expect(plain(await stored())).toEqual(plain(entries))
})

test('밤에도 소중한 날 하트 깃발이 보인다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:30:00+09:00') })
  await page.goto('./')
  const entries = (monthEntries('2026-10', [20, 22, 24, 25, 26]) as Entry[]).map((e, i): Entry => (i % 2 === 0 ? { ...e, treasured: true } : e))
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await expect(page.locator('.treasure-flag')).toHaveCount(3)
  await expect(page.getByTestId('treasure-2026-10-26')).toBeVisible()
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/treasure-flag-night.png' })
})

test('기분 달력에 소중한 날 하트가 붙고, "소중한 날"에서 모아 보다가 누르면 그 집 글을 연다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T14:00:00+09:00') })
  await page.goto('./')
  const openCalendar = async () => {
    await page.getByTestId('village-stage').click()
    await page.getByTestId('book-calendar').click()
    await page.getByTestId('calendar').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  }

  // 처음엔 소중한 날이 없어서 다정하게 알려 준다
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries: monthEntries('2026-10', [5, 9]) })])
  await page.reload()
  await openCalendar()
  await expect(page.locator('.cal-heart')).toHaveCount(0)
  await page.getByTestId('calendar-mode-treasure').click()
  await expect(page.getByTestId('treasure-count')).toContainText('아직 소중한 날이 없어요')
  await expect(page.getByTestId('treasure-list').locator('.cal-hit')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/screens/treasure-none.png' })
  await page.getByTestId('calendar-close').click()

  const marked = ['2026-09-12', '2026-10-05', '2026-10-20']
  const entries = ([...monthEntries('2026-09', [3, 12]), ...monthEntries('2026-10', [2, 5, 9, 20, 26])] as Entry[]).map((e): Entry =>
    marked.includes(e.date) ? { ...e, treasured: true } : e,
  )
  entries[0] = { ...entries[0], text: '합격 발표를 기다렸다' }
  entries[1] = { ...entries[1], text: '<b>합격</b>한 날, 바다를 보러 갔다' }
  const erased = [{ date: '2026-10-10', erasedAt: Date.parse('2026-10-11T09:00:00+09:00') }]
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries, erased })])
  await page.reload()

  // 달력에서 표시한 날 칸에만 하트가 붙는다(지운 날·표시 안 한 날은 없음)
  await openCalendar()
  await expect(page.locator('.cal-heart')).toHaveCount(2)
  await expect(page.getByTestId('cal-2026-10-05').locator('.cal-heart')).toHaveCount(1)
  await expect(page.getByTestId('cal-2026-10-20').locator('.cal-heart')).toHaveCount(1)
  await expect(page.getByTestId('cal-2026-10-09').locator('.cal-heart')).toHaveCount(0)
  await expect(page.getByTestId('cal-2026-10-10').locator('.cal-heart')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/screens/calendar-treasure.png' })

  // 지난달을 보다가 소중한 날을 열면 날짜 순으로 모인다
  await page.getByTestId('calendar-prev').click()
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년 9월')
  const mode = page.getByTestId('calendar-mode-treasure')
  await mode.click()
  await expect(mode).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('calendar-days')).toHaveCount(0)
  await expect(page.getByTestId('treasure-count')).toHaveText('💛 소중한 날 3일')
  const list = page.getByTestId('treasure-list').locator('.cal-hit')
  await expect(list).toHaveCount(3)
  await expect(list.nth(0)).toHaveAttribute('data-testid', 'hit-2026-09-12')
  await expect(list.nth(1)).toHaveAttribute('data-testid', 'hit-2026-10-05')
  await expect(list.nth(2)).toHaveAttribute('data-testid', 'hit-2026-10-20')
  // 글 속 꺾쇠는 글자 그대로 보인다
  await expect(page.getByTestId('hit-2026-09-12')).toContainText('<b>합격</b>한 날, 바다를')
  await expect(page.getByTestId('hit-2026-09-12')).toContainText('2026년 9월 12일 토요일')
  for (const id of ['hit-2026-09-12', 'hit-2026-10-20', 'calendar-mode-month', 'calendar-mode-year', 'calendar-mode-treasure', 'calendar-close']) {
    const box = (await page.getByTestId(id).boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    await expect(page.getByTestId(id)).toBeInViewport()
  }
  await page.screenshot({ path: 'test-results/screens/treasure-list.png' })

  // 찾기에 말을 넣으면 찾기가 먼저, 비우면 소중한 날로 돌아온다
  await page.getByTestId('calendar-search').fill('합격')
  await expect(page.getByTestId('search-count')).toHaveText('"합격" · 한 줄 2개를 찾았어요')
  await page.getByTestId('calendar-search-clear').click()
  await expect(page.getByTestId('treasure-count')).toHaveText('💛 소중한 날 3일')

  // 한 달로 돌아오면 보던 달 그대로다
  await page.getByTestId('calendar-mode-month').click()
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년 9월')
  await expect(page.getByTestId('cal-2026-09-12').locator('.cal-heart')).toHaveCount(1)

  // 모아 본 날을 누르면 창이 닫히고 그 집으로 가서 글을 연다
  await mode.click()
  await page.getByTestId('hit-2026-10-05').click()
  await expect(page.getByTestId('calendar')).toBeHidden()
  await page.clock.runFor(1500)
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 5일의 한 줄')
  await expect(page.getByTestId('reader-treasure')).toHaveText('💛 소중한 날')

  // 읽기 창에서 풀면 다시 열었을 때 하트도 목록도 빠진다
  await page.getByTestId('reader-treasure').click()
  await page.getByTestId('reader-close').click()
  await openCalendar()
  await expect(page.getByTestId('cal-2026-10-05').locator('.cal-heart')).toHaveCount(0)
  await page.getByTestId('calendar-mode-treasure').click()
  await expect(page.getByTestId('treasure-count')).toHaveText('💛 소중한 날 2일')
  // 모아 보기는 저장을 바꾸지 않는다(푼 날 칸만 빠짐)
  const now = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(now.entries).toEqual(entries.map((e) => (e.date === '2026-10-05' ? plain([e])[0] : e)))
  expect(now.erased).toEqual(erased)
})

test('광장 우체통을 누르면 편지 창이 열려 미래의 나에게 편지를 부치고, 기다리는 편지는 열리는 날만 보인다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T13:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [2, 5, 9, 14, 20, 26])
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  const mailbox = page.getByTestId('mailbox')
  await expect(mailbox).toHaveAttribute('data-waiting', 'false')
  await expect(page.getByTestId('mailbox-flag')).toHaveCount(0)
  await zoomToPlaza(page, 4)
  await finishAnimations(page)
  await expect(mailbox).toBeInViewport()
  const hit = (await mailbox.boundingBox())!
  expect(hit.width).toBeGreaterThanOrEqual(44)
  expect(hit.height).toBeGreaterThanOrEqual(44)

  // 누르면 편지 창. 아직 부친 편지가 없다
  await mailbox.click()
  await expect(page.getByTestId('letters')).toBeVisible()
  await expect(page.getByTestId('letters-none')).toHaveText('아직 부친 편지가 없어요')
  await expect(page.getByTestId('letter-send')).toBeDisabled()
  await expect(page.getByTestId('letter-wait-month')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('letter-wait-month')).toContainText('11월 28일')
  await expect(page.getByTestId('letter-wait-days100')).toContainText('2027년 2월 5일')
  await expect(page.getByTestId('letter-wait-year')).toContainText('2027년 10월 28일')
  for (const id of ['letter-wait-month', 'letter-wait-days100', 'letter-wait-year', 'letter-send', 'letters-close']) {
    const b = (await page.getByTestId(id).boundingBox())!
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.width).toBeLessThanOrEqual(390)
  }
  const text = '1년 뒤의 나에게\n오늘은 바다를 보고 왔어. 잘 지내고 있지?'
  await page.getByTestId('letter-input').fill(text)
  await page.getByTestId('letter-wait-year').click()
  await expect(page.getByTestId('letter-wait-year')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('letter-wait-month')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('letter-len')).toHaveText(`${[...text].length} / 200`)
  await page.screenshot({ path: 'test-results/screens/letters-write.png' })

  // 200자를 넘으면 부칠 수 없다
  await page.getByTestId('letter-input').fill('가'.repeat(201))
  await expect(page.getByTestId('letter-send')).toBeDisabled()
  await expect(page.getByTestId('letter-msg')).toHaveText('200자까지 쓸 수 있어요')
  await page.getByTestId('letter-input').fill(text)
  await page.getByTestId('letter-send').click()
  await expect(page.getByTestId('letters-msg')).toHaveText('📮 편지를 부쳤어요. 2027년 10월 28일에 열려요')
  await expect(page.getByTestId('letter-input')).toHaveValue('')
  // 기다리는 편지는 열리는 날만 보이고 글은 숨긴다
  let saved = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  const writtenAt: number = saved.letters[0].writtenAt
  expect(writtenAt).toBeGreaterThanOrEqual(Date.parse('2026-10-28T13:00:00+09:00'))
  const row = page.getByTestId(`letter-${writtenAt}`)
  await expect(row).toContainText('✉️ 2027년 10월 28일에 열려요')
  await expect(row).toContainText('10월 28일에 썼어요')
  await expect(page.getByTestId('letters')).not.toContainText('바다를 보고')
  await expect(page.getByTestId('letters-none')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/screens/letters-waiting.png' })

  // 저장: 편지 한 통, 일기는 그대로
  expect(saved.entries).toEqual(entries)
  expect(saved.letters).toEqual([{ writtenOn: '2026-10-28', writtenAt, opensOn: '2027-10-28', text }])

  // 창을 닫으면 우체통에 깃발이 선다. 집은 그대로
  await page.getByTestId('letters-close').click()
  await expect(page.getByTestId('letters')).toBeHidden()
  await expect(mailbox).toHaveAttribute('data-waiting', 'true')
  await expect(page.getByTestId('mailbox-flag')).toBeVisible()
  await expect(page.getByTestId('house-count')).toHaveText('🏠 6채')
  await page.evaluate(() => document.getAnimations().forEach((a) => ((a.currentTime = 0), a.pause())))
  await page.screenshot({ path: 'test-results/screens/mailbox-flag.png' })

  // 새로고침해도 남는다
  await page.reload()
  await expect(page.getByTestId('mailbox-flag')).toBeAttached()

  // 지우기는 한 번 더 묻는다. 그만두면 남고, 지우면 사라진다
  await zoomToPlaza(page, 4)
  await finishAnimations(page)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await mailbox.click()
  await finishAnimations(page)
  await page.getByTestId(`letter-erase-${writtenAt}`).click()
  await expect(page.getByTestId('letter-erase-note')).toHaveText('2027년 10월 28일에 열릴 편지예요. 읽지 않은 채로 지워져요. 지운 편지는 되돌릴 수 없어요.')
  await page.screenshot({ path: 'test-results/screens/letters-erase.png' })
  await page.getByTestId('letter-erase-cancel').click()
  await expect(row).toBeVisible()
  await page.getByTestId(`letter-erase-${writtenAt}`).click()
  await page.getByTestId('letter-erase-confirm').click()
  await expect(page.getByTestId('letters-msg')).toHaveText('🍂 편지를 지웠어요')
  await expect(page.getByTestId('letters-none')).toBeVisible()
  saved = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(saved).toEqual({ version: 1, entries })
  await page.getByTestId('letters-close').click()
  await expect(page.getByTestId('mailbox-flag')).toHaveCount(0)
})

test('열리는 날이 지난 편지는 우체통에서 열어 읽고, 받은 편지로 남아 다시 읽는다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T13:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [2, 5, 9])
  const arrived = { writtenOn: '2026-07-20', writtenAt: Date.parse('2026-07-20T22:00:00+09:00'), opensOn: '2026-10-28', text: '100일 뒤의 나야,\n여름엔 많이 지쳤었어. 지금은 괜찮지?' }
  const read = { writtenOn: '2025-09-01', writtenAt: Date.parse('2025-09-01T22:00:00+09:00'), opensOn: '2025-10-01', text: '한 달 뒤의 나에게 <b>안녕</b>', readAt: Date.parse('2025-10-01T09:00:00+09:00') }
  const waiting = { writtenOn: '2026-10-20', writtenAt: Date.parse('2026-10-20T22:00:00+09:00'), opensOn: '2026-11-20', text: '아직 열리면 안 되는 편지' }
  const letters = [read, arrived, waiting]
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries, letters })])
  await page.reload()
  // 앱을 열면 찾아오는 편지 카드는 "나중에"로 미뤄 두고 우체통에서 연다
  await page.getByTestId('arrival-later').click()
  await expect(page.getByTestId('letter-arrival')).toBeHidden()
  await expect(page.getByTestId('mailbox')).toHaveAttribute('data-waiting', 'true')
  await zoomToPlaza(page, 4)
  await finishAnimations(page)
  // 깃발이 살랑여 상자가 흔들리니 멈추고 누른다
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.getByTestId('mailbox').click()
  await finishAnimations(page)

  // 도착한 편지는 글을 숨긴 채 "열어 보기", 기다리는 편지도 글을 숨긴다
  await expect(page.getByTestId(`letter-${arrived.writtenAt}`)).toContainText('💌 100일 전의 내가 보낸 편지')
  await expect(page.getByTestId('letters')).not.toContainText('여름엔')
  await expect(page.getByTestId('letters')).not.toContainText('열리면 안 되는')
  // 받은 편지는 글이 그대로(꺾쇠도 글자 그대로) 보인다
  await expect(page.getByTestId(`letter-text-${read.writtenAt}`)).toHaveText(read.text)
  await expect(page.getByTestId(`letter-${read.writtenAt}`)).toContainText('💌 422일 전의 내가')
  const open = page.getByTestId(`letter-open-${arrived.writtenAt}`)
  expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: 'test-results/screens/letters-arrived.png' })

  await open.click()
  await expect(page.getByTestId('letters-arrived')).toHaveCount(0)
  await expect(page.getByTestId(`letter-text-${arrived.writtenAt}`)).toHaveText(arrived.text)
  await expect(page.getByTestId('letters')).not.toContainText('열리면 안 되는')
  await page.screenshot({ path: 'test-results/screens/letters-received.png' })
  const saved = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(saved.entries).toEqual(entries)
  expect(saved.letters[0]).toEqual(read)
  expect(saved.letters[2]).toEqual(waiting)
  expect(saved.letters[1]).toEqual({ ...arrived, readAt: saved.letters[1].readAt })
  expect(saved.letters[1].readAt).toBeGreaterThanOrEqual(Date.parse('2026-10-28T13:00:00+09:00'))
})

test('열리는 날 앱을 열면 잔치 카드 다음에 편지가 차례로 찾아오고, 연 편지만 읽음으로 남는다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T13:00:00+09:00') })
  await page.addInitScript(listenSound)
  await page.goto('./')
  // 첫 집을 지은 지 1년: 마을 생일 잔치
  const entries = [...monthEntries('2025-10', [28]), ...monthEntries('2026-10', [3, 9, 15])]
  const year = { writtenOn: '2025-10-28', writtenAt: Date.parse('2025-10-28T22:00:00+09:00'), opensOn: '2026-10-28', text: '1년 뒤의 나에게.\n첫 집을 지은 날이야. 마을은 얼마나 컸어?' }
  const summer = { writtenOn: '2026-07-20', writtenAt: Date.parse('2026-07-20T22:00:00+09:00'), opensOn: '2026-10-28', text: '여름의 내가 <b>안녕</b>' }
  const waiting = { writtenOn: '2026-10-20', writtenAt: Date.parse('2026-10-20T22:00:00+09:00'), opensOn: '2026-11-20', text: '아직 열리면 안 되는 편지' }
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries, letters: [year, summer, waiting] })])
  await page.reload()
  const arrival = page.getByTestId('letter-arrival')
  const stored = async () => JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  const notes = () => page.evaluate(() => (window as unknown as { notes: number[] }).notes.length)

  // 잔치 카드가 먼저, 닫으면 편지가 찾아온다
  await expect(page.getByTestId('celebrate')).toBeVisible()
  await expect(arrival).toBeHidden()
  await page.getByTestId('celebrate-close').click()
  await expect(arrival).toBeVisible()
  await expect(page.getByTestId('arrival-title')).toHaveText('365일 전의 내가 보낸 편지가 왔어요')
  await expect(page.getByTestId('arrival-body')).toHaveText('2025년 10월 28일에 미래의 나에게 부친 편지예요.')
  await expect(page.getByTestId('arrival-next')).toHaveText('편지가 1통 더 왔어요')
  // 열기 전에는 글이 보이지 않는다
  await expect(arrival).not.toContainText('첫 집을')
  for (const id of ['arrival-later', 'arrival-open']) {
    const b = page.getByTestId(id)
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await expect(b).toBeInViewport()
  }
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/letter-arrival.png' })

  // 열면 글과 축하 가락, 읽은 시각이 남는다
  const before = await notes()
  await page.getByTestId('arrival-open').click()
  await expect(page.getByTestId('arrival-text')).toHaveText(year.text)
  await expect(page.getByTestId('arrival-title')).toHaveText('💌 365일 전의 나에게서')
  await expect(page.getByTestId('arrival-next')).toHaveText('2025년 10월 28일에 썼어요')
  expect(await notes()).toBeGreaterThan(before)
  const next = page.getByTestId('arrival-done')
  await expect(next).toHaveText('다음 편지 (1통 더)')
  expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/letter-arrival-open.png' })
  let saved = await stored()
  expect(saved.entries).toEqual(entries)
  expect(saved.letters[0].readAt).toBeGreaterThanOrEqual(Date.parse('2026-10-28T13:00:00+09:00'))
  expect(saved.letters[1]).toEqual(summer)

  // 두 번째 편지는 "나중에": 우체통에 안 읽은 채 남는다
  await next.click()
  await expect(page.getByTestId('arrival-title')).toHaveText('100일 전의 내가 보낸 편지가 왔어요')
  await expect(page.getByTestId('arrival-next')).toHaveText('편지는 우체통에서 다시 읽을 수 있어요')
  await page.getByTestId('arrival-later').click()
  await expect(arrival).toBeHidden()
  saved = await stored()
  expect(saved.letters[1]).toEqual(summer)
  expect(saved.letters[2]).toEqual(waiting)

  // 다시 열면 아직 안 읽은 편지만 찾아온다(잔치 카드는 이번 열기에 다시 한 번)
  await page.reload()
  await page.getByTestId('celebrate-close').click()
  await expect(page.getByTestId('arrival-title')).toHaveText('100일 전의 내가 보낸 편지가 왔어요')
  await page.getByTestId('arrival-open').click()
  // 꺾쇠도 글자 그대로
  await expect(page.getByTestId('arrival-text')).toHaveText(summer.text)
  await expect(page.getByTestId('arrival-done')).toHaveText('고마워요')
  await page.getByTestId('arrival-done').click()
  await expect(arrival).toBeHidden()
  saved = await stored()
  expect(saved.letters[1].readAt).toBeGreaterThanOrEqual(Date.parse('2026-10-28T13:00:00+09:00'))

  // 모두 읽었으면 다시 열어도 편지 카드가 없다
  await page.reload()
  await page.getByTestId('celebrate-close').click()
  await page.waitForTimeout(300)
  await expect(arrival).toBeHidden()

  // 백업 내보내기에 편지(읽은 표시 포함)가 담기고, 가져오기는 폰의 편지를 지키며 새 편지만 더한다
  await page.getByTestId('settings-open').click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export').click()])
  const backup = JSON.parse(readFileSync(await download.path(), 'utf8'))
  saved = await stored()
  expect(backup.letters).toEqual(saved.letters)
  expect(backup.letters).toHaveLength(3)
  const extra = { writtenOn: '2026-09-01', writtenAt: Date.parse('2026-09-01T22:00:00+09:00'), opensOn: '2026-12-10', text: '백업에만 있는 편지' }
  const file = { version: 1, entries, letters: [summer, extra] }
  await page.getByTestId('backup-file').setInputFiles({ name: 'diary-village-2026-10-28.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
  // 새로 더할 날이 없어도 백업에만 있는 편지는 가져온다
  await expect(page.getByTestId('import-summary')).toContainText('미래의 나에게 쓴 편지 1통을 더해요.')
  await page.getByTestId('import-ok').click()
  await expect(page.getByTestId('settings')).toContainText('💌 편지 1통을 우체통에 넣었어요')
  await expect.poll(async () => (await stored()).letters.length).toBe(4)
  saved = await stored()
  expect(saved.entries).toEqual(entries)
  // 폰에서 읽은 표시는 그대로, 백업에만 있던 편지는 더해진다
  const byTime = (t: number) => saved.letters.find((l: { writtenAt: number }) => l.writtenAt === t)
  expect(byTime(summer.writtenAt).readAt).toBeGreaterThan(0)
  expect(byTime(extra.writtenAt)).toEqual(extra)
})

test('집을 눌러 읽으면 그날의 방이 보이고, 앞뒤로 넘기거나 고치면 방도 따라 바뀐다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const entries = [...monthEntries('2026-01', [14]), ...monthEntries('2026-10', [5, 9, 26])] as Entry[]
  const saved = JSON.stringify({ version: 1, entries })
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, saved])
  await page.reload()

  const room = page.getByTestId('reader-room')
  const expectRoom = async (entry: Entry) => {
    const r = roomOf(entry)
    await expect(room).toHaveAttribute('data-wall', r.wall)
    await expect(room).toHaveAttribute('data-floor', r.floor)
    await expect(page.getByTestId('room-window')).toHaveAttribute('data-view', r.view)
    await expect(page.getByTestId('room-curtain')).toHaveAttribute('fill', r.curtain)
    const items = await room.locator('.room-furn').evaluateAll((els) => els.map((e) => e.getAttribute('data-furn')))
    expect(items).toEqual(r.items) // 가구는 언제나 셋
  }
  const byDate = (d: string) => entries.find((e) => e.date === d)!

  await page.getByTestId('house-2026-10-09').dispatchEvent('click')
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 9일의 한 줄')
  await expectRoom(byDate('2026-10-09'))
  // 방은 창 안에 다 보이고, 글은 담지 않는다
  await page.waitForTimeout(400)
  const rb = (await room.boundingBox())!
  expect(rb.x).toBeGreaterThanOrEqual(0)
  expect(rb.x + rb.width).toBeLessThanOrEqual(390)
  expect(rb.y).toBeGreaterThanOrEqual(0)
  expect(await room.textContent()).not.toContain('한 줄')
  // 방 그림은 누르기를 막지 않는다(손가락은 창에 닿는다)
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('svg')?.getAttribute('data-testid') ?? null, [rb.x + rb.width / 2, rb.y + rb.height / 2])
  expect(hit).toBeNull()
  await page.screenshot({ path: 'test-results/screens/reader-room.png' })

  // 방 위를 밀어도 넘어간다
  const sheet = page.getByTestId('reader')
  const at = (px: number) => ({ pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: px, clientY: rb.y + rb.height / 2, bubbles: true })
  await sheet.dispatchEvent('pointerdown', at(rb.x + rb.width - 40))
  await sheet.dispatchEvent('pointerup', at(rb.x + 40))
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 26일의 한 줄')
  await expectRoom(byDate('2026-10-26'))

  // 고쳐서 빵집이 되면 대표 가구만 바뀌고 벽지·바닥·나머지 가구는 그대로
  const before = roomOf(byDate('2026-10-26'))
  await page.getByTestId('reader-edit').click()
  await expect(room).toHaveCount(0) // 고치기 창에는 방이 없다
  await page.getByTestId('edit-input').fill('갓 구운 빵 냄새가 좋았다')
  await page.getByTestId('edit-save').click()
  await expect(page.getByTestId('reader-building')).toContainText('빵집')
  const edited = { ...byDate('2026-10-26'), text: '갓 구운 빵 냄새가 좋았다' }
  await expectRoom(edited)
  const after = roomOf(edited)
  expect(after.items[0]).toBe('oven')
  expect([after.wall, after.floor, after.items[1], after.items[2]]).toEqual([before.wall, before.floor, before.items[1], before.items[2]])
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/screens/reader-room-bakery.png' })

  // 겨울 날은 창밖에 눈
  for (let i = 0; i < 3; i++) await page.getByTestId('reader-prev').click()
  await expect(page.getByTestId('reader-text')).toHaveText('2026-01 14일의 한 줄')
  await expectRoom(byDate('2026-01-14'))
  await expect(page.getByTestId('room-window')).toHaveAttribute('data-view', 'winter')
  await page.clock.runFor(1500)
  await page.screenshot({ path: 'test-results/screens/reader-room-winter.png' })
})

test('건물 16종의 방에는 저마다 대표 가구가 그림으로 놓이고, 방은 창 안에 다 보인다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const words = ['커피', '책', '운동', '고양이', '강아지', '꽃', '빵', '바다', '음악', '영화', '김밥', '산책', '공부', '기차', '그림', '텃밭']
  const entries = monthEntries('2026-10', words.map((_, i) => i + 1)).map((e, i) => ({ ...e, text: `${words[i]} 생각이 난 하루` })) as Entry[]
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()

  const room = page.getByTestId('reader-room')
  await page.getByTestId('house-2026-10-01').dispatchEvent('click')
  const seen = new Set<string>()
  for (const [i, entry] of entries.entries()) {
    if (i > 0) await page.getByTestId('reader-next').click()
    await expect(page.getByTestId('reader-text')).toHaveText(entry.text)
    const sig = roomOf(entry).items[0]
    await expect(room.locator('.room-furn').first()).toHaveAttribute('data-furn', sig)
    seen.add(sig)
    // 대표 가구는 받침대 위 표시가 아니라 그린 그림이다(방 안에 글자가 없다)
    await expect(room.locator('text')).toHaveCount(0)
    await page.waitForTimeout(350)
    const rb = (await room.boundingBox())!
    expect(rb.x).toBeGreaterThanOrEqual(0)
    expect(rb.x + rb.width).toBeLessThanOrEqual(390)
    // 대표 가구는 방 그림 밖으로 삐져나오지 않는다
    const fb = (await room.locator('.room-furn').first().boundingBox())!
    expect(fb.y).toBeGreaterThanOrEqual(rb.y)
    expect(fb.x).toBeGreaterThanOrEqual(rb.x)
    await room.screenshot({ path: `test-results/screens/room-${sig}.png` })
  }
  expect(seen.size).toBe(16)
  await page.screenshot({ path: 'test-results/screens/reader-room-farm.png' })
})
