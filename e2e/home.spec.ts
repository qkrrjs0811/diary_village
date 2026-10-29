import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { BUILDING_PROMPTS, PROMPTS, SEASON_PROMPTS, YESTERDAY_PROMPTS, todayPrompt, yesterdayPrompt } from '../src/core/prompt'
import { roomOf } from '../src/core/interior'
import { birdFlock, critters } from '../src/core/critter'
import { buildVillage } from '../src/core/village'
import { yardOf } from '../src/core/yard'
import { GROWTH_CALM_MS, growthDelays, growthNote, growthScenes, growthSteps } from '../src/core/growth'
import type { Entry } from '../src/core/types'
import { STORIES } from '../src/core/friendship'

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
/** 1·2·3·5일째 첫 주 선물 축하 카드가 떴는지 보고 닫는다 */
async function closeGift(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('celebrate-title')).toContainText('선물')
  await page.getByTestId('celebrate-close').click()
  await expect(page.getByTestId('celebrate')).toBeHidden()
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
  // 첫날 선물: 첫 집 옆 기념 팻말
  await expect(page.getByTestId('celebrate-title')).toHaveText('🎁 첫 선물이 왔어요!')
  await expect(page.getByTestId('celebrate-body')).toHaveText('첫 집을 지었어요. 집 옆에 🪧 기념 팻말을 세웠어요.')
  await expect(page.getByTestId('celebrate-next')).toHaveText('다음 선물은 1일 더 쓰면 화분이에요')
  await expect(page.getByTestId('celebrate-go')).toHaveCount(0)
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/gift-first.png' })
  await page.getByTestId('celebrate-close').click()
  await expect(page.getByTestId('first-sign')).toHaveAttribute('data-date', '2026-10-27')
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
  // 네 음, 음마다 바탕음과 옅은 배음. 울적한 날은 A 단조 오음(A4~A5). 그 뒤는 첫 선물 축하 가락
  const notes = (await page.evaluate(() => (window as unknown as { notes: number[] }).notes)).slice(0, 8)
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
  await closeGift(page)
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

test('구역 이름표를 누르면 그달 기분 달력 한 달 보기가 열리고, 끌면 열리지 않는다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-20T12:00:00+09:00') })
  await page.goto('./')
  const entries = [...monthEntries('2026-10', [1, 2, 3, 5, 8, 9, 14, 20, 21, 27]), ...monthEntries('2026-11', [2, 4, 9, 13, 18])]
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await expect(page.getByTestId('house-count')).toHaveText(`🏠 ${entries.length}채`)
  await finishAnimations(page)
  const cal = page.getByTestId('calendar')
  // 누르는 자리는 44px 이상
  const hit = page.getByTestId('month-hit-2026-11')
  await expect(hit).toBeInViewport()
  const hb = (await hit.boundingBox())!
  expect(hb.width).toBeGreaterThanOrEqual(44)
  expect(hb.height).toBeGreaterThanOrEqual(44)
  // 팻말에서 끌기 시작하면 둘러보기만 하고 달력은 열리지 않는다
  const sb = (await page.getByTestId('month-2026-11').boundingBox())!
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2)
  await page.mouse.down()
  await page.mouse.move(sb.x + sb.width / 2 + 60, sb.y + sb.height / 2 + 40, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  await expect(cal).toBeHidden()
  // 누르면 그달 달력이 열리고, 거기서 이어 읽기로 이어진다
  await page.getByTestId('month-2026-11').click()
  await expect(cal).toBeVisible()
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년 11월')
  await expect(page.getByTestId('calendar-count')).toHaveText('한 줄 5일')
  await expect(page.getByTestId('calendar-chapter')).toBeVisible()
  await page.getByTestId('calendar-close').click()
  await expect(cal).toBeHidden()
  // 멀리 봐서 지난 구역 팻말을 누르면 그달이 열린다
  const box = (await page.getByTestId('village').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 200)
  await page.waitForTimeout(300)
  await expect(page.getByTestId('month-2026-10')).toBeInViewport()
  await page.screenshot({ path: 'test-results/screens/month-sign-tap-far.png' })
  await page.getByTestId('month-2026-10').click()
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년 10월')
  await expect(page.getByTestId('calendar-count')).toHaveText('한 줄 10일')
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/month-sign-calendar.png' })
})

test('구역 이름표 기둥은 둘레 집 높이에 맞춰, 빈 구역·낮은 구역은 짧고 빽빽한 구역은 지붕 위로 선다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-12-03T12:00:00+09:00') })
  await page.goto('./')
  // 9월은 앞쪽에 두 채뿐, 11월은 일요일부터 날마다(첫 줄 등대), 12월은 아직 빈 구역
  const entries = [
    ...monthEntries('2026-09', [24, 29]),
    ...monthEntries('2026-10', [1, 2, 3, 5, 8, 9, 14, 20, 21, 27]),
    ...monthEntries('2026-11', Array.from({ length: 30 }, (_, i) => i + 1)).map((e, i) => (i < 7 ? { ...e, text: `바닷가 ${e.text}` } : e)),
  ]
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await expect(page.getByTestId('house-count')).toHaveText(`🏠 ${entries.length}채`)
  const lift = async (m: string) => Number(await page.getByTestId(`month-${m}`).getAttribute('data-lift'))
  expect(await lift('2026-12')).toBe(24)
  expect(await lift('2026-09')).toBe(24)
  expect(await lift('2026-11')).toBeGreaterThan(await lift('2026-10'))
  expect(await lift('2026-11')).toBeLessThanOrEqual(62)
  // 제 구역 집 지붕은 가리지 않는다
  for (const m of ['2026-09', '2026-10', '2026-11']) {
    const s = (await page.getByTestId(`month-${m}`).boundingBox())!
    const own = await page.locator(`[data-testid^="house-${m}"]`).evaluateAll((list) => list.map((h) => h.getBoundingClientRect().toJSON()))
    const hit = own.filter((h) => h.x < s.x + s.width && s.x < h.x + h.width && h.y < s.y + s.height && s.y < h.y + h.height)
    expect(hit).toEqual([])
  }
  // 멀리 봐서 여러 구역 팻말을 함께 찍는다
  const box = (await page.getByTestId('village').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 200)
  await page.waitForTimeout(300)
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/month-sign-far.png' })
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

test('집이 몇 채 없을 때 처음 열면 그 집들과 오늘 자리가 화면에 꽉 차게 보인다', async ({ page }) => {
  // 화요일에 처음 써서 금요일인 오늘까지 — 집 셋과 오늘 자리가 한 줄에 선다
  await page.clock.install({ time: new Date('2026-10-23T21:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [20, 21, 22])
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  const scene = (await page.getByTestId('village').boundingBox())!
  const ids = ['house-2026-10-20', 'house-2026-10-21', 'house-2026-10-22', 'today-spot', 'first-sign', 'month-2026-10']
  const boxes = await Promise.all(ids.map(async (id) => (await page.getByTestId(id).boundingBox())!))
  // 이달 이름표까지 모두 화면 안에 들어오고
  for (const b of boxes) {
    expect(b.x).toBeGreaterThanOrEqual(scene.x)
    expect(b.x + b.width).toBeLessThanOrEqual(scene.x + scene.width)
    expect(b.y).toBeGreaterThanOrEqual(scene.y)
    expect(b.y + b.height).toBeLessThanOrEqual(scene.y + scene.height)
  }
  // 집이 처음 보기(칸 약 80px)보다 크게, 묶음이 화면 가로를 넉넉히 채운다
  expect(boxes[2].width).toBeGreaterThan(85)
  const left = Math.min(...boxes.map((b) => b.x))
  const right = Math.max(...boxes.map((b) => b.x + b.width))
  expect(right - left).toBeGreaterThan(scene.width * 0.6)
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/home-few-houses.png' })
})

for (const [name, days] of [['first', [27]], ['week', [21, 22, 23, 24, 25, 26, 27]]] as const) {
  test(`${name}: 끝까지 멀리 보면 마을(섬)이 화면 가운데에 알맞은 크기로 온다`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
    await page.goto('./')
    const entries = monthEntries('2026-10', [...days])
    await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
    await page.reload()
    const scene = (await page.getByTestId('village').boundingBox())!
    // 한쪽 구석에서 줄이기 시작해도
    await page.mouse.move(scene.x + 40, scene.y + scene.height - 60)
    for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 300)
    await finishAnimations(page)
    const land = (await page.locator('[data-testid="village"] .ground').boundingBox())!
    // 섬 전체가 화면 안에 들고
    expect(land.x).toBeGreaterThanOrEqual(scene.x)
    expect(land.x + land.width).toBeLessThanOrEqual(scene.x + scene.width)
    expect(land.y).toBeGreaterThanOrEqual(scene.y)
    expect(land.y + land.height).toBeLessThanOrEqual(scene.y + scene.height)
    // 가운데에 오며
    expect(Math.abs(land.x + land.width / 2 - (scene.x + scene.width / 2))).toBeLessThan(4)
    expect(Math.abs(land.y + land.height / 2 - (scene.y + scene.height / 2))).toBeLessThan(4)
    // 너무 작지 않게 화면 가로를 넉넉히 채운다
    expect(land.width).toBeGreaterThan(scene.width * 0.6)
    // 더 줄여도 그대로다
    await page.mouse.wheel(0, 300)
    expect((await page.locator('[data-testid="village"] .ground').boundingBox())!.width).toBeCloseTo(land.width, 0)
    await page.screenshot({ path: `test-results/screens/zoom-far-${name}.png` })
  })
}

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
  // 다섯째 날이라 새 이웃 보리가 광장으로 들어오는 것까지 보고 돌아온다
  await page.clock.runFor(4000)
  // 다섯째 날 선물(꽃밭)을 닫으면 새 이웃이 들어온다
  await closeGift(page)
  await page.clock.runFor(3500)
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
  await closeGift(page)
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

test('"＋ 더 쓰기"로 긴 글을 한 줄과 함께 남기고, 고치기에서도 이어 쓴다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [20, 22, 24, 25, 26])
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()

  // 처음엔 접혀 있고, 단추는 누르기 넉넉한 크기다
  const toggle = page.getByTestId('write-more-toggle')
  await expect(toggle).toHaveText('＋ 더 쓰기')
  await expect(page.getByTestId('write-more')).toBeHidden()
  const box = (await toggle.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(box.width).toBeGreaterThanOrEqual(44)
  await toggle.click()
  await expect(page.getByTestId('write-more')).toBeFocused()
  await expect(toggle).toHaveText('접어 두기')

  await page.getByTestId('write-input').fill('바다에 다녀왔다')
  await page.getByTestId('mood-calm').click()
  // 줄바꿈은 그대로 쓰고, 엔터로 집을 짓지 않는다
  await page.getByTestId('write-more').fill('아침 기차를 탔다.')
  await page.getByTestId('write-more').press('Enter')
  await page.getByTestId('write-more').pressSequentially('파도 소리가 오래 남았다.')
  await expect(page.getByTestId('house-2026-10-27')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/screens/write-more.png' })

  // 너무 길면 다정하게 알려 주고 짓지 않는다
  await page.getByTestId('write-more').fill('가'.repeat(2001))
  await expect(page.getByTestId('write-more-msg')).toHaveText('조금만 줄여 주세요 · 2000자까지 담겨요')
  await expect(page.getByTestId('write-more-len')).toHaveText('2001 / 2000')
  await expect(page.getByTestId('write-submit')).toBeDisabled()
  await page.screenshot({ path: 'test-results/screens/write-more-long.png' })

  // 접어 두어도 쓴 글은 남는다
  await page.getByTestId('write-more').fill('아침 기차를 탔다.\n파도 소리가 오래 남았다.')
  await expect(page.getByTestId('write-more-msg')).toHaveText('')
  await toggle.click()
  await expect(toggle).toHaveText('📝 더 쓴 글')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('house-2026-10-27')).toBeVisible()
  // 긴 글을 써도 집은 한 채, 한 줄에서만 건물을 찾는다
  await expect(page.getByTestId('house-count')).toHaveText('🏠 6채')
  let saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  let today = saved.entries.find((e: { date: string }) => e.date === '2026-10-27')
  expect(today).toMatchObject({ text: '바다에 다녀왔다', mood: 'calm', more: '아침 기차를 탔다.\n파도 소리가 오래 남았다.' })

  // 고치기: 긴 글이 있으면 펼친 채로 열리고, 한 줄만 고쳐도 긴 글은 그대로다
  await page.clock.runFor(4000)
  await page.getByTestId('today-line').click()
  await page.getByTestId('reader-edit').click()
  await expect(page.getByTestId('edit-more')).toBeVisible()
  await expect(page.getByTestId('edit-more')).toHaveValue('아침 기차를 탔다.\n파도 소리가 오래 남았다.')
  await page.screenshot({ path: 'test-results/screens/reader-edit-more.png' })
  await page.getByTestId('edit-input').fill('바다에 다녀온 날')
  await page.getByTestId('edit-save').click()
  saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  today = saved.entries.find((e: { date: string }) => e.date === '2026-10-27')
  expect(today).toMatchObject({ text: '바다에 다녀온 날', more: '아침 기차를 탔다.\n파도 소리가 오래 남았다.' })

  // 긴 글을 비우면 걷힌다
  await page.getByTestId('reader-edit').click()
  await page.getByTestId('edit-more').fill('')
  await page.getByTestId('edit-save').click()
  await page.getByTestId('reader-close').click()

  // 긴 글이 없던 날은 고치기에서 "＋ 더 쓰기"로 이어 쓴다
  await page.getByTestId('house-2026-10-26').click()
  await page.getByTestId('reader-edit').click()
  await expect(page.getByTestId('edit-more')).toBeHidden()
  await page.getByTestId('edit-more-toggle').click()
  await page.getByTestId('edit-more').fill('저녁엔 국수를 먹었다.')
  await page.getByTestId('edit-save').click()
  await expect(page.getByTestId('reader-text')).toHaveText(entries.find((e) => e.date === '2026-10-26')!.text)

  await page.reload()
  saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  today = saved.entries.find((e: { date: string }) => e.date === '2026-10-27')
  expect(today.more).toBeUndefined()
  expect(saved.entries.find((e: { date: string }) => e.date === '2026-10-26').more).toBe('저녁엔 국수를 먹었다.')
})

/** 폰 안 사진 보관함에서 그날 사진을 읽는다(없으면 null) */
const storedPhoto = (page: import('@playwright/test').Page, date: string) =>
  page.evaluate(
    (d) =>
      new Promise<string | null>((ok) => {
        const req = indexedDB.open('diary-village:photos')
        req.onsuccess = () => {
          const db = req.result
          const get = db.transaction('photos').objectStore('photos').get(d)
          get.onsuccess = () => {
            ok(get.result?.data ?? null)
            db.close()
          }
        }
      }),
    date,
  )
/** 큰 사진 하나(가로 1600 × 세로 1200, 파스텔 하늘·언덕·해)를 png 파일로 만든다 */
async function bigPhoto(page: import('@playwright/test').Page, sun = '#f6c96b') {
  const data = await page.evaluate((sunColor) => {
    const c = document.createElement('canvas')
    c.width = 1600
    c.height = 1200
    const x = c.getContext('2d')!
    x.fillStyle = '#bfe0f0'
    x.fillRect(0, 0, 1600, 1200)
    x.fillStyle = sunColor
    x.beginPath()
    x.arc(1150, 380, 170, 0, Math.PI * 2)
    x.fill()
    x.fillStyle = '#a9d8a6'
    x.beginPath()
    x.ellipse(500, 1200, 900, 480, 0, 0, Math.PI * 2)
    x.fill()
    x.fillStyle = '#e8a8a0'
    x.fillRect(420, 640, 260, 220)
    return c.toDataURL('image/png').split(',')[1]
  }, sun)
  return { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') }
}

test('"📷 사진"으로 그날에 사진을 붙이고, 읽기 창에 폴라로이드로 보이며, 고치기·지우기에서 바꾸고 뗀다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [20, 22, 24, 25, 26])
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()

  // "📷 사진"은 쓰기 칸 안내 줄 안의 작은 단추. 누르기 넉넉하고 "더 쓰기"와 겹치지 않는다
  const button = page.getByTestId('write-photo')
  await expect(button).toHaveText('📷 사진')
  const box = (await button.boundingBox())!
  const more = (await page.getByTestId('write-more-toggle').boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.x).toBeGreaterThanOrEqual(more.x + more.width - 1)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await expect(page.getByTestId('write-photo-thumb')).toBeHidden()
  await page.screenshot({ path: 'test-results/screens/write-photo-button.png' })

  // 사진을 고르면 폰 안에서 줄여 붙이고, 한 줄은 짧게 써도 된다고 알려 준다
  await page.getByTestId('write-photo-file').setInputFiles(await bigPhoto(page))
  await expect(page.getByTestId('write-photo-thumb')).toBeVisible()
  await expect(button).toHaveText('📷 바꾸기')
  await expect(page.getByTestId('write-input')).toHaveAttribute('placeholder', '사진에 한마디만 붙여도 돼요')
  await page.getByTestId('mood-great').click()
  await page.screenshot({ path: 'test-results/screens/write-photo.png' })

  // 떼었다가 다시 붙일 수 있다
  await page.getByTestId('write-photo-remove').click()
  await expect(page.getByTestId('write-photo-thumb')).toBeHidden()
  await expect(button).toHaveText('📷 사진')
  await page.getByTestId('write-photo-file').setInputFiles(await bigPhoto(page))
  await expect(page.getByTestId('write-photo-thumb')).toBeVisible()

  await page.getByTestId('write-input').fill('바다')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('house-2026-10-27')).toBeVisible()
  // 사진이 있어도 집은 한 채이고, 저장 원본에는 사진이 들어가지 않는다
  await expect(page.getByTestId('house-count')).toHaveText('🏠 6채')
  const saved = await page.evaluate((k) => localStorage.getItem(k)!, KEY)
  expect(saved).not.toContain('data:image')
  // 폰 안 보관함에 줄인 jpeg 로 담긴다(긴 변 1080)
  await expect.poll(() => storedPhoto(page, '2026-10-27')).toMatch(/^data:image\/jpeg;base64,/)
  const size = await page.evaluate(async (src) => {
    const img = new Image()
    img.src = src
    await img.decode()
    return [img.naturalWidth, img.naturalHeight]
  }, (await storedPhoto(page, '2026-10-27'))!)
  expect(size).toEqual([1080, 810])

  // 읽기 창: 내 글 바로 위에 폴라로이드
  await page.clock.runFor(4000)
  await page.getByTestId('today-line').click()
  const photo = page.getByTestId('reader-photo')
  await expect(photo).toBeVisible()
  await expect(page.getByTestId('reader-text')).toHaveText('바다')
  const frame = (await photo.boundingBox())!
  const text = (await page.getByTestId('reader-text').boundingBox())!
  expect(frame.y + frame.height).toBeLessThanOrEqual(text.y + 4)
  for (const id of ['reader-edit', 'reader-close']) await expect(page.getByTestId(id)).toBeInViewport({ ratio: 1 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/screens/reader-photo.png' })

  // 고치기에서 사진을 뗀다. 글은 그대로다
  await page.getByTestId('reader-edit').click()
  await expect(page.getByTestId('edit-photo-thumb')).toBeVisible()
  await expect(page.getByTestId('edit-photo')).toHaveText('📷 바꾸기')
  await page.screenshot({ path: 'test-results/screens/reader-edit-photo.png' })
  await page.getByTestId('edit-photo-remove').click()
  await page.getByTestId('edit-save').click()
  await expect(photo).toBeHidden()
  await expect(page.getByTestId('reader-text')).toHaveText('바다')
  await expect.poll(() => storedPhoto(page, '2026-10-27')).toBeNull()
  await page.getByTestId('reader-close').click()

  // 사진이 없던 날에 고치기로 붙이면, 다시 열어도 남아 있다
  await page.getByTestId('house-2026-10-26').dispatchEvent('click')
  await expect(photo).toBeHidden()
  await page.getByTestId('reader-edit').click()
  await expect(page.getByTestId('edit-photo')).toHaveText('📷 사진')
  await page.getByTestId('edit-photo-file').setInputFiles(await bigPhoto(page, '#f3a6b8'))
  await expect(page.getByTestId('edit-photo-thumb')).toBeVisible()
  await page.getByTestId('edit-save').click()
  await expect(photo).toBeVisible()
  await expect.poll(() => storedPhoto(page, '2026-10-26')).toMatch(/^data:image\/jpeg;base64,/)
  await page.reload()
  await page.waitForTimeout(500) // 사진 보관함을 여는 동안
  await page.getByTestId('house-2026-10-26').dispatchEvent('click')
  await expect(photo).toBeVisible()

  // 글을 지우면 사진도 함께. 확인 문구에 사진도 적혀 있다
  await page.getByTestId('reader-erase').click()
  await expect(page.getByTestId('erase-note')).toContainText('지운 글과 사진은 되돌릴 수 없어요')
  await page.getByTestId('erase-confirm').click()
  await expect(page.getByTestId('house-2026-10-26')).toHaveCount(0)
  await expect.poll(() => storedPhoto(page, '2026-10-26')).toBeNull()
  // 사진이 없는 날의 지우기 문구는 그대로다
  await page.getByTestId('house-2026-10-25').dispatchEvent('click')
  await page.getByTestId('reader-erase').click()
  await expect(page.getByTestId('erase-note')).toContainText('지운 글은 되돌릴 수 없어요')
})

test('사진도 백업 파일에 담기고, 새 폰에 가져오면 그날에 다시 붙는다. 설정 창에 "사진 N장 · 폰에 보관 중"', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [20, 22, 24, 25, 26])
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()

  // 사진이 없으면 설정 창에 사진 줄이 없다
  await page.getByTestId('settings-open').click()
  await expect(page.getByTestId('photo-note')).toBeHidden()
  await page.getByTestId('settings-close').click()

  await page.getByTestId('write-photo-file').setInputFiles(await bigPhoto(page))
  await expect(page.getByTestId('write-photo-thumb')).toBeVisible()
  await page.getByTestId('mood-great').click()
  await page.getByTestId('write-input').fill('바다')
  await page.getByTestId('write-submit').click()
  await expect.poll(() => storedPhoto(page, '2026-10-27')).toMatch(/^data:image\/jpeg;base64,/)
  const photo = (await storedPhoto(page, '2026-10-27'))!
  await page.clock.runFor(4000)

  // 설정 창: 사진 수와 백업 안내
  await page.getByTestId('settings-open').click()
  await expect(page.getByTestId('photo-note')).toHaveText('📷 사진 1장 · 폰에 보관 중이에요. 백업 파일에 함께 담겨요')
  for (const id of ['backup-export', 'backup-import', 'settings-close']) await expect(page.getByTestId(id)).toBeInViewport({ ratio: 1 })
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/settings-photos.png' })

  // 내려받은 파일에 사진이 담긴다. 저장 원본에는 여전히 없다
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export').click()])
  const backup = JSON.parse(readFileSync(await download.path(), 'utf8'))
  expect(backup.photos).toEqual({ '2026-10-27': photo })
  expect(await page.evaluate((k) => localStorage.getItem(k)!, KEY)).not.toContain('data:image')

  // 새 폰처럼 글도 사진도 비운 뒤 가져온다
  await page.evaluate(
    (k) =>
      new Promise<void>((ok) => {
        localStorage.removeItem(k)
        const req = indexedDB.deleteDatabase('diary-village:photos')
        req.onsuccess = () => ok()
        req.onerror = () => ok()
      }),
    KEY,
  )
  await page.reload()
  await page.waitForTimeout(500) // 사진 보관함을 여는 동안
  await page.getByTestId('settings-open').click()
  await expect(page.getByTestId('photo-note')).toBeHidden()
  await page.getByTestId('backup-file').setInputFiles({ name: 'diary-village-2026-10-27.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await expect(page.getByTestId('import-summary')).toContainText('사진 1장도 그날에 붙여요.')
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/import-photos.png' })
  await page.getByTestId('import-ok').click()
  await expect(page.getByTestId('settings-msg')).toHaveText('🏠 6일의 집을 다시 지었어요')
  await expect.poll(() => storedPhoto(page, '2026-10-27')).toBe(photo)
  await expect(page.getByTestId('photo-note')).toContainText('📷 사진 1장')
  await page.getByTestId('settings-close').click()
  await page.getByTestId('house-2026-10-27').dispatchEvent('click')
  await expect(page.getByTestId('reader-photo')).toBeVisible()
  await page.getByTestId('reader-close').click()

  // 같은 파일을 다시 가져오면 더할 것이 없다(사진도 겹쳐 붙이지 않는다)
  await page.getByTestId('settings-open').click()
  await expect(page.getByTestId('photo-note')).toContainText('📷 사진 1장')
  await page.getByTestId('backup-file').setInputFiles({ name: 'diary-village-2026-10-27.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await expect(page.getByTestId('import-summary')).not.toContainText('사진')
  await expect(page.getByTestId('import-ok')).toBeDisabled()

  // 사진이 없는 이전 백업도 그대로 읽힌다
  await page.getByTestId('import-cancel').click()
  const old = { version: 1, entries: [...entries, { date: '2026-10-21', text: '옛 백업의 한 줄', mood: 'calm', writtenAt: 1 }] }
  await page.getByTestId('backup-file').setInputFiles({ name: 'diary-village-old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) })
  await expect(page.getByTestId('import-summary')).toContainText('그중 1일을 마을에 더해요.')
  await page.getByTestId('import-ok').click()
  await expect(page.getByTestId('settings-msg')).toHaveText('🏠 1일의 집을 다시 지었어요')
  await expect.poll(() => storedPhoto(page, '2026-10-27')).toBe(photo)
})

test('사진을 붙인 날 집 마당에 작은 액자가 서고, 기분 달력 "📷 사진"에서 모아 보다가 누르면 그 집 글을 연다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T14:00:00+09:00') })
  await page.goto('./')
  const entries = (monthEntries('2026-10', [20, 22, 24, 25, 26]) as Entry[]).map((e): Entry => (e.date === '2026-10-25' ? { ...e, treasured: true } : e))
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  const openCalendar = async () => {
    await page.getByTestId('village-stage').click()
    await page.getByTestId('book-calendar').click()
    await page.getByTestId('calendar').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  }

  // 사진이 없으면 액자가 없고, 사진 갈래는 다정하게 비어 있다
  await expect(page.getByTestId('write-photo')).toBeVisible()
  await expect(page.locator('.photo-frame')).toHaveCount(0)
  await openCalendar()
  await page.getByTestId('calendar-mode-photo').click()
  await expect(page.getByTestId('photo-count')).toContainText('아직 사진을 붙인 날이 없어요')
  await page.getByTestId('calendar-close').click()

  // 오늘 사진과 함께 쓰면 새 집 마당에 액자가 선다
  await page.getByTestId('write-photo-file').setInputFiles(await bigPhoto(page))
  await expect(page.getByTestId('write-photo-thumb')).toBeVisible()
  await page.getByTestId('mood-great').click()
  await page.getByTestId('write-input').fill('바다')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('photo-frame-2026-10-27')).toHaveCount(1)
  await page.clock.runFor(4000)

  // 지난날에 고치기로 붙여도 바로 선다
  await page.getByTestId('house-2026-10-25').dispatchEvent('click')
  await page.getByTestId('reader-edit').click()
  await page.getByTestId('edit-photo-file').setInputFiles(await bigPhoto(page, '#f3a6b8'))
  await expect(page.getByTestId('edit-photo-thumb')).toBeVisible()
  await page.getByTestId('edit-save').click()
  await expect(page.getByTestId('photo-frame-2026-10-25')).toHaveCount(1)
  await page.getByTestId('reader-close').click()

  // 새로고침하면 보관함을 연 뒤 액자가 다시 선다. 액자는 누르기를 가로막지 않는다
  await page.reload()
  await expect(page.locator('.photo-frame')).toHaveCount(2)
  const caught = await page.getByTestId('photo-frame-2026-10-25').evaluate((f) => {
    const r = f.getBoundingClientRect()
    return !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.photo-frame')
  })
  expect(caught).toBe(false)
  await expect(page.getByTestId('house-2026-10-25')).toHaveAttribute('data-building', 'house')
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/photo-frames.png' })

  // 달력 "📷 사진": 사진 붙은 날을 최근 날부터 작은 폴라로이드로
  await openCalendar()
  const mode = page.getByTestId('calendar-mode-photo')
  await mode.click()
  await expect(mode).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('calendar-days')).toHaveCount(0)
  await expect(page.getByTestId('photo-count')).toHaveText('📷 사진 붙인 날 2일')
  const list = page.getByTestId('photo-list').locator('.cal-photo')
  await expect(list).toHaveCount(2)
  await expect(list.nth(0)).toHaveAttribute('data-testid', 'photo-hit-2026-10-27')
  await expect(list.nth(1)).toHaveAttribute('data-testid', 'photo-hit-2026-10-25')
  await expect(list.nth(0)).toContainText('10월 27일')
  await expect(list.nth(0)).toContainText('바다')
  await expect(list.nth(0).locator('img')).toHaveJSProperty('complete', true)
  for (const id of ['photo-hit-2026-10-27', 'photo-hit-2026-10-25', 'calendar-mode-month', 'calendar-mode-year', 'calendar-mode-treasure', 'calendar-mode-photo', 'calendar-close']) {
    const box = (await page.getByTestId(id).boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    await expect(page.getByTestId(id)).toBeInViewport()
  }
  await page.screenshot({ path: 'test-results/screens/calendar-photos.png' })

  // 누르면 창을 닫고 그 집 글을 연다
  await page.getByTestId('photo-hit-2026-10-25').click()
  await expect(page.getByTestId('calendar')).toBeHidden()
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 25일의 한 줄')
  await expect(page.getByTestId('reader-photo')).toBeVisible()

  // 사진을 떼면 액자도 걷힌다. 글은 그대로다
  await page.getByTestId('reader-edit').click()
  await page.getByTestId('edit-photo-remove').click()
  await page.getByTestId('edit-save').click()
  await expect(page.getByTestId('photo-frame-2026-10-25')).toHaveCount(0)
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 25일의 한 줄')
  expect(await page.evaluate((k) => localStorage.getItem(k)!, KEY)).not.toContain('data:image')
})

test('더 쓴 글은 읽기 창에 줄바꿈 그대로 보이고, 찾기에 조각으로 나오며, 백업으로 돌아온다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const long = Array.from({ length: 24 }, (_, i) => `${i + 1}번째 줄 · 바닷가 모래가 따뜻했다.`).join('\n') + '\n저녁엔 <b>조개</b> 국수를 먹었다.'
  const entries = monthEntries('2026-10', [20, 24, 25, 26]).map((e) => (e.date === '2026-10-25' ? { ...e, more: long } : e))
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()

  // 읽기 창: 한 줄 아래에 긴 글이 줄바꿈 그대로, 창 안에서만 굴러간다
  await page.getByTestId('house-2026-10-25').dispatchEvent('click')
  const more = page.getByTestId('reader-more')
  await expect(page.getByTestId('reader-text')).toHaveText(entries[2].text)
  await expect(more).toBeVisible()
  expect(await more.evaluate((el) => (el as HTMLElement).innerText)).toBe(long)
  await expect(more).toContainText('<b>조개</b>')
  const scroll = await more.evaluate((el) => ({ h: el.clientHeight, sh: el.scrollHeight }))
  expect(scroll.sh).toBeGreaterThan(scroll.h)
  // 단추는 창 안에 다 보인다
  for (const id of ['reader-prev', 'reader-next', 'reader-edit', 'reader-close']) {
    await expect(page.getByTestId(id)).toBeInViewport({ ratio: 1 })
  }
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/screens/reader-more.png' })

  // 넘기면 긴 글이 없는 날은 칸이 사라지고, 돌아오면 다시 보인다
  await page.getByTestId('reader-next').click()
  await expect(page.getByTestId('reader-text')).toHaveText(entries[3].text)
  await expect(more).toBeHidden()
  const sheet = page.getByTestId('reader')
  const at = (px: number) => ({ pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: px, clientY: 600, bubbles: true })
  await sheet.dispatchEvent('pointerdown', at(60))
  await sheet.dispatchEvent('pointerup', at(300))
  await expect(page.getByTestId('reader-text')).toHaveText(entries[2].text)
  await expect(more).toBeVisible()
  await page.getByTestId('reader-close').click()

  // 찾기: 긴 글에서만 나온 말은 한 줄 아래 조각으로 칠해진다
  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-calendar').click()
  await page.getByTestId('calendar-search').fill('조개')
  await expect(page.getByTestId('search-count')).toHaveText('"조개" · 한 줄 1개를 찾았어요')
  const piece = page.getByTestId('hit-more-2026-10-25')
  await expect(piece).toBeVisible()
  await expect(piece.locator('mark')).toHaveText('조개')
  await expect(piece).toContainText('<b>')
  await expect(page.getByTestId('hit-2026-10-25')).toContainText(entries[2].text)
  await finishAnimations(page)
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/screens/search-more.png' })
  await page.getByTestId('hit-2026-10-25').click()
  await expect(page.getByTestId('reader-more')).toBeVisible()
  await page.getByTestId('reader-close').click()

  // 백업: 내보낸 파일에 긴 글이 담기고, 가져오면 돌아온다
  await page.getByTestId('settings-open').click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export').click()])
  const backup = JSON.parse(readFileSync(await download.path(), 'utf8'))
  expect(backup.entries.find((e: { date: string }) => e.date === '2026-10-25').more).toBe(long)
  await page.evaluate((k) => localStorage.removeItem(k), KEY)
  await page.reload()
  await page.getByTestId('settings-open').click()
  await page.getByTestId('backup-file').setInputFiles({ name: 'diary-village-2026-10-27.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await page.getByTestId('import-ok').click()
  await expect.poll(async () => (await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{"entries":[]}'), KEY)).entries.length).toBe(4)
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(saved.entries.find((e: { date: string }) => e.date === '2026-10-25').more).toBe(long)
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

test('같은 건물이 또 서면 짓는 알림에 몇 번째인지 한 마디를 더한다',async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const entries = [
    [20, '아침에 커피를 마셨다'],
    [22, '라떼 한 잔'],
    [24, '그냥 조용한 하루'],
  ].map(([d, text], i) => ({ date: `2026-10-${d}`, text, mood: moods[i], writtenAt: Date.parse(`2026-10-${d}T22:00:00+09:00`) }))
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()

  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('카페에서 쉬었다')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('house-2026-10-27')).toHaveAttribute('data-building', 'cafe')
  await expect(page.getByTestId('build-note')).toContainText("☕ '카페'를 찾아 카페가 세 번째로 생겼어요")
  // 넷째 날은 새 주민이 오는 날이 아니다
  await expect(page.getByTestId('build-note')).not.toContainText('새 이웃')
  await page.clock.runFor(1500)
  await page.evaluate(() => document.getAnimations().forEach((a) => ((a.currentTime = 1500), a.pause())))
  await page.screenshot({ path: 'test-results/screens/build-note-ordinal.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
})

test('새 주민이 오는 날 짓는 알림에 "새 이웃 ○○가 이사 왔어요" 한 줄(지운 날도 센다)',async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  // 여섯 날을 썼고(하루는 지웠다), 오늘이 일곱째 날이라 두부가 온다
  const entries = [19, 20, 22, 23, 24].map((d, i) => ({ date: `2026-10-${d}`, text: '그냥 조용한 하루', mood: moods[i % moods.length], writtenAt: Date.parse(`2026-10-${d}T22:00:00+09:00`) }))
  const erased = [{ date: '2026-10-21', erasedAt: Date.parse('2026-10-25T09:00:00+09:00') }]
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries, erased })])
  await page.reload()

  await page.getByTestId('mood-great').click()
  await page.getByTestId('write-input').fill('바람이 시원했다')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('build-note')).toContainText('🏡 새 이웃 두부가 이사 왔어요')
  await expect(page.getByTestId('build-note')).not.toContainText('바람이')
  await page.clock.runFor(1500)
  await page.evaluate(() => document.getAnimations().forEach((a) => ((a.currentTime = 1500), a.pause())))
  await page.screenshot({ path: 'test-results/screens/build-note-neighbor.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
})

test('함께 쌓는 정: 서른째 날을 지으면 "콩이와 친한 이웃" 알림, 이웃 수첩에 하트·이야기 줄·"N일 더"(저장 안 함)', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  // 9월 28일부터 29일을 썼고 하루는 지웠다(지운 날도 센다). 오늘이 서른째 날이다
  const all = dayEntries('2026-09-28', 29)
  const erased = [{ date: all[4].date, erasedAt: Date.parse('2026-10-20T09:00:00+09:00') }]
  const entries = all.filter((_, i) => i !== 4)
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries, erased })])
  await page.reload()
  const before = await page.evaluate((k) => localStorage.getItem(k), KEY)

  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('바람이 시원했다')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('build-note')).toContainText('💛 콩이와 친한 이웃이 되었어요')
  await expect(page.getByTestId('build-note')).toContainText('🏡 새 이웃 감자가 이사 왔어요')
  // 정은 저장하지 않는다: 저장된 칸은 한 줄이 더해진 것뿐이다
  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(Object.keys(stored).sort()).toEqual(Object.keys(JSON.parse(before!)).sort())
  await page.clock.runFor(1500)
  await page.evaluate(() => document.getAnimations().forEach((a) => ((a.currentTime = 1500), a.pause())))
  await page.screenshot({ path: 'test-results/screens/friend-note.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
  // 서른째 날이라 뜨는 축하 카드를 닫는다(명소·단계가 겹치면 한 장에 모인다)
  await page.clock.runFor(800 + 1800 + 900 + 100)
  await expect(page.getByTestId('celebrate')).toBeVisible()
  await page.getByTestId('celebrate-close').click()
  await page.clock.runFor(4000)

  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-tab-neighbors').click()
  await expect(page.getByTestId('book-neighbor-kong')).toHaveAttribute('data-level', '2')
  await expect(page.getByTestId('book-neighbor-gamja')).toHaveAttribute('data-level', '0')
  await page.getByTestId('book-neighbor-kong').click()
  await expect(page.getByTestId('book-friend-hearts')).toHaveText('♥♥♡')
  await expect(page.getByTestId('book-friend')).toContainText('친한 이웃 · 함께한 지 30일')
  await expect(page.getByTestId('book-friend-stories').locator('li')).toHaveText(['“낮잠 잘 때 콩자반 꿈을 자주 꿔요”', '“사실 이 마을에 제일 먼저 온 게 자랑이에요”'])
  await expect(page.getByTestId('book-friend-next')).toHaveText('70일 더 함께하면 다음 이야기를 들려줘요')
  // 칸은 그대로 손가락으로 누르기 충분하고, 수첩 창 안에서 잘리지 않는다
  const cell = (await page.getByTestId('book-neighbor-kong').boundingBox())!
  expect(cell.height).toBeGreaterThanOrEqual(44)
  // 이야기가 길어도 수첩 안에서 칸 이야기와 "이사 온 날 글 보기"가 보이게 내려 준다
  await expect(page.getByTestId('book-friend-next')).toBeInViewport({ ratio: 0.95 })
  await expect(page.getByTestId('book-neighbor-day')).toBeInViewport({ ratio: 0.95 })
  await expect(page.getByTestId('book-close')).toBeInViewport({ ratio: 0.95 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'test-results/screens/friend-book.png' })

  // 막 이사 온 이웃은 걸음이 없고, 이야기는 "N일 더"만 다정하게
  await page.getByTestId('book-neighbor-gamja').click()
  await expect(page.getByTestId('book-friend-hearts')).toHaveText('♡♡♡')
  await expect(page.getByTestId('book-friend')).toContainText('함께한 지 1일')
  await expect(page.getByTestId('book-friend-stories')).toHaveCount(0)
  await expect(page.getByTestId('book-friend-next')).toHaveText('9일 더 함께하면 이야기를 들려줘요')
  // 아직 안 온 이웃은 정 줄이 없다
  await page.getByTestId('book-neighbor-dotori').click()
  await expect(page.getByTestId('book-friend')).toHaveCount(0)
})

test('정이 오른 날의 손님: 서른째 날을 지으면 콩이가 손님으로 와 머리 위 하트·걸음 인사(저장 안 함)', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  const entries = dayEntries('2026-09-28', 29)
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  // 아직 짓지 않은 날은 하트가 없다
  await expect(page.locator('.guest-heart')).toHaveCount(0)
  const before = await page.evaluate((k) => localStorage.getItem(k), KEY)

  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('바람이 시원했다')
  await page.getByTestId('write-submit').click()
  // 걸음이 오른 콩이가 첫 손님이 되어 걸음 인사를 한다
  await expect(page.getByTestId('guest-kong')).toHaveClass(/arrive/)
  await expect(page.getByTestId('guest-heart-kong')).toHaveCount(1)
  await expect(page.locator('.guest-heart')).toHaveCount(1)
  await expect(page.getByTestId('build-note')).toContainText('💛 콩이와 친한 이웃이 되었어요')
  // 하트는 짓는 연출과 뛰어 오기가 끝난 뒤 떠오른다
  const pop = await page.evaluate(() =>
    document.getAnimations().filter((a) => (a as CSSAnimation).animationName === 'guest-heart').map((a) => Number(a.effect!.getComputedTiming().delay)),
  )
  expect(pop).toHaveLength(1)
  expect(pop[0]).toBeGreaterThanOrEqual(800 + 1950)
  // 하트가 막 커진 모습
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      a.pause()
      const name = (a as CSSAnimation).animationName
      if (name === 'guest-heart') a.currentTime = Number(a.effect!.getComputedTiming().delay) + 500
      else if (name === 'guest-come') a.currentTime = 99999
      else a.currentTime = 2400
    }
  })
  const heart = (await page.getByTestId('guest-heart-kong').boundingBox())!
  const kong = (await page.getByTestId('guest-kong').locator('.hit').boundingBox())!
  // 하트는 콩이 머리 위에 있다
  expect(heart.y + heart.height).toBeLessThan(kong.y + kong.height / 2)
  expect(Math.abs(heart.x + heart.width / 2 - (kong.x + kong.width / 2))).toBeLessThan(kong.width / 2)
  expect(await page.getByTestId('guest-heart-kong').evaluate((n) => Number(getComputedStyle(n).opacity))).toBeGreaterThan(0.9)
  const house = (await page.getByTestId('house-2026-10-27').boundingBox())!
  await page.screenshot({ path: 'test-results/screens/friend-guest-heart.png', clip: { x: house.x - 70, y: house.y - 30, width: house.width + 140, height: house.height + 90 } })
  // 다 떠오르면 사라진다
  await finishAnimations(page)
  expect(await page.getByTestId('guest-heart-kong').evaluate((n) => Number(getComputedStyle(n).opacity))).toBe(0)
  // 저장된 칸은 한 줄이 더해진 것뿐이다
  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(Object.keys(stored).sort()).toEqual(Object.keys(JSON.parse(before!)).sort())
  expect(stored.entries).toHaveLength(30)
  // 다시 열면 하트는 다시 뜨지 않고 콩이는 그대로 손님이다
  await page.reload()
  await expect(page.getByTestId('guest-kong')).toBeAttached()
  await expect(page.locator('.guest-heart')).toHaveCount(0)
  // 콩이를 누르면 걸음 인사를 한다
  await page.getByTestId('guest-kong').click({ force: true })
  await expect(page.getByTestId('build-note')).toContainText('콩이: “이제 우리 친한 이웃이에요!')
})

test('정이 오른 날의 손님: 움직임 줄이기면 하트가 움직이지 않고 잠깐 보였다 사라진다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries: dayEntries('2026-09-28', 29) })])
  await page.reload()
  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('바람이 시원했다')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('guest-heart-kong')).toHaveCount(1)
  const names = await page.evaluate(() => document.getAnimations().map((a) => (a as CSSAnimation).animationName))
  expect(names).toContain('guest-heart-calm')
  expect(names).not.toContain('guest-heart')
  expect(await page.getByTestId('guest-heart-kong').evaluate((n) => Number(getComputedStyle(n).opacity))).toBeGreaterThan(0.9)
  await finishAnimations(page)
  expect(await page.getByTestId('guest-heart-kong').evaluate((n) => Number(getComputedStyle(n).opacity))).toBe(0)
})

test('말의 메아리: 지난날에도 쓴 말이면 알림에 그날 한 줄, 누르면 그날 글, 읽기 창 꼬리표로 찾기 창(저장 안 함)', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  const at = (d: string) => Date.parse(`${d}T21:00:00+09:00`)
  const entries = [
    { date: '2026-09-03', text: '할머니 댁에 다녀왔다', mood: 'great', writtenAt: at('2026-09-03') },
    { date: '2026-10-01', text: '할머니랑 전화했다', mood: 'calm', writtenAt: at('2026-10-01') },
    { date: '2026-10-10', text: '비 오는 날 산책', mood: 'meh', writtenAt: at('2026-10-10') },
  ]
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  const before = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)

  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('할머니가 보고 싶다')
  await page.getByTestId('write-submit').click()
  const echo = page.getByTestId('note-echo')
  await expect(echo).toHaveText("🔁 '할머니' — 10월 1일에도 썼어요")
  await finishAnimations(page)
  const box = (await echo.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  const note = (await page.getByTestId('build-note').boundingBox())!
  expect(note.x).toBeGreaterThanOrEqual(0)
  expect(note.x + note.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'test-results/screens/echo-note.png' })

  // 누르면 그날 집으로 날아가 글을 연다
  await echo.click()
  await expect(page.getByTestId('reader')).toBeVisible()
  await expect(page.getByTestId('reader-text')).toHaveText('할머니랑 전화했다')
  // 그날 글의 꼬리표: 그 말을 쓴 날 수(오늘 포함)
  const tag = page.getByTestId('reader-echo')
  await expect(tag).toHaveText("🔁 '할머니'를 쓴 날 3일")
  expect((await tag.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/echo-reader.png' })
  // 누르면 찾기 창이 그 말로 열린다
  await tag.click()
  await expect(page.getByTestId('reader')).toBeHidden()
  await expect(page.getByTestId('calendar')).toBeVisible()
  await expect(page.getByTestId('calendar-search')).toHaveValue('할머니')
  await expect(page.getByTestId('search-hits').locator('[data-testid^="hit-20"]')).toHaveCount(3)
  // 처음 쓴 날·메아리가 없는 날에는 꼬리표가 없다
  await page.getByTestId('hit-2026-09-03').click()
  await expect(page.getByTestId('reader-text')).toHaveText('할머니 댁에 다녀왔다')
  await expect(page.getByTestId('reader-echo')).toBeHidden()

  // 저장된 것은 한 줄이 더해진 것뿐이다
  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(Object.keys(stored).sort()).toEqual(Object.keys(before).sort())
  expect(stored.entries.slice(0, 3)).toEqual(before.entries)
  expect(stored.entries).toHaveLength(4)
})

test('함께 쌓는 정: 마을의 이웃이 걸음마다 정표를 달고, 누르면 열린 자기 이야기를 들려준다(빽빽한 마을, 저장 안 함)', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  // 120일을 이어서 썼다: 콩이·모모는 단짝(별 배지), 뒤에 온 이웃은 친한(머리핀)·안녕(목도리)·아직 없음
  const entries = dayEntries('2026-06-29', 120)
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  const before = await page.evaluate((k) => localStorage.getItem(k), KEY)

  const tokenOf = (id: string) => page.locator(`[data-resident="${id}"] .friend-token, [data-guest="${id}"] .friend-token`)
  await expect(tokenOf('kong')).toHaveAttribute('data-token', 'star')
  await expect(tokenOf('momo')).toHaveAttribute('data-token', 'star')
  const tokens = await page.locator('.things .friend-token').evaluateAll((list) => list.map((n) => n.getAttribute('data-token')))
  expect(new Set(tokens)).toEqual(new Set(['star', 'pin', 'scarf']))
  // 막 이사 온 이웃(걸음 0)은 정표가 없다
  const bare = await page.locator('.things [data-resident]:not(:has(.friend-token)), .things [data-guest]:not(:has(.friend-token))').count()
  expect(bare).toBeGreaterThan(0)
  // 정표는 제 몸 가까이에만 있다(옆 이웃·집 위로 삐져나오지 않음)
  for (const node of await page.locator('.things .friend-token').all()) {
    const box = (await node.boundingBox())!
    const body = (await node.locator('xpath=..').boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(body.x - 2)
    expect(box.x + box.width).toBeLessThanOrEqual(body.x + body.width + 2)
    expect(box.y).toBeGreaterThanOrEqual(body.y - 2)
    expect(box.y + box.height).toBeLessThanOrEqual(body.y + body.height + 2)
  }

  // 걷는 단짝 이웃을 누르면 오늘 이야기 → 지난 이야기 → 자기 이야기
  // 처음 보기 화면 안(머리줄·카드에 가리지 않는 곳)에 있는 단짝 이웃 하나
  const stars = page.locator('.things .resident:not(.hangout):has(.token-star)')
  let id = ''
  for (const node of await stars.all()) {
    const b = (await node.boundingBox())!
    if (b.x > 10 && b.x + b.width < 380 && b.y > 140 && b.y + b.height < 480) id = (await node.getAttribute('data-resident'))!
  }
  expect(id).not.toBe('')
  const walker = page.locator(`.things [data-resident="${id}"]`)
  const note = page.getByTestId('build-note')
  for (let i = 0; i < 3; i++) await walker.click({ force: true })
  const said = (await note.textContent())!
  expect(STORIES[id].some((line) => said.includes(line))).toBe(true)
  await expect(page.getByTestId('note-go')).toHaveCount(0)
  // 정은 저장하지 않는다
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before)

  // 그 이웃 쪽으로 가까이 보아 정표를 확인한다
  const wb = (await walker.boundingBox())!
  await page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2)
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -300)
  await page.waitForTimeout(600)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/friend-tokens.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))

  // 이웃 수첩 얼굴에도 같은 정표
  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-tab-neighbors').click()
  await expect(page.getByTestId('book-neighbor-kong').locator('.friend-token')).toHaveAttribute('data-token', 'star')
  await expect(page.getByTestId('book-neighbors').locator('.friend-token[data-token="pin"]').first()).toBeAttached()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'test-results/screens/friend-book-tokens.png' })
})

test('새 이웃이 온 날, 원래 보기로 돌아온 뒤 섬 가장자리에서 광장으로 통통 뛰어 들어온다(저장 안 함)', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T13:00:00+09:00') })
  await page.goto('./')
  // 아홉 날을 썼고, 오늘이 열째 날이라 호두가 온다
  const entries = monthEntries('2026-10', [3, 5, 7, 9, 11, 13, 15, 17, 19])
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await expect(page.getByTestId('resident-hodu')).toHaveCount(0)
  await expect(page.locator('.resident.newcomer')).toHaveCount(0)

  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('바람이 시원했다')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('build-note')).toContainText('🏡 새 이웃 호두가 이사 왔어요')
  // 호두는 손님이 아니라 광장 길로 들어온다
  const hodu = page.getByTestId('resident-hodu')
  await expect(hodu).toHaveClass(/newcomer/)
  await expect(page.locator('.resident.newcomer')).toHaveCount(1)
  await expect(page.getByTestId('guest-hodu')).toHaveCount(0)
  // 짓는 연출로 다가갔다 돌아오고, 열째 날이라 뜨는 축하 카드를 닫을 때까지는 광장 앞 가장자리에 숨어 기다린다
  await page.clock.runFor(800 + 1800 + 900 + 100)
  await expect(page.getByTestId('celebrate')).toBeVisible()
  await page.clock.runFor(3000)
  await expect(hodu).not.toHaveClass(/coming/)
  await page.getByTestId('celebrate-close').click()
  // 광장 쪽으로 다가간 뒤(800) 뛰어 들어온다
  await page.clock.runFor(900)
  await expect(page.getByTestId('house-2026-10-20')).not.toBeInViewport()
  await expect(hodu).toHaveClass(/coming/)
  // 다가간 보기에서 "광장" 이름표와 다음 명소 팻말이 마을 화면 안에 다 들어오고, 날씨 칩과 겹치지 않는다
  await expectInVillage(page, ['plaza-sign', 'next-landmark'])
  const at = async (t: number) => {
    await page.evaluate((t) => {
      for (const a of document.getAnimations()) {
        a.pause()
        a.currentTime = (a as CSSAnimation).animationName === 'newcomer-come' ? t : 2400
      }
    }, t)
    return (await hodu.locator('.hit').boundingBox())!
  }
  // 뛰어 오는 내내 우체통(빨간 통)을 덮지 않는다: 우체통 뒤 돌길로 와서, 같은 세로줄에서는 발이 통 꼭대기보다 위에 있다
  const body = hodu.locator('.hop')
  for (const t of [100, 300, 500, 700, 900, 1100, 1300, 1500, 1760]) {
    await at(t)
    const post = (await page.getByTestId('mailbox').locator('path').first().boundingBox())!
    const b = (await body.boundingBox())!
    const sideBySide = b.x + b.width <= post.x || post.x + post.width <= b.x
    expect(sideBySide || b.y + b.height <= post.y + 3, `${t}ms`).toBe(true)
  }
  const start = await at(250)
  const mid = await at(700)
  await page.screenshot({ path: 'test-results/screens/neighbor-arrive.png' })
  // 끝(1800) 바로 앞: 거의 제 길에 섰다
  const end = await at(1760)
  // 섬 왼쪽 위 가장자리에서 가로 돌길을 따라 오른쪽 아래로 들어와 제 길에 선다
  expect(start.x).toBeLessThan(mid.x)
  expect(mid.x).toBeLessThan(end.x)
  expect(start.y).toBeLessThan(end.y)
  await expect(hodu).toBeInViewport()
  await page.screenshot({ path: 'test-results/screens/neighbor-arrived.png' })
  // 뛰어 오는 동안 맨 앞에 그렸다가, 다 오면 제 깊이 자리로 돌아간다
  expect(await hodu.evaluate((n) => n.parentNode!.lastChild === n)).toBe(true)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
  await finishAnimations(page)
  await expect.poll(() => hodu.evaluate((n) => n.parentNode!.lastChild === n)).toBe(false)
  // 머문 뒤 원래 보기(오늘 집)로 돌아온다
  await page.clock.runFor(3000)
  await expect(page.getByTestId('house-2026-10-20')).toBeInViewport()

  // 저장된 것은 기록뿐이다. 다시 열면 뛰어 오지 않고, 오늘은 광장 길을 그대로 걷는다
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(Object.keys(saved).sort()).toEqual(['entries', 'version'])
  await page.reload()
  await expect(page.getByTestId('resident-hodu')).toHaveCount(1)
  await expect(page.locator('.resident.newcomer')).toHaveCount(0)
  await expect(page.getByTestId('guest-hodu')).toHaveCount(0)
})

test('움직임 줄이기면 새 이웃은 뛰어 오지 않고 바로 그 자리에 있다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: new Date('2026-10-20T13:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [3, 5, 7, 9, 11, 13, 15, 17, 19])
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('바람이 시원했다')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('resident-hodu')).toHaveCount(1)
  await expect(page.locator('.resident.newcomer')).toHaveCount(0)
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
  // 다섯째 날이라 새 이웃 보리도 이사 온다. 지난날에도 쓴 '산책'은 메아리 줄로 그날을 알린다
  await expect(page.getByTestId('build-note')).toHaveText(/^🌳 '산책'을 찾아 공원이 생겼어요\n🏡 새 이웃 보리가 이사 왔어요\n💬 \S+: “공원이 생겨서 반가워요\.”🔁 '산책' — \d+월 \d+일에도 썼어요$/)
  await page.clock.runFor(1500)
  await page.evaluate(() => document.getAnimations().forEach((a) => ((a.currentTime = 1500), a.pause())))
  await page.screenshot({ path: 'test-results/screens/build-note-park.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
  await page.clock.runFor(6000)
  await closeGift(page)

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
  // 두 번째 카페라 몇 번째인지 한 마디를 더하고, 찾아온 손님이 오늘 한 줄에 맞장구를 친다(퇴근 → 애씀)
  // 열째 날이라 먼저 온 모모와 안녕 이웃이 된다(함께 쌓는 정)
  await expect(page.getByTestId('build-note')).toHaveText(/^☕ '커피'를 찾아 카페가 두 번째로 생겼어요\n💛 모모와 안녕 이웃이 되었어요\n💬 \S+: “(오늘도 애썼어요\.|바빴던 하루, 따뜻한 차 한 잔 어때요\?|고생 많았어요\. 오늘 밤은 편히 쉬어요\.)”$/)
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

  // 보통 집을 지으면 건물 알림이 없다(13일째라 작은 시설 그네가 열린 것만 알려 준다)
  await page.getByTestId('reader-close').click()
  await page.getByTestId('write-yesterday').click()
  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('일찍 잤다')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('house-2026-10-26')).toHaveAttribute('data-building', 'house')
  const note = page.getByTestId('build-note')
  await expect(note).toHaveText(/^🪢 작은 시설 그네가 열렸어요(\n💬 \S+: “.+”)?🪢 놓으러 가기$/)

  // 알림의 "놓으러 가기"로 시설 갈래에서 그네를 고른 채 꾸미기에 들어간다
  const go = page.getByTestId('note-go')
  await expect(go).toHaveText('🪢 놓으러 가기')
  await page.clock.runFor(1500)
  await finishAnimations(page)
  const nb = (await note.boundingBox())!
  expect(nb.x).toBeGreaterThanOrEqual(0)
  expect(nb.x + nb.width).toBeLessThanOrEqual(390)
  expect((await go.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: 'test-results/screens/facility-note.png' })
  await go.click()
  await expect(note).toBeHidden()
  await expect(page.getByTestId('decorate')).toBeVisible()
  await expect(page.getByTestId('decorate-kind-facility')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('decorate-pick-swing')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('decorate-msg')).toHaveText('🪢 그네를 놓을 빈 자리를 눌러요')
  expect(await page.locator('.spot').count()).toBeGreaterThan(0)
  await page.screenshot({ path: 'test-results/screens/facility-go.png' })
})

test('건물이 없는 날은 한 줄의 말로 마당에 작은 흔적이 남고, 읽기 창에 한 줄로 알려 준다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T21:00:00+09:00') })
  await page.goto('./')
  const texts: [number, string, string | null][] = [
    [17, '빨래를 개고 하루를 마쳤다', 'laundry'],
    [18, '우산을 챙겨 나갔다', 'umbrella'],
    [19, '바람이 시원한 날', 'kite'],
    [20, '첫눈이 왔다', 'snowman'],
    [21, '편의점에 들렀다', 'basket'],
    [22, '택배가 도착했다', 'mail'],
    [23, '친구랑 수다를 떨었다', 'chairs'],
    [24, '늦잠을 푹 잤다', 'hammock'],
    [25, '따릉이 타고 출근', 'bicycle'],
    [26, '새 신발을 샀다', 'shoes'],
    [27, '커피 한 잔', null],
  ]
  const entries = texts.map(([d, text], i) => ({
    date: `2026-10-${d}`,
    text,
    mood: moods[i % moods.length],
    writtenAt: Date.parse(`2026-10-${d}T22:00:00+09:00`),
  }))
  for (const [i, [, , id]] of texts.entries()) expect(yardOf(entries[i] as Entry)?.id ?? null).toBe(id)
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  for (const [d, , id] of texts) {
    if (id) await expect(page.getByTestId(`yard-2026-10-${d}`)).toHaveAttribute('data-yard', id)
    else await expect(page.getByTestId(`yard-2026-10-${d}`)).toHaveCount(0)
  }
  await expect(page.getByTestId('house-2026-10-27')).toHaveAttribute('data-building', 'cafe')

  const mid = (await page.getByTestId('house-2026-10-22').boundingBox())!
  await page.mouse.move(mid.x + mid.width / 2, mid.y + mid.height / 2)
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -200)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/yard-traces.png' })
  // 흔적마다 가까이 본 사진(집과 흔적을 함께)
  await page.addStyleTag({ content: '.tree, .resident, .critter { visibility: hidden }' })
  for (const [d, , id] of texts.filter(([, , id]) => id)) {
    const house = page.getByTestId(`house-2026-10-${d}`)
    const b = (await house.boundingBox())!
    const dx = 195 - (b.x + b.width / 2)
    const dy = 330 - (b.y + b.height / 2)
    const from = { x: dx < 0 ? 370 : 20, y: dy < 0 ? 560 : 120 }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 })
    await page.mouse.up()
    const h = (await house.boundingBox())!
    const t = (await page.getByTestId(`yard-2026-10-${d}`).boundingBox())!
    const x = Math.min(h.x, t.x) - 6
    const y = Math.min(h.y, t.y) - 6
    const clip = { x, y, width: Math.max(h.x + h.width, t.x + t.width) + 6 - x, height: Math.max(h.y + h.height, t.y + t.height) + 6 - y }
    await page.screenshot({ path: `test-results/screens/yard-${id}.png`, clip })
  }
  await page.evaluate(() => document.querySelectorAll('style').forEach((s) => s.textContent?.includes('.tree, .resident, .critter') && s.remove()))
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))

  // 흔적은 누르기를 받지 않고 아래(집)로 넘긴다
  const trace = (await page.getByTestId('yard-2026-10-20').boundingBox())!
  const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.yard-trace'), [trace.x + trace.width / 2, trace.y + trace.height * 0.7])
  expect(hit).toBe(false)
  await page.getByTestId('house-2026-10-20').click()
  await expect(page.getByTestId('reader-date')).toContainText('10월 20일')
  await expect(page.getByTestId('reader-yard')).toHaveText("⛄ '첫눈'을 찾아 마당에 눈사람이 섰어요")
  await page.waitForTimeout(400) // 창이 올라오는 연출이 끝날 때까지
  await page.screenshot({ path: 'test-results/screens/reader-yard.png' })
  await page.getByTestId('reader-close').click()

  // 건물이 선 날은 흔적 줄이 없다
  await page.getByTestId('house-2026-10-27').click()
  await expect(page.getByTestId('reader-building')).toBeVisible()
  await expect(page.getByTestId('reader-yard')).toBeHidden()
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

test('글을 지키려고 저장소를 남겨 달라고 부탁하고, 백업한 지 한 달이 지나면 다정하게 묻는다', async ({ page }) => {
  // 브라우저에 "저장소를 지우지 말아 달라"는 부탁이 몇 번 갔는지 센다
  await page.addInitScript(() => {
    const w = window as unknown as { persistAsked: number }
    w.persistAsked = 0
    const s = navigator.storage as unknown as Record<string, unknown>
    s.persisted = async () => false
    s.persist = async () => {
      w.persistAsked++
      return true
    }
  })
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  // 아직 쓴 글이 없으면 부탁하지도 묻지도 않는다
  expect(await page.evaluate(() => (window as unknown as { persistAsked: number }).persistAsked)).toBe(0)
  await expect(page.getByTestId('backup-dot')).toBeHidden()
  await expect(page.getByTestId('backup-ask')).toBeHidden()

  // 한 달 전부터 쓴 마을: 백업한 적이 없다
  const entries = [...monthEntries('2026-09', [20, 25]), ...monthEntries('2026-10', [3, 10, 20])]
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await expect.poll(() => page.evaluate(() => (window as unknown as { persistAsked: number }).persistAsked)).toBeGreaterThan(0)
  await expect(page.getByTestId('backup-dot')).toBeVisible()
  const ask = page.getByTestId('backup-ask')
  await expect(ask).toHaveText('📦 백업해 둘까요?')
  const box = (await ask.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  // 날씨 칩과 겹치지 않는다
  const chip = (await page.getByTestId('weather').boundingBox())!
  expect(box.x + box.width).toBeLessThan(chip.x)
  await page.clock.runFor(1500)
  await page.screenshot({ path: 'test-results/screens/backup-ask.png' })

  // 누르면 설정 창이 열리고, 아직 백업한 적이 없다고 알려 준다
  await ask.click()
  await expect(page.getByTestId('settings')).toBeVisible()
  await expect(page.getByTestId('backup-note')).toHaveText('아직 백업한 적이 없어요')
  await expect(ask).toBeHidden()
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/screens/settings-backup-note.png' })
  await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export').click()])
  await expect(page.getByTestId('backup-note')).toHaveText('마지막 백업: 10월 27일 화요일')
  await page.getByTestId('settings-close').click()
  await expect(page.getByTestId('backup-dot')).toBeHidden()
  const backedUp = Number(await page.evaluate(() => localStorage.getItem('diary-village:backup-at')))
  expect(backedUp - Date.parse('2026-10-27T21:00:00+09:00')).toBeGreaterThanOrEqual(0)
  expect(backedUp - Date.parse('2026-10-27T21:00:00+09:00')).toBeLessThan(60_000)

  // 다시 열어도 묻지 않고, 쓴 글은 그대로다
  await page.reload()
  await expect(page.getByTestId('house-count')).toHaveText('🏠 5채')
  await expect(page.getByTestId('backup-dot')).toBeHidden()
  await expect(page.getByTestId('backup-ask')).toBeHidden()
  expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!).entries).toEqual(entries)
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

/** 그 그림들이 마을 화면 안에 잘리지 않고 다 들어오고, 오른쪽 위 날씨 칩과 겹치지 않는다 */
async function expectInVillage(page: import('@playwright/test').Page, ids: string[]) {
  const v = (await page.getByTestId('village').boundingBox())!
  const w = (await page.getByTestId('weather').boundingBox())!
  for (const id of ids) {
    const b = (await page.getByTestId(id).boundingBox())!
    expect(b.x, id).toBeGreaterThanOrEqual(v.x)
    expect(b.x + b.width, id).toBeLessThanOrEqual(v.x + v.width)
    expect(b.y, id).toBeGreaterThanOrEqual(v.y)
    expect(b.y + b.height, id).toBeLessThanOrEqual(v.y + v.height)
    const apart = b.x + b.width <= w.x || w.x + w.width <= b.x || b.y >= w.y + w.height || b.y + b.height <= w.y
    expect(apart, `${id} 날씨 칩`).toBe(true)
  }
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

  // 보러 가면 광장의 우물과 "광장" 이름표·다음 명소 팻말이 화면 끝에 잘리지 않고 함께 보인다
  await page.getByTestId('celebrate-visit').click()
  await expect(page.getByTestId('celebrate')).toBeHidden()
  await page.clock.runFor(1500)
  const well = page.getByTestId('landmark-well')
  await expect(page.getByTestId('next-landmark')).toHaveText('7일 더 쓰면꽃 정원이 생겨요')
  await expectInVillage(page, ['landmark-well', 'plaza-sign', 'next-landmark'])
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
  await closeGift(page)
  await finishAnimations(page)
  const kong = page.getByTestId('guest-kong')
  await expect(kong).toBeInViewport()
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/resident-first.png' })

  // 누르면 짧은 한마디(오늘 한 줄의 맞장구). 다시 누르면 다른 말
  await kong.click({ force: true })
  await expect(page.getByTestId('build-note')).toHaveText('콩이: “카페가 생겨서 반가워요.”')
  const box = (await page.getByTestId('build-note').boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'test-results/screens/resident-talk.png' })
  await kong.click({ force: true })
  await expect(page.getByTestId('build-note')).not.toHaveText('콩이: “카페가 생겨서 반가워요.”')
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

  // 누르면 손님 한마디: 한 손님은 오늘 한 줄에 맞장구(좋았다 → 기쁨), 다른 손님은 놀이 말(글은 옮기지 않는다)
  const first = guests.first()
  const name = await first.getAttribute('data-guest')
  const note = page.getByTestId('build-note')
  const heard: string[] = []
  for (let i = 0; i < 2; i++) {
    await guests.nth(i).click({ force: true })
    await expect(note).toContainText('“')
    heard.push((await note.textContent())!)
    await expect(note).not.toContainText('냄새')
  }
  expect(heard.some((t) => t.includes('“오늘 생긴 빵집에 빵 사러 왔어요.”'))).toBe(true)
  expect(heard.some((t) => /“(덩달아 웃음이 나요!|마을까지 환해졌어요\.|그 기분, 저도 나눠 가질게요\.)”/.test(t))).toBe(true)
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
  // 맞장구 말풍선도 저절로 뜬다(좋았다 → 기쁨)
  await expect(page.getByTestId('build-note')).toHaveText(/\n💬 \S+: “(덩달아 웃음이 나요!|마을까지 환해졌어요\.|그 기분, 저도 나눠 가질게요\.)”$/)
})

test('주민의 맞장구: 한 줄을 쓰면 찾아온 손님이 말풍선으로 한 번 맞장구를 치고, 누르면 다시, 고치면 말이 바뀐다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T13:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [3, 6, 9, 12, 15])
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()

  const COMFORT = /“(곁에 있을게요\. 천천히 해요\.|오늘은 제가 토닥토닥 해 줄게요\.|괜찮아요, 마을이 곁에 있어요\.)”/
  const TOGETHER = /“(함께한 시간이 따뜻해요\.|좋은 사람들 이야기, 듣기 좋아요\.|둘러앉은 마음이 느껴져요\.)”/
  await page.getByTestId('mood-blue').click()
  await page.getByTestId('write-input').fill('오늘은 조금 속상한 비밀이 있었다')
  await page.getByTestId('write-submit').click()
  const note = page.getByTestId('build-note')
  // 보통 집이라 건물 알림은 없고, 손님 맞장구 한 줄이 저절로 뜬다(글 조각은 옮기지 않는다)
  await expect(note).toHaveText(new RegExp(`^💬 \\S+: ${COMFORT.source}$`))
  await expect(note).not.toContainText('비밀')
  await page.clock.runFor(2600)
  await finishAnimations(page)
  await expect(note).toBeVisible()
  const box = (await note.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/guest-reply.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
  // 한 번만 뜨고 잠시 뒤 사라진다
  await page.clock.runFor(8000)
  await expect(note).toBeHidden()

  // 그 손님을 누르면 다시 들린다
  const ids = await page.locator('.guest').evaluateAll((list) => list.map((n) => n.getAttribute('data-guest')!))
  expect(ids).toHaveLength(2)
  let target = ''
  await finishAnimations(page)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  for (const id of ids) {
    await page.locator(`[data-guest="${id}"] .hit`).click({ force: true })
    await expect(note).toBeVisible()
    if (COMFORT.test((await note.textContent()) ?? '')) target = id
  }
  expect(target).toBeTruthy()

  // 고치면 맞장구도 따라 바뀌고, 누르면 새 말부터 들린다
  await page.getByTestId('house-2026-10-20').click()
  await page.getByTestId('reader-edit').click()
  await page.getByTestId('edit-input').fill('엄마랑 산책했다')
  await page.getByTestId('edit-save').click()
  await page.getByTestId('reader-close').click()
  await finishAnimations(page)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.locator(`[data-guest="${target}"] .hit`).click({ force: true })
  await expect(note).toHaveText(new RegExp(`^\\S+: ${TOGETHER.source}$`))
  // 맞장구는 저장하지 않는다
  const saved = await page.evaluate((k) => localStorage.getItem(k)!, KEY)
  expect(saved).not.toMatch(/곁에 있을게요|토닥토닥|함께한 시간/)
})

test('읽기 창에 그날 손님의 맞장구 한 줄이 보이고, 넘기기·고치기 때 따라 바뀐다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T13:00:00+09:00') })
  await page.goto('./')
  const at = (d: string) => Date.parse(`${d}T22:00:00+09:00`)
  const entries = [
    { date: '2026-08-01', text: '그냥 지나간 하루', mood: 'calm', writtenAt: at('2026-08-01') },
    { date: '2026-08-10', text: '오늘은 정말 비밀스럽게 힘들었다', mood: 'blue', writtenAt: at('2026-08-10') },
    { date: '2026-10-15', text: '친구랑 떡볶이 먹었다', mood: 'great', writtenAt: at('2026-10-15') },
  ]
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()

  const COMFORT = /“(곁에 있을게요\. 천천히 해요\.|오늘은 제가 토닥토닥 해 줄게요\.|괜찮아요, 마을이 곁에 있어요\.)”$/
  const TOGETHER = /“(함께한 시간이 따뜻해요\.|좋은 사람들 이야기, 듣기 좋아요\.|둘러앉은 마음이 느껴져요\.)”$/
  const line = page.getByTestId('reader-reply')
  await page.getByTestId('house-2026-08-01').dispatchEvent('click')
  // 첫날에는 콩이 혼자 살았다
  await expect(line).toHaveText(/^💬 콩이: “.+”$/)
  await page.getByTestId('reader-next').click()
  await expect(page.getByTestId('reader-text')).toHaveText('오늘은 정말 비밀스럽게 힘들었다')
  await expect(line).toHaveText(new RegExp(`^💬 \\S+: ${COMFORT.source}`))
  // 글 조각은 옮기지 않는다
  await expect(line).not.toContainText('비밀')
  const before = (await line.textContent())!
  const who = before.split(':')[0]

  // 고치면 같은 주민이 새 맞장구를 한다
  await page.getByTestId('reader-edit').click()
  await page.getByTestId('edit-input').fill('엄마랑 바닷가를 걸었다')
  await page.getByTestId('edit-save').click()
  await expect(line).toHaveText(new RegExp(`^${who}: ${TOGETHER.source}`))
  await expect(page.getByTestId('reader-edited')).toBeVisible()
  await expect(page.getByTestId('reader-aging')).toBeVisible()
  // 글·맞장구·고친 날 줄이 겹치지 않고 창 안에 있다
  const text = (await page.getByTestId('reader-text').boundingBox())!
  const reply = (await line.boundingBox())!
  const edited = (await page.getByTestId('reader-edited').boundingBox())!
  expect(reply.y).toBeGreaterThanOrEqual(text.y + text.height)
  expect(edited.y).toBeGreaterThanOrEqual(reply.y + reply.height)
  expect(reply.x).toBeGreaterThanOrEqual(0)
  expect(reply.x + reply.width).toBeLessThanOrEqual(390)
  await page.waitForTimeout(500)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/reader-reply.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))

  // 맞장구는 저장하지 않는다
  const saved = await page.evaluate((k) => localStorage.getItem(k)!, KEY)
  expect(saved).not.toMatch(/곁에 있을게요|토닥토닥|함께한 시간|듣기 좋아요|둘러앉은/)
})

test('읽기 창은 내 글이 가장 먼저·가장 크게 — 작은 줄은 글 아래 한 묶음, 단추는 한 줄', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T13:00:00+09:00') })
  await page.goto('./')
  const at = (d: string) => Date.parse(`${d}T22:00:00+09:00`)
  const entries = [
    { date: '2026-07-01', text: '바닷가에서 조개를 주웠다', mood: 'great', writtenAt: at('2026-07-01'), editedAt: at('2026-10-20') },
    { date: '2026-10-27', text: '그냥 지나간 하루', mood: 'calm', writtenAt: at('2026-10-27') },
  ]
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()

  await page.getByTestId('house-2026-07-01').dispatchEvent('click')
  const building = page.getByTestId('reader-building')
  const aging = page.getByTestId('reader-aging')
  const edited = page.getByTestId('reader-edited')
  const edge = page.getByTestId('reader-edge')
  await expect(building).toBeVisible()
  await expect(aging).toBeVisible()
  await expect(edited).toBeVisible()
  await expect(edge).toHaveText('🌱 가장 처음 지은 집이에요')
  const box = async (l: typeof building) => (await l.boundingBox())!
  await page.waitForTimeout(500) // 창이 다 올라온 뒤 자리를 잰다
  const [b, a, e, g, text, reply] = await Promise.all([
    box(building), box(aging), box(edited), box(edge),
    box(page.getByTestId('reader-text')), box(page.getByTestId('reader-reply')),
  ])
  const [date, room, heart, close] = await Promise.all([
    box(page.getByTestId('reader-date')), box(page.getByTestId('reader-room')),
    box(page.getByTestId('reader-treasure')), box(page.getByTestId('reader-close')),
  ])
  // 내 글이 창에서 가장 큰 글자이고, 날짜 줄 바로 다음(방 그림·꼬리표보다 위)에 온다
  const size = (id: string) => page.getByTestId(id).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  const textSize = await size('reader-text')
  for (const id of ['reader-date', 'reader-mood', 'reader-reply', 'reader-aging', 'reader-edited', 'reader-edge']) {
    expect(await size(id)).toBeLessThan(textSize)
  }
  expect(text.y).toBeGreaterThanOrEqual(date.y + date.height)
  expect(text.y).toBeLessThan(room.y)
  expect(text.y).toBeLessThan(b.y)
  // 글 → 맞장구 말풍선 → 작은 한 묶음(건물·집 나이·고친 날·처음 한마디) → 방 그림 차례
  expect(reply.y).toBeGreaterThanOrEqual(text.y + text.height)
  for (const s of [b, a, e, g]) {
    expect(s.y).toBeGreaterThanOrEqual(reply.y + reply.height - 8) // 건물 단추는 누르는 자리만 조금 위로 겹친다
    expect(s.y + s.height).toBeLessThanOrEqual(room.y)
    expect(s.x).toBeGreaterThanOrEqual(0)
    expect(s.x + s.width).toBeLessThanOrEqual(390)
  }
  // 묶음 안에서도 서로 겹치지 않는다
  const all = [b, a, e, g]
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const p = all[i], q = all[j]
    const apart = p.x + p.width <= q.x + 0.5 || q.x + q.width <= p.x + 0.5 || p.y + p.height <= q.y + 0.5 || q.y + q.height <= p.y + 0.5
    expect(apart).toBe(true)
  }
  // 소중한 날·닫기는 오른쪽 위 동그란 단추(44px), 날짜와 겹치지 않는다
  for (const r of [heart, close]) {
    expect(r.width).toBeGreaterThanOrEqual(44)
    expect(r.height).toBeGreaterThanOrEqual(44)
    expect(r.x).toBeGreaterThanOrEqual(date.x + date.width)
    expect(r.y + r.height).toBeLessThanOrEqual(text.y + 2)
    expect(r.x + r.width).toBeLessThanOrEqual(390)
  }
  // 넘기기·고치기·지우기는 방 그림 아래 한 줄에 나란히(44px 이상)
  const row = await Promise.all(['reader-prev', 'reader-edit', 'reader-erase', 'reader-next'].map((id) => box(page.getByTestId(id))))
  for (const r of row) {
    expect(r.y).toBeGreaterThanOrEqual(room.y + room.height)
    expect(Math.abs(r.y - row[0].y)).toBeLessThan(2)
    expect(r.height).toBeGreaterThanOrEqual(44)
    expect(r.width).toBeGreaterThanOrEqual(44)
    expect(r.x + r.width).toBeLessThanOrEqual(390)
  }
  for (let i = 1; i < row.length; i++) expect(row[i].x).toBeGreaterThanOrEqual(row[i - 1].x + row[i - 1].width)
  await page.waitForTimeout(500)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/reader-tidy.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))

  // 건물도 세월도 없는 새 보통 집은 묶음에 한마디 한 줄만 남아 빈 자리가 없다
  await page.getByTestId('reader-next').click()
  await expect(page.getByTestId('reader-text')).toHaveText('그냥 지나간 하루')
  await expect(building).toBeHidden()
  await expect(aging).toBeHidden()
  await expect(edited).toBeHidden()
  await expect(edge).toHaveText('🏡 가장 최근에 지은 집이에요')
  expect((await box(page.locator('.reader-tags'))).height).toBeLessThan(24)
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

  // 모은 것 네 칸은 책갈피로 넘긴다. 열면 건물 칸만 보인다
  await expect(page.getByTestId('book-tab-buildings')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('book-landmark-count')).toHaveText('1 / 7')
  await expect(page.getByTestId('book-neighbor-count')).toBeVisible()
  await expect(page.getByTestId('book-landmarks')).toBeHidden()
  await expect(page.getByTestId('book-neighbors')).toBeHidden()
  await expect(page.getByTestId('book-decors')).toBeHidden()
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/screens/book-tab-buildings.png' })

  // 칸과 책갈피는 손가락으로 누르기 충분히 크다
  for (const id of ['book-cafe', 'book-close', 'book-tab-buildings', 'book-tab-landmarks', 'book-tab-neighbors', 'book-tab-decors']) {
    const b = (await page.getByTestId(id).boundingBox())!
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(b.width).toBeGreaterThanOrEqual(44)
  }

  await page.getByTestId('book-cafe').click()
  await expect(page.getByTestId('book-detail')).toHaveText("☕ 카페 · 2채 · 10월 10일에 '커피'에서 처음 생겼어요")
  await page.getByTestId('book-cinema').click()
  await expect(page.getByTestId('book-detail')).toHaveText('❔ 큰 화면 앞에 앉은 날에 생겨요')
  await page.getByTestId('book-tab-landmarks').click()
  await expect(page.getByTestId('book-buildings')).toBeHidden()
  await expect(page.getByTestId('book-tab-landmarks')).toHaveAttribute('aria-selected', 'true')
  const well = (await page.getByTestId('book-well').boundingBox())!
  expect(well.height).toBeGreaterThanOrEqual(44)
  await page.getByTestId('book-well').click()
  await expect(page.getByTestId('book-landmark-detail')).toHaveText('🪣 우물 · 한 줄을 7일 남겨 생겼어요')
  await page.getByTestId('book-garden').click()
  await expect(page.getByTestId('book-landmark-detail')).toHaveText('❔ 2일 더 쓰면 광장에 새 명소가 생겨요')
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/screens/book-tab-landmarks.png' })
  // 꾸밈 소품·작은 시설 18가지 가운데 12일이면 다섯 개가 열렸다
  await expect(page.getByTestId('book-decor-count')).toHaveText('5 / 18')
  await page.getByTestId('book-tab-decors').click()
  await expect(page.getByTestId('book-landmarks')).toBeHidden()
  await expect(page.getByTestId('book-decor-mailbox')).toHaveAttribute('data-found', 'true')
  await expect(page.getByTestId('book-decor-fence').locator('.book-name')).toHaveText('16일')
  for (const id of ['book-decor-pot', 'book-decor-tent']) {
    const b = (await page.getByTestId(id).boundingBox())!
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(b.width).toBeGreaterThanOrEqual(44)
  }
  await page.getByTestId('book-decor-bench').click()
  await expect(page.getByTestId('book-decor-detail')).toHaveText('🪑 벤치 · 한 줄을 3일 남겨 열렸어요')
  await page.getByTestId('book-decor-fence').click()
  await expect(page.getByTestId('book-decor-detail')).toHaveText('❔ 4일 더 쓰면 새 소품이 열려요')
  await page.getByTestId('book-decor-swing').click()
  await expect(page.getByTestId('book-decor-detail')).toHaveText('❔ 1일 더 쓰면 작은 시설이 열려요')
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
  // 다시 열면 건물 칸부터(보던 책갈피는 저장하지 않는다)
  await badge.click()
  await expect(page.getByTestId('book-tab-buildings')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('book-buildings')).toBeVisible()
  await page.getByTestId('book-close').click()

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

test('쓴 날 보상으로 열린 작은 시설 6종(그네·평상·모닥불·미끄럼틀·시소·정자)을 광장에 놓아 그린다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  const entries = dayEntries('2026-05-30', 150) // 10월 26일까지 150일: 시설 6종이 모두 열렸다
  const decor = [
    { id: 'gazebo', at: 'plaza', col: 2, row: 0 },
    { id: 'swing', at: 'plaza', col: 4, row: 0 },
    { id: 'slide', at: 'plaza', col: 2, row: 1 },
    { id: 'seesaw', at: 'plaza', col: 4, row: 1 },
    { id: 'platform', at: 'plaza', col: 5, row: 5 },
    { id: 'campfire', at: 'plaza', col: 4, row: 4 },
  ]
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries, decor })])
  await page.reload()
  await expect(page.locator('.decor')).toHaveCount(6)
  for (const [i, d] of decor.entries()) await expect(page.getByTestId(`decor-${i}`)).toHaveAttribute('data-decor', d.id)
  await finishAnimations(page)
  await zoomToPlaza(page, 6)
  await page.evaluate(() => document.getAnimations().forEach((a) => ((a.currentTime = 0), a.pause())))
  await page.screenshot({ path: 'test-results/screens/facility-plaza.png' })

  // 수첩 소품 칸에 시설도 함께 모이고, 꾸미기 바구니에서 고를 수 있다
  await page.getByTestId('village-stage').click()
  await expect(page.getByTestId('book-decor-count')).toHaveText('18 / 18')
  await page.getByTestId('book-tab-decors').click()
  await page.getByTestId('book-decor-gazebo').click()
  await expect(page.getByTestId('book-decor-detail')).toHaveText('🛖 정자 · 한 줄을 150일 남겨 열렸어요')
  await page.getByTestId('book-decorate').click()
  // 바구니는 소품·시설 두 갈래로 나뉘어 한 갈래씩 보인다
  const tray = page.getByTestId('decorate')
  await expect(page.getByTestId('decorate-kind-decor')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('decorate-kind-decor')).toContainText('🌷 소품12개')
  await expect(page.getByTestId('decorate-kind-facility')).toContainText('🛝 시설6개')
  await expect(tray.locator('.decor-pick')).toHaveCount(12)
  await expect(page.getByTestId('decorate-pick-swing')).toHaveCount(0)
  await page.getByTestId('decorate-kind-facility').click()
  await expect(tray.locator('.decor-pick')).toHaveCount(6)
  await expect(page.getByTestId('decorate-pick-gazebo')).toBeVisible()
  for (const b of await tray.locator('button:visible').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/decorate-facility.png' })
  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(stored.decor).toEqual(decor)
})

test('쓴 날이 쌓여 꾸밈 소품이 열리면 지은 건물과 함께 알려 준다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  const entries = dayEntries('2026-10-19', 8)
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await page.getByTestId('village-stage').click()
  await expect(page.getByTestId('book-decor-count')).toHaveText('3 / 18')
  await expect(page.getByTestId('book-decor-lamp').locator('.book-name')).toHaveText('9일')
  await page.getByTestId('book-close').click()

  // 아홉째 날을 쓰면 카페와 함께 가로등이 열렸다고 두 줄로 알려 준다(첫 주 선물이 아니라 축하 카드는 없다)
  await page.getByTestId('mood-great').click()
  await page.getByTestId('write-input').fill('퇴근길 커피 한 잔')
  await page.getByTestId('write-submit').click()
  const note = page.getByTestId('build-note')
  await expect(note).toHaveText(/^☕ '커피'를 찾아 카페가 생겼어요\n🏮 꾸밈 소품 가로등이 열렸어요\n💬 \S+: “.+”$/)
  await page.clock.runFor(1500)
  await finishAnimations(page)
  const box = (await note.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  expect(box.height).toBeGreaterThan(40) // 두 줄
  await page.screenshot({ path: 'test-results/screens/decor-note.png' })
  await page.clock.runFor(6000)
  await expect(note).toBeHidden()
  await expect(page.getByTestId('celebrate')).toBeHidden()

  await page.getByTestId('village-stage').click()
  await expect(page.getByTestId('book-decor-count')).toHaveText('4 / 18')
  await expect(page.getByTestId('book-decor-lamp').locator('.book-name')).toHaveText('가로등')
  // 소품은 기록에서 계산한다(저장은 기록뿐)
  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(Object.keys(stored).sort()).toEqual(['entries', 'version'])
})

test('첫 주 선물: 셋째 날 벤치를 받으면 축하 카드가 뜨고, "놓으러 가기"로 바로 꾸미기에 들어간다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  const entries = dayEntries('2026-10-25', 2)
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  // 첫날 선물인 기념 팻말은 처음 집을 지은 날 자리에 서 있다
  await expect(page.getByTestId('first-sign')).toHaveAttribute('data-date', '2026-10-25')
  await expect(page.getByTestId('celebrate')).toBeHidden()

  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('그냥 조용한 하루')
  await page.getByTestId('write-submit').click()
  // 소품 선물은 알림 줄 대신 축하 카드로 알려 준다
  await expect(page.getByTestId('build-note')).not.toContainText('벤치')
  await page.clock.runFor(4000)
  await expect(page.getByTestId('celebrate-title')).toHaveText('🎁 선물이 왔어요!')
  await expect(page.getByTestId('celebrate-body')).toHaveText('한 줄을 3일 남겼어요. 꾸밈 소품 🪑 벤치를 받았어요. 마음에 드는 자리에 놓아 보세요.')
  await expect(page.getByTestId('celebrate-next')).toHaveText('다음 선물은 2일 더 쓰면 꽃밭이에요')
  const go = page.getByTestId('celebrate-go')
  await expect(go).toHaveText('🪑 놓으러 가기')
  for (const id of ['celebrate-close', 'celebrate-go']) {
    const b = (await page.getByTestId(id).boundingBox())!
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.width).toBeLessThanOrEqual(390)
  }
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/gift-decor.png' })

  // 놓으러 가면 벤치를 고른 채로 꾸미기가 열리고 빈 자리가 점선으로 보인다
  await go.click()
  await expect(page.getByTestId('celebrate')).toBeHidden()
  await expect(page.getByTestId('decorate')).toBeVisible()
  await expect(page.getByTestId('decorate-pick-bench')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('decorate-msg')).toHaveText('🪑 벤치를 놓을 빈 자리를 눌러요')
  expect(await page.locator('.spot').count()).toBeGreaterThan(0)
  await page.screenshot({ path: 'test-results/screens/gift-decorate.png' })
  // 기록은 그대로다(선물·팻말은 기록에서 계산한다)
  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(stored.entries).toHaveLength(3)
  expect(Object.keys(stored).sort()).toEqual(['entries', 'version'])
})

test('놓아 둔 쉼터마다 이웃이 놀러 와 머물고, 쉼터를 옮기면 따라가며, 이웃 수첩에 어디서 노는지 보인다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  const entries = dayEntries('2026-09-27', 30) // 10월 26일까지 30일: 이웃 아홉, 그네·모닥불이 열렸다
  const decor = [
    { id: 'swing', at: 'plaza', col: 4, row: 0 },
    { id: 'pot', at: 'plaza', col: 0, row: 1 }, // 쉼터가 아니라 이웃이 오지 않는다
    { id: 'campfire', at: 'plaza', col: 4, row: 4 },
  ]
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries, decor })])
  await page.reload()
  await expect(page.locator('[data-hangout]')).toHaveCount(2)
  await expect(page.locator('[data-hangout="swing"]')).toHaveCount(1)
  await expect(page.locator('[data-hangout="campfire"]')).toHaveCount(1)
  // 놀러 온 이웃은 걷지 않고, 이웃 아홉이 모두 한 군데씩만 보인다
  const ids = await page.locator('[data-guest], [data-resident]').evaluateAll((list) => list.map((n) => n.getAttribute('data-guest') ?? n.getAttribute('data-resident')))
  expect(ids).toHaveLength(9)
  expect(new Set(ids).size).toBe(9)
  const swinger = (await page.locator('[data-hangout="swing"]').getAttribute('data-resident'))!
  await expect(page.locator(`[data-guest="${swinger}"]`)).toHaveCount(0)
  await finishAnimations(page)
  await zoomToPlaza(page, 6)
  await page.evaluate(() => document.getAnimations().forEach((a) => ((a.currentTime = 0), a.pause())))
  await page.screenshot({ path: 'test-results/screens/hangout-plaza.png' })

  // 이웃 수첩에서 그 이웃을 누르면 "…는 그네에서 놀아요"
  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-tab-neighbors').click()
  await page.getByTestId(`book-neighbor-${swinger}`).click()
  await expect(page.getByTestId('book-neighbor-about')).toContainText(/[은는] 그네에서 놀아요$/)
  await page.screenshot({ path: 'test-results/screens/hangout-book.png' })

  // 꾸미기에서 그네를 옮기면 같은 이웃이 새 자리로 따라간다(꾸미기 중에는 이웃을 눌러도 그네가 골라진다)
  await page.getByTestId('book-tab-decors').click()
  await page.getByTestId('book-decorate').click()
  const swing = await centerOf(page.getByTestId('decor-0'))
  await page.mouse.click(swing.x, swing.y)
  await expect(page.getByTestId('decor-0')).toHaveClass(/picked/)
  // 광장 빈 자리 중 다른 것에 가리지 않은 첫 점선 자리로 옮긴다
  const free = await page.locator('.spot[data-testid^="spot-plaza-"]').evaluateAll((list) => {
    for (const n of list) {
      const b = n.getBoundingClientRect()
      const x = b.x + b.width / 2
      const y = b.y + b.height / 2
      if (y > 80 && y < 520 && x > 20 && x < 370 && document.elementFromPoint(x, y) === n) return { id: n.getAttribute('data-testid')!, x, y }
    }
    return null
  })
  expect(free).not.toBeNull()
  await page.mouse.click(free!.x, free!.y)
  await expect(page.getByTestId('decorate-msg')).toHaveText('🪢 그네를 옮겼어요')
  await expect(page.locator('[data-hangout="swing"]')).toHaveAttribute('data-resident', swinger)
  const [col, row] = free!.id.replace('spot-plaza-', '').split('-').map(Number)
  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(stored.decor[0]).toEqual({ id: 'swing', at: 'plaza', col, row })
  expect(stored.entries).toEqual(entries)
  await page.getByTestId('decorate-done').click()
  await finishAnimations(page)
  await page.evaluate(() => document.getAnimations().forEach((a) => ((a.currentTime = 0), a.pause())))
  await page.screenshot({ path: 'test-results/screens/hangout-moved.png' })
})

/** 요소 상자의 가운데(화면 좌표) */
async function centerOf(loc: import('@playwright/test').Locator) {
  const b = (await loc.boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

test('마을 수첩에서 꾸미기에 들어가 소품을 빈 자리에 놓고, 끌어 옮기고, 치운다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  const entries = dayEntries('2026-10-10', 5) // 10월 10~14일: 화분·벤치·꽃밭이 열렸다
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  const stored = async () => JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)

  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-tab-decors').click()
  await page.getByTestId('book-decorate').click()
  await expect(page.getByTestId('book')).toBeHidden()
  await expect(page.getByTestId('write-card')).toBeHidden()
  const tray = page.getByTestId('decorate')
  await expect(tray).toBeVisible()
  await expect(tray.locator('.decor-pick')).toHaveCount(3)
  for (const b of await tray.locator('button:visible').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  // 아직 열린 시설이 없으면 시설 갈래에 다음에 열릴 시설을 알려 준다
  await page.getByTestId('decorate-kind-facility').click()
  await expect(page.getByTestId('decorate-empty')).toHaveText('아직 열린 시설이 없어요 · 8일 더 쓰면 🪢 그네')
  await page.screenshot({ path: 'test-results/screens/decorate-empty.png' })
  await page.getByTestId('decorate-kind-decor').click()
  await expect(tray.locator('.decor-pick')).toHaveCount(3)
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

test('지난달 돌아보기에서 달에 이름을 붙이면 달력 머리·쪽지·구역 이름표에 보이고, 달력에서 고치거나 비울 수 있다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-03T21:00:00+09:00') })
  await page.goto('./')
  const entries = [...monthEntries('2026-10', [3, 8, 15, 22, 30]), ...monthEntries('2026-11', [1])]
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries, villageName: '햇살 마을' })])
  await page.reload()

  // 쪽지 아래 작게 "✏️ 이 달에 이름 붙이기"(44px). 누르면 10월 달력이 이름 칸을 펼친 채 열린다
  const ask = page.getByTestId('recap-name')
  await expect(ask).toHaveText('✏️ 이 달에 이름 붙이기')
  expect((await ask.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(page.getByTestId('write-submit')).toBeInViewport()
  await page.screenshot({ path: 'test-results/screens/recap-name-ask.png' })
  await ask.click()
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년 10월')
  const input = page.getByTestId('calendar-name-input')
  await expect(input).toBeFocused()
  await expect(page.getByTestId('calendar-name-msg')).toHaveText('20자까지, 비우면 "10월"로 돌아가요')
  // 너무 길면 다정하게 알리고 저장하지 않는다
  await input.fill('가'.repeat(21))
  await page.getByTestId('calendar-name-save').click()
  await expect(page.getByTestId('calendar-name-msg')).toHaveText('20자까지 지을 수 있어요')
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).monthTitles, KEY)).toBeUndefined()
  await input.fill('  이사한   달 ')
  await page.getByTestId('calendar').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  await page.screenshot({ path: 'test-results/screens/calendar-name-edit.png' })
  await input.press('Enter')
  const named = page.getByTestId('calendar-name-open')
  await expect(named).toHaveText('「이사한 달」 ✏️')
  expect((await named.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: 'test-results/screens/calendar-name.png' })
  // 저장에는 글·마을 이름과 함께 달 이름이 남는다
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(saved.monthTitles).toEqual({ '2026-10': '이사한 달' })
  expect(saved.entries).toEqual(entries)
  expect(saved.villageName).toBe('햇살 마을')
  // 다른 달로 넘기면 그달은 아직 이름이 없다
  await page.getByTestId('calendar-next').click()
  await expect(page.getByTestId('calendar-name-open')).toHaveText('✏️ 이 달에 이름 붙이기')
  await page.getByTestId('calendar-close').click()

  // 쪽지 머리에 이름이 붙고 "이름 붙이기"는 들어간다. 구역 이름표도 "10월 · 이사한 달"
  await expect(page.getByTestId('recap')).toContainText('🗓️ 10월 「이사한 달」 돌아보기 · 한 줄 5일')
  await expect(ask).toHaveCount(0)
  await expect(page.getByTestId('month-2026-10')).toHaveText('10월 · 이사한 달')
  await expect(page.getByTestId('month-2026-11')).toHaveText('11월')
  // 다시 열어도 그대로
  await page.reload()
  await expect(page.getByTestId('month-2026-10')).toHaveText('10월 · 이사한 달')
  const box = (await page.getByTestId('village').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 200)
  await page.waitForTimeout(300)
  await expect(page.getByTestId('month-2026-10')).toBeInViewport()
  await page.screenshot({ path: 'test-results/screens/month-sign-title.png' })

  // 수첩 달력에서 고치고, 비우면 원래대로 "10월"
  await page.getByTestId('recap').click()
  await page.getByTestId('calendar-name-open').click()
  await expect(page.getByTestId('calendar-name-input')).toHaveValue('이사한 달')
  await page.getByTestId('calendar-name-input').fill('')
  await page.getByTestId('calendar-name-save').click()
  await expect(page.getByTestId('calendar-name-open')).toHaveText('✏️ 이 달에 이름 붙이기')
  await page.getByTestId('calendar-close').click()
  await expect(page.getByTestId('month-2026-10')).toHaveText('10월')
  const after = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect('monthTitles' in after).toBe(false)
  expect(after.entries).toEqual(entries)
})

test('일요일에 시작해 날마다 쓴 달에 긴 달 이름을 붙여도 구역 이름표가 그 달 집을 가리지 않는다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-30T12:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-11', Array.from({ length: 30 }, (_, i) => i + 1)).map((e, i) => (i < 7 || i % 7 === 0 ? { ...e, text: `바닷가 ${e.text}` } : e))
  const monthTitles = { '2026-11': '바다를 매일 보러 간 한 달 내내' }
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries, monthTitles })])
  await page.reload()
  await expect(page.getByTestId('month-2026-11')).toHaveText('11월 · 바다를 매일 보러 간 한 달 내내')
  await expectSignClear(page, 'month-2026-11')
  const box = (await page.getByTestId('village').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 200)
  await page.waitForTimeout(300)
  await expectSignClear(page, 'month-2026-11')
  await page.screenshot({ path: 'test-results/screens/month-sign-title-dense.png' })
})

test('달 이름은 한 해 보기 달 칸과 자라 온 길 자막에 보이고, 백업으로 내보내고 가져와도 돌아온다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T14:00:00+09:00') })
  await page.goto('./')
  const entries = [...monthEntries('2026-09', [20, 25]), ...monthEntries('2026-10', [3, 8]), ...monthEntries('2026-11', [1])] as Entry[]
  const monthTitles = { '2026-09': '첫 집을 지은 달', '2026-10': '이사하고 새 동네를 알아 간 달' }
  const data = { version: 1 as const, entries, monthTitles }
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify(data)])
  await page.reload()

  // 한 해 보기: 이름 붙인 달 칸에 이름이 작게(길면 말줄임, 칸 밖으로 나가지 않음), 이름 없는 달은 그대로
  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-calendar').click()
  await page.getByTestId('calendar-mode-year').click()
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년')
  const oct = page.getByTestId('calm-2026-10')
  await expect(oct.getByTestId('calm-name')).toHaveText('이사하고 새 동네를 알아 간 달')
  await expect(page.getByTestId('calm-2026-09').getByTestId('calm-name')).toHaveText('첫 집을 지은 달')
  await expect(page.getByTestId('calm-2026-11').getByTestId('calm-name')).toHaveCount(0)
  const cell = (await oct.boundingBox())!
  const name =(await oct.getByTestId('calm-name').boundingBox())!
  expect(name.x).toBeGreaterThanOrEqual(cell.x)
  expect(name.x + name.width).toBeLessThanOrEqual(cell.x + cell.width)
  expect(cell.height).toBeGreaterThanOrEqual(44)
  await page.getByTestId('calendar').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  await page.screenshot({ path: 'test-results/screens/calendar-year-title.png' })
  // 누르면 그달 달력, 머리에 이름 전체
  await oct.click()
  await expect(page.getByTestId('calendar-name-open')).toHaveText('「이사하고 새 동네를 알아 간 달」 ✏️')
  await page.getByTestId('calendar-close').click()

  // 자라 온 길: 자막 아래 그달 이름(긴 이름도 화면 안)
  const steps = growthSteps(data)
  const delays = growthDelays(steps)
  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-growth').click()
  await page.clock.runFor(650)
  await expect(page.getByTestId('growth-caption')).toContainText('9월 20일')
  await expect(page.getByTestId('growth-title')).toHaveText('「첫 집을 지은 달」')
  await page.clock.runFor(delays[0] + delays[1])
  await expect(page.getByTestId('growth-caption')).toContainText('10월 3일')
  await expect(page.getByTestId('growth-title')).toHaveText('「이사하고 새 동네를 알아 간 달」')
  const cap = (await page.getByTestId('growth-caption').boundingBox())!
  expect(cap.x).toBeGreaterThanOrEqual(0)
  expect(cap.x + cap.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'test-results/screens/growth-title.png' })
  // 이름 없는 달은 자막 한 줄 그대로
  await page.clock.runFor(delays[2] + delays[3])
  await expect(page.getByTestId('growth-caption')).toContainText('11월 1일')
  await expect(page.getByTestId('growth-title')).toBeHidden()
  await page.getByTestId('growth-skip').click()
  await expect(page.getByTestId('growth')).toBeHidden()

  // 백업 파일에 달 이름이 담긴다
  await page.getByTestId('settings-open').click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export').click()])
  const file = readFileSync(await download.path(), 'utf8')
  expect(JSON.parse(file).monthTitles).toEqual(monthTitles)
  await page.getByTestId('settings-close').click()

  // 새 폰: 11월만 쓰고 11월에 이름을 붙인 상태에서 가져오면 두 쪽 이름이 모두 남는다
  const phone = { version: 1, entries: entries.slice(4), monthTitles: { '2026-11': '새 폰의 달' } }
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify(phone)])
  await page.reload()
  await expect(page.getByTestId('month-2026-10')).toHaveCount(0)
  await page.getByTestId('settings-open').click()
  await page.getByTestId('backup-file').setInputFiles({ name: 'diary-village-2026-11-12.json', mimeType: 'application/json', buffer: Buffer.from(file) })
  await page.getByTestId('import-ok').click()
  await expect(page.getByTestId('settings-msg')).toHaveText('🏠 4일의 집을 다시 지었어요')
  await page.getByTestId('settings-close').click()
  await expect(page.getByTestId('month-2026-10')).toHaveText('10월 · 이사하고 새 동네를 알아 간 달')
  await expect(page.getByTestId('month-2026-11')).toHaveText('11월 · 새 폰의 달')
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)
  expect(saved.monthTitles).toEqual({ ...monthTitles, '2026-11': '새 폰의 달' })
  expect(saved.entries).toEqual(entries)
  await page.reload()
  await expect(page.getByTestId('month-2026-09')).toHaveText('9월 · 첫 집을 지은 달')
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
  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-tab-decors').click() // 책갈피를 넘기는 책장 소리는 따로 본다
  await hush()
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

test('빈 땅에 덤불과 풀 포기가 나서 마을이 덜 허전하고, 집을 지은 칸은 비워진다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-14T13:00:00+09:00') })
  await page.goto('./')
  const saved = JSON.stringify({ version: 1, entries: monthEntries('2026-10', [6, 7, 9, 12]) })
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, saved])
  await page.reload()
  await expect(page.getByTestId('house-2026-10-12')).toBeVisible()

  const cells = async (sel: string) => page.locator(sel).evaluateAll((els) => els.map((e) => e.getAttribute('data-cell') ?? ''))
  expect((await cells('.bush')).length).toBeGreaterThan(0)
  const tufts = await cells('.tuft')
  // 10월 1일은 목요일: d일의 칸은 (요일, 몇째 주). 앞날(15일 뒤)에도 풀 포기가 나고, 집이 선 칸에는 없다
  const cell = (d: number) => `${(3 + d) % 7},${Math.floor((3 + d) / 7)}`
  expect(tufts.some((c) => [...Array(17)].some((_, i) => c === cell(i + 15)))).toBe(true)
  for (const d of [6, 7, 9, 12, 14]) expect(tufts).not.toContain(cell(d))
  // 덤불은 집 바로 앞 칸에 서지 않아 집을 가리지 않는다
  for (const c of await cells('.bush')) {
    const [gx, gy] = c.split(',').map(Number)
    for (const d of [6, 7, 9, 12]) {
      const [hx, hy] = cell(d).split(',').map(Number)
      expect([gx - hx, gy - hy]).not.toEqual([1, 0])
      expect([gx - hx, gy - hy]).not.toEqual([0, 1])
      expect([gx - hx, gy - hy]).not.toEqual([1, 1])
    }
  }
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/village-filled.png' })
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(saved)
})

test('구역 길가에 낮은 울타리·꽃길과 모서리 가로수가 서고, 누르기를 막지 않는다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-14T13:00:00+09:00') })
  await page.goto('./')
  const saved = JSON.stringify({ version: 1, entries: [...monthEntries('2026-08', [3, 10]), ...monthEntries('2026-09', [8, 20]), ...monthEntries('2026-10', [6, 7, 9, 12])] })
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, saved])
  await page.reload()
  await expect(page.getByTestId('house-2026-10-12')).toBeVisible()

  expect(await page.locator('.fence').count()).toBeGreaterThan(0)
  expect(await page.locator('.road-flowers').count()).toBeGreaterThan(0)
  expect(await page.locator('.street-tree').count()).toBeGreaterThan(0)
  const through = await page.locator('.fence, .road-flowers, .street-tree').evaluateAll((els) => els.every((e) => getComputedStyle(e).pointerEvents === 'none'))
  expect(through).toBe(true)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/village-roadside.png' })

  const house = (await page.getByTestId('house-2026-10-06').boundingBox())!
  await page.mouse.move(house.x + house.width / 2, house.y + house.height / 2)
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -200)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/village-roadside-near.png' })
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(saved)
})

test('집을 지어 다가가는 동안 구역 이름표가 잘리거나 날씨 칩에 걸리지 않게 감췄다가 돌아온다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.goto('./')
  const saved = JSON.stringify({ version: 1, entries: dayEntries('2026-10-24', 3) })
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, saved])
  await page.reload()
  const parts = [page.locator('svg .labels'), page.locator('svg .sign-post').first()]
  const sign = page.getByTestId('month-2026-10')
  const opacity = async () => Math.max(...(await Promise.all(parts.map((l) => l.evaluate((e) => Number(getComputedStyle(e).opacity))))))
  await expect(sign).toBeVisible()
  expect(await opacity()).toBe(1)

  await page.getByTestId('mood-great').click()
  await page.getByTestId('write-input').fill('퇴근길 커피 한 잔')
  await page.getByTestId('write-submit').click()
  await expect(page.getByTestId('build-note')).toBeVisible()
  await page.clock.runFor(1500)
  await finishAnimations(page)
  // 가까이 다가간 동안 이름표 판과 기둥은 보이지 않는다
  await expect(page.locator('svg.signs-hushed')).toHaveCount(1)
  await expect.poll(opacity).toBe(0)
  await page.screenshot({ path: 'test-results/screens/build-sign-hushed.png' })

  // 원래 보기로 돌아오면 이름표가 다시 보이고, 화면 안에서 날씨 칩과 겹치지 않는다
  await page.clock.runFor(4000)
  await finishAnimations(page)
  await expect(page.locator('svg.signs-hushed')).toHaveCount(0)
  await expect.poll(opacity).toBe(1)
  const s = (await sign.boundingBox())!
  const w = (await page.getByTestId('weather').boundingBox())!
  expect(s.x).toBeGreaterThanOrEqual(0)
  expect(s.x + s.width).toBeLessThanOrEqual(390)
  const apart = s.x + s.width <= w.x || w.x + w.width <= s.x || s.y + s.height <= w.y || w.y + w.height <= s.y
  expect(apart).toBe(true)
  await page.screenshot({ path: 'test-results/screens/build-sign-back.png' })
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

test('마을 수첩 도감에서 카페를 고르면 "선 날 보기"로 카페가 선 날만 모아 보고, 누르면 그 집 글을 연다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T14:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [3, 8, 12, 19, 24]) as Entry[]
  entries[0] = { ...entries[0], text: '아침에 커피를 마셨다' }
  entries[2] = { ...entries[2], text: '라떼가 <b>맛있었다</b>' }
  entries[3] = { ...entries[3], text: '바닷가를 걸었다' }
  entries[4] = { ...entries[4], text: '친구와 커피 한 잔' }
  // 지운 날은 글이 없어 목록·셈에 들지 않는다
  const erased = [{ date: '2026-10-15', erasedAt: Date.parse('2026-10-16T09:00:00+09:00') }]
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries, erased })])
  await page.reload()

  await page.getByTestId('village-stage').click()
  const days = page.getByTestId('book-building-days')
  await expect(days).toBeHidden()
  // 못 찾은 건물은 보기 단추가 없다
  await page.getByTestId('book-cinema').click()
  await expect(days).toBeHidden()
  await page.getByTestId('book-cafe').click()
  await expect(page.getByTestId('book-detail')).toContainText('☕ 카페 · 3채')
  await expect(days).toHaveText('☕ 카페가 선 날 3일 보기')
  const box = (await days.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await days.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/screens/book-building-days.png' })

  await days.click()
  await expect(page.getByTestId('book')).toBeHidden()
  await page.getByTestId('calendar').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  await expect(page.getByTestId('calendar-days')).toHaveCount(0)
  await expect(page.getByTestId('building-count')).toHaveText('☕ 카페가 선 날 3일')
  const list = page.getByTestId('building-list').locator('.cal-hit')
  await expect(list).toHaveCount(3)
  await expect(list.nth(0)).toHaveAttribute('data-testid', 'hit-2026-10-03')
  await expect(list.nth(1)).toHaveAttribute('data-testid', 'hit-2026-10-12')
  await expect(list.nth(2)).toHaveAttribute('data-testid', 'hit-2026-10-24')
  await expect(page.getByTestId('hit-2026-10-12')).toContainText('라떼가 <b>맛있었다</b>')
  for (const id of ['calendar-mode-month', 'calendar-mode-year', 'calendar-mode-treasure']) {
    await expect(page.getByTestId(id)).toHaveAttribute('aria-pressed', 'false')
  }
  for (const id of ['hit-2026-10-03', 'hit-2026-10-24', 'calendar-close']) {
    const b = (await page.getByTestId(id).boundingBox())!
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(b.x + b.width).toBeLessThanOrEqual(390)
    await expect(page.getByTestId(id)).toBeInViewport()
  }
  await page.screenshot({ path: 'test-results/screens/building-list.png' })

  // 찾기에 말을 넣었다 비우면 건물 모아 보기로 돌아오고, 한 달을 누르면 이번 달 달력이다
  await page.getByTestId('calendar-search').fill('바닷가')
  await expect(page.getByTestId('search-count')).toHaveText('"바닷가" · 한 줄 1개를 찾았어요')
  await page.getByTestId('calendar-search-clear').click()
  await expect(page.getByTestId('building-count')).toHaveText('☕ 카페가 선 날 3일')
  await page.getByTestId('calendar-mode-month').click()
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년 10월')

  // 모아 본 날을 누르면 창이 닫히고 그 집으로 가서 글을 연다
  await page.getByTestId('calendar-close').click()
  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-cafe').click()
  await days.click()
  await page.getByTestId('hit-2026-10-24').click()
  await expect(page.getByTestId('calendar')).toBeHidden()
  await page.clock.runFor(1500)
  await expect(page.getByTestId('reader-text')).toHaveText('친구와 커피 한 잔')

  // 모아 보기는 저장을 바꾸지 않는다
  const now = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(now.entries).toEqual(entries)
  expect(now.erased).toEqual(erased)
})

test('읽기 창 건물 꼬리표를 누르면 같은 건물이 선 날 목록이 열리고, 고른 날로 읽기 창이 이어진다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T14:00:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [3, 8, 12, 19, 24]) as Entry[]
  entries[0] = { ...entries[0], text: '아침에 커피를 마셨다' }
  entries[2] = { ...entries[2], text: '라떼가 맛있었다' }
  entries[3] = { ...entries[3], text: '그냥 지나간 하루' }
  entries[4] = { ...entries[4], text: '친구와 커피 한 잔' }
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()

  await page.getByTestId('house-2026-10-12').dispatchEvent('click')
  const tag = page.getByTestId('reader-building')
  await expect(tag).toHaveText("☕ 카페 · '라떼'에서 생겼어요")
  const box = (await tag.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  // 꼬리표가 누를 수 있게 되어도 넘기기는 그대로다
  await expect(page.getByTestId('reader-prev')).toBeEnabled()
  await page.waitForTimeout(500)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/reader-building-tag.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))

  await tag.click()
  await expect(page.getByTestId('reader')).toBeHidden()
  await expect(page.getByTestId('building-count')).toHaveText('☕ 카페가 선 날 3일')
  await expect(page.getByTestId('building-list').locator('.cal-hit')).toHaveCount(3)
  await page.getByTestId('calendar').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  await page.screenshot({ path: 'test-results/screens/reader-building-list.png' })

  await page.getByTestId('hit-2026-10-24').click()
  await expect(page.getByTestId('calendar')).toBeHidden()
  await page.clock.runFor(1500)
  await expect(page.getByTestId('reader-text')).toHaveText('친구와 커피 한 잔')
  await expect(tag).toHaveText("☕ 카페 · '커피'에서 생겼어요")

  // 보통 집에는 꼬리표가 없고, 모아 보기는 저장을 바꾸지 않는다
  await page.getByTestId('reader-prev').click()
  await expect(page.getByTestId('reader-text')).toHaveText('그냥 지나간 하루')
  await expect(tag).toBeHidden()
  const now = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(now.entries).toEqual(entries)
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

for (const [part, time] of [['day', '13:00'], ['evening', '18:30'], ['night', '21:00']] as const) {
  test(`방 빛은 지금 때를 따른다: ${part}`, async ({ page }) => {
    await page.clock.install({ time: new Date(`2026-10-27T${time}:00+09:00`) })
    await page.goto('./')
    const entries = monthEntries('2026-10', [5, 9, 26]) as Entry[]
    const before = { version: 1, entries }
    await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify(before)])
    await page.reload()

    await page.getByTestId('house-2026-10-09').dispatchEvent('click')
    const room = page.getByTestId('reader-room')
    // 마을 하늘과 방 빛이 같은 때다
    await expect(room).toHaveAttribute('data-time', part)
    await expect(page.getByTestId('scene')).toHaveAttribute('data-time', part)
    await expect(page.getByTestId('room-window')).toHaveAttribute('data-time', part)
    await expect(page.getByTestId('room-lamp')).toHaveAttribute('data-on', String(part !== 'day'))
    await expect(page.getByTestId('room-stars')).toHaveCount(part === 'night' ? 1 : 0)
    await expect(page.getByTestId('room-sunset')).toHaveCount(part === 'evening' ? 1 : 0)
    await expect(room.locator('.room-tint')).toHaveCount(part === 'day' ? 0 : 1)
    // 빛이 바뀌어도 방(벽지·바닥·가구)은 그대로다
    const r = roomOf(entries[1])
    await expect(room).toHaveAttribute('data-wall', r.wall)
    await expect(room).toHaveAttribute('data-floor', r.floor)
    const items = await room.locator('.room-furn').evaluateAll((els) => els.map((e) => e.getAttribute('data-furn')))
    expect(items).toEqual(r.items)
    // 앞뒤로 넘겨도 같은 빛
    await page.getByTestId('reader-next').click()
    await expect(page.getByTestId('reader-text')).toHaveText('2026-10 26일의 한 줄')
    await expect(room).toHaveAttribute('data-time', part)
    // 방 위 누르기는 그대로 통과하고, 저장은 바뀌지 않는다
    await page.waitForTimeout(400)
    const rb = (await room.boundingBox())!
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('svg')?.getAttribute('data-testid') ?? null, [rb.x + rb.width - 90, rb.y + 24])
    expect(hit).toBeNull()
    expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)).toEqual(before)
    await page.screenshot({ path: `test-results/screens/reader-room-${part}.png` })
    await room.screenshot({ path: `test-results/screens/room-light-${part}.png` })
  })
}

test('읽기 창을 열거나 넘기면 방이 옅게 밝아지고 커튼이 살랑인다, 움직임 줄이기면 바로', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T18:30:00+09:00') })
  await page.goto('./')
  const entries = monthEntries('2026-10', [5, 9, 26]) as Entry[]
  const before = { version: 1, entries }
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify(before)])
  await page.reload()

  const anims = () => page.evaluate(() => {
    const room = document.querySelector('[data-testid="reader-room"]')!
    const name = (el: Element) => getComputedStyle(el).animationName
    return { room: name(room), left: name(room.querySelector('.curtain-l')!), right: name(room.querySelector('.curtain-r')!), enter: room.classList.contains('room-enter') }
  })
  await page.getByTestId('house-2026-10-09').dispatchEvent('click')
  expect(await anims()).toEqual({ room: 'room-in', left: 'curtain-sway', right: 'curtain-sway', enter: true })
  await page.waitForTimeout(150)
  await page.screenshot({ path: 'test-results/screens/reader-room-enter.png' })
  // 소중한 날 표시만 바꾸면 방은 그대로 있다
  await page.getByTestId('reader-treasure').click()
  expect((await anims()).enter).toBe(false)
  // 넘기면 새 방이 다시 옅게 들어온다(밀어 넘기기도 그대로)
  await page.getByTestId('reader-next').click()
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 26일의 한 줄')
  expect((await anims()).enter).toBe(true)
  const text = page.getByTestId('reader-text')
  const box = (await text.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const at = (px: number) => ({ pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: px, clientY: y, bubbles: true })
  await text.dispatchEvent('pointerdown', at(x))
  await text.dispatchEvent('pointermove', at(x + 60))
  await text.dispatchEvent('pointerup', at(x + 120))
  await expect(text).toHaveText('2026-10 9일의 한 줄')
  expect((await anims()).enter).toBe(true)
  await page.waitForTimeout(1800)
  await page.screenshot({ path: 'test-results/screens/reader-room-settled.png' })

  // 움직임 줄이기면 방도 커튼도 바로 그 모습이다
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByTestId('reader-prev').click()
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 5일의 한 줄')
  expect(await anims()).toEqual({ room: 'none', left: 'none', right: 'none', enter: true })
  const saved = JSON.parse(await page.evaluate((k) => localStorage.getItem(k)!, KEY))
  expect(saved.entries.map((e: Entry) => e.text)).toEqual(before.entries.map((e) => e.text))
})

test('마을 수첩 책갈피를 넘기면 책장 소리와 함께 칸이 옅게 바뀌고, 소리를 끄면 조용하고 움직임 줄이기면 바로다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:00:00+09:00') })
  await page.addInitScript(listenSound)
  await page.goto('./')
  const saved = JSON.stringify({ version: 1, entries: dayEntries('2026-10-10', 12) })
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, saved])
  await page.reload()

  const notes = () => page.evaluate(() => (window as unknown as { notes: number[] }).notes.length)
  const buzz = () => page.evaluate(() => (window as unknown as { buzz: unknown[] }).buzz)
  const fade = (id: string) =>
    page.evaluate((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`)!.closest('.book-pane')!
      return { name: getComputedStyle(el).animationName, in: el.classList.contains('pane-in') }
    }, id)
  await page.getByTestId('village-stage').click()
  await expect(page.getByTestId('book')).toBeVisible()
  // 열 때는 소리도 연출도 없다
  const quiet = await notes()
  expect((await fade('book-buildings')).in).toBe(false)

  // 다른 칸으로 넘기면 책장 소리(두 음, 음마다 바탕음과 배음)가 나고 떨지 않으며, 새 칸이 옅게 떠오른다
  await page.getByTestId('book-tab-landmarks').click()
  await expect(page.getByTestId('book-landmarks')).toBeVisible()
  expect((await notes()) - quiet).toBe(4)
  expect(await buzz()).toEqual([])
  expect(await fade('book-landmarks')).toEqual({ name: 'pane-in', in: true })
  await page.waitForTimeout(80)
  await page.screenshot({ path: 'test-results/screens/book-tab-turn.png' })
  // 보던 칸을 다시 누르면 넘기지 않아 조용하다
  const turned = await notes()
  await page.getByTestId('book-tab-landmarks').click()
  expect(await notes()).toBe(turned)
  await page.getByTestId('book-tab-neighbors').click()
  await expect(page.getByTestId('book-neighbors')).toBeVisible()
  expect((await notes()) - turned).toBe(4)
  expect(await fade('book-neighbors')).toEqual({ name: 'pane-in', in: true })
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/screens/book-tab-turned.png' })

  // 소리를 끄면 넘겨도 조용하다
  await page.evaluate(() => localStorage.setItem('diary-village:sound', 'off'))
  const off = await notes()
  await page.getByTestId('book-tab-decors').click()
  await expect(page.getByTestId('book-decors')).toBeVisible()
  expect(await notes()).toBe(off)

  // 움직임 줄이기면 새 칸이 바로 보인다
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByTestId('book-tab-buildings').click()
  await expect(page.getByTestId('book-buildings')).toBeVisible()
  expect(await fade('book-buildings')).toEqual({ name: 'none', in: true })
  // 저장은 기록 그대로다(보던 책갈피를 저장하지 않는다)
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(saved)
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

test('오래된 집일수록 벽 아래 덩굴, 모서리 담쟁이, 처마 끝 새 둥지가 깃들고, 집은 그대로 눌린다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T13:00:00+09:00') })
  await page.goto('./')
  // 작년 10월(1년 넘음)·올해 7월(100일 안팎)·9월(30일 안팎)·이달(새 집)
  const words = ['커피', '바다', '운동', '산책', '텃밭', '고양이', '공부']
  const old = monthEntries('2025-10', Array.from({ length: 28 }, (_, i) => i + 1)).map((e, i) => (i < words.length ? { ...e, text: `${words[i]} 생각이 난 하루` } : e))
  const entries = [...old, ...monthEntries('2026-07', [18, 19, 20, 21]), ...monthEntries('2026-09', [27, 28, 29, 30]), ...monthEntries('2026-10', [20, 25, 27])]
  const saved = JSON.stringify({ version: 1, entries })
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, saved])
  await page.reload()
  const aging = (d: string) => page.getByTestId(`house-${d}`).getAttribute('data-aging')
  expect(await aging('2025-10-28')).toBe('nest')
  expect(await aging('2025-10-27')).toBe('nest')
  expect(await aging('2026-07-20')).toBe('ivy')
  expect(await aging('2026-07-21')).toBe('vine')
  expect(await aging('2026-09-28')).toBe('vine')
  expect(await aging('2026-09-29')).toBe('none')
  expect(await aging('2026-10-27')).toBe('none')
  // 앞 단계는 남는다: 둥지 집에도 덩굴·담쟁이가 있고, 새 집에는 아무것도 없다
  const nestHouse = page.getByTestId('house-2025-10-20')
  for (const part of ['aging-vine', 'aging-ivy', 'aging-nest']) await expect(nestHouse.locator(`.${part}`)).toHaveCount(1)
  await expect(page.getByTestId('house-2026-07-20').locator('.aging-nest')).toHaveCount(0)
  await expect(page.getByTestId('house-2026-10-27').locator('.aging')).toHaveCount(0)
  // 마당뿐인 운동장·공원·텃밭, 등대, 고양이 집, 가게도 무르익는다
  for (const b of ['cafe', 'lighthouse', 'field', 'park', 'farm', 'catHouse', 'school']) {
    await expect(page.locator(`[data-building="${b}"][data-aging="nest"] .aging-nest`)).toHaveCount(1)
  }
  // 잎 색은 오늘 계절(가을)을 따른다
  await expect(nestHouse.locator('.aging')).toHaveAttribute('data-season', 'autumn')

  // 작년 오늘 쪽지로 오래된 구역에 간다. 세월 그림을 눌러도 그 집이 열린다
  await page.getByTestId('memory').click()
  await page.clock.runFor(1500)
  await page.getByTestId('reader-close').click()
  await finishAnimations(page)
  const target = page.getByTestId('house-2025-10-28')
  await expect(target).toBeInViewport()
  const hb = (await target.boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  for (let i = 0; i < 2; i++) await page.mouse.wheel(0, -200)
  await page.waitForTimeout(300)
  const leaf = (await target.locator('.aging-ivy ellipse').first().boundingBox())!
  const owner = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.house')?.getAttribute('data-date'), [leaf.x + leaf.width / 2, leaf.y + leaf.height / 2])
  expect(owner).toBe('2025-10-28')
  // 세월 그림은 집 칸 옆으로 삐져나오지 않는다
  const tb = (await target.locator('.aging').boundingBox())!
  const body = (await target.locator('.hit').boundingBox())!
  expect(tb.x).toBeGreaterThanOrEqual(body.x - 6)
  expect(tb.x + tb.width).toBeLessThanOrEqual(body.x + body.width + 6)
  await page.mouse.click(leaf.x + leaf.width / 2, leaf.y + leaf.height / 2)
  await expect(page.getByTestId('reader-text')).toHaveText('2025-10 28일의 한 줄')
  await page.getByTestId('reader-close').click()

  const shot = async (name: string) => {
    await page.waitForTimeout(700)
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
    await page.screenshot({ path: `test-results/screens/${name}.png` })
    await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
  }
  await shot('aging-day')
  await page.clock.fastForward('08:00:00')
  await expect(page.getByTestId('scene')).toHaveAttribute('data-time', 'night')
  await shot('aging-night')
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(saved)
})

test('읽기 창에 집 나이 한 줄이 보이고, 세월 단계를 넘는 날에는 그 집이 살짝 반짝인다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T13:00:00+09:00') })
  await page.goto('./')
  const entries = [
    ...monthEntries('2025-10', [26, 27, 28]),
    ...monthEntries('2026-07', [19, 20]),
    ...monthEntries('2026-09', [27, 28, 29]),
    ...monthEntries('2026-10', [20, 27]),
  ]
  const saved = JSON.stringify({ version: 1, entries })
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, saved])
  await page.reload()

  // 오늘로 365·100·30일째인 집만 반짝이고, 하루 지난 집·새 집은 그대로다
  for (const d of ['2025-10-28', '2026-07-20', '2026-09-28']) {
    await expect(page.getByTestId(`house-${d}`).getByTestId('aging-glint')).toHaveCount(1)
  }
  for (const d of ['2025-10-27', '2026-07-19', '2026-09-27', '2026-09-29', '2026-10-27']) {
    await expect(page.getByTestId(`house-${d}`).getByTestId('aging-glint')).toHaveCount(0)
  }
  await expect(page.locator('.aging-glint')).toHaveCount(3)

  const line = page.getByTestId('reader-aging')
  const read = async (d: string) => {
    await page.getByTestId(`house-${d}`).dispatchEvent('click')
    await expect(page.getByTestId('reader-date')).toBeVisible()
  }
  await read('2026-09-28')
  await expect(line).toHaveText('🌿 지은 지 30일, 오늘 벽에 덩굴이 돋았어요')
  await page.getByTestId('reader-prev').click()
  await expect(line).toHaveText('🌿 지은 지 31일 된 집이에요')
  await page.getByTestId('reader-prev').click()
  await expect(line).toHaveText('🍃 지은 지 100일, 오늘 담쟁이가 올랐어요')
  await page.getByTestId('reader-prev').click()
  await expect(line).toHaveText('🍃 지은 지 101일 된 집이에요')
  for (let i = 0; i < 4; i++) await page.getByTestId('reader-next').click()
  // 30일이 안 된 집에는 나이를 말하지 않는다
  await expect(page.getByTestId('reader-text')).toHaveText('2026-09 29일의 한 줄')
  await expect(line).toBeHidden()
  await page.getByTestId('reader-close').click()
  await read('2026-10-27')
  await expect(line).toBeHidden()
  await page.getByTestId('reader-close').click()

  // 작년 오늘 쪽지로 1년 된 집에 간다
  await page.getByTestId('memory').click()
  await page.clock.runFor(1500)
  await expect(line).toHaveText('🪺 지은 지 1년, 오늘 처마에 새 둥지가 생겼어요')
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/screens/reader-aging.png' })
  await page.getByTestId('reader-close').click()
  await finishAnimations(page)
  const target = page.getByTestId('house-2025-10-28')
  const hb = (await target.boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  for (let i = 0; i < 2; i++) await page.mouse.wheel(0, -200)
  await page.waitForTimeout(300)
  // 별빛은 집 칸 안에 있고 누르기를 막지 않는다
  const glint = target.getByTestId('aging-glint')
  const gb = (await glint.boundingBox())!
  const body = (await target.locator('.hit').boundingBox())!
  expect(gb.x).toBeGreaterThanOrEqual(body.x - 12)
  expect(gb.x + gb.width).toBeLessThanOrEqual(body.x + body.width + 12)
  expect(await glint.evaluate((n) => getComputedStyle(n).pointerEvents)).toBe('none')
  // 반짝임이 한창일 때를 멈춰 찍는다
  await page.evaluate(() =>
    document.getAnimations().forEach((a) => {
      a.pause()
      const t = a.effect?.getComputedTiming()
      if ((a.effect as KeyframeEffect | null)?.target?.closest?.('.aging-glint')) a.currentTime = Number(t?.delay ?? 0) + 720
    }),
  )
  await page.screenshot({ path: 'test-results/screens/aging-glint.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))

  // 움직임 줄이기면 반짝이지 않는다
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(glint).toBeHidden()
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(saved)
})

test('마을 수첩 "우리 이웃" 칸 — 온 주민은 이사 온 날·좋아하는 것, 안 온 주민은 그림자, 이사 온 날 글로 날아간다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T14:00:00+09:00') })
  await page.goto('./')
  // 여덟 날을 지었고 10월 3일(모모가 온 날)은 지웠다. 지워도 모모는 그대로다
  const entries = monthEntries('2026-10', [1, 2, 4, 5, 6, 7, 8]) as Entry[]
  entries[5] = { ...entries[5], text: '두부가 온 날의 한 줄' }
  const erased = [{ date: '2026-10-03', erasedAt: Date.parse('2026-10-04T09:00:00+09:00') }]
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries, erased })])
  await page.reload()
  const before = await page.evaluate((k) => localStorage.getItem(k), KEY)

  await page.getByTestId('village-stage').click()
  await expect(page.getByTestId('book-neighbor-count')).toHaveText('4 / 23')
  await expect(page.getByTestId('book-neighbors').locator('.book-cell')).toHaveCount(23)
  await page.getByTestId('book-tab-neighbors').click()
  await expect(page.getByTestId('book-tab-neighbors')).toHaveAttribute('aria-selected', 'true')
  for (const id of ['kong', 'momo', 'bori', 'dubu']) await expect(page.getByTestId(`book-neighbor-${id}`)).toHaveAttribute('data-found', 'true')
  await expect(page.getByTestId('book-neighbor-hodu')).toHaveAttribute('data-found', 'false')
  await expect(page.getByTestId('book-neighbor-hodu')).toContainText('10일')
  await expect(page.getByTestId('book-neighbor-dubu').locator('svg circle').first()).toBeVisible()

  const day = page.getByTestId('book-neighbor-day')
  await expect(day).toBeHidden()
  // 안 온 주민은 남은 날만, 재촉하지 않는다
  await page.getByTestId('book-neighbor-hodu').click()
  await expect(page.getByTestId('book-neighbor-detail')).toHaveText('❔ 2일 더 쓰면 새 이웃이 와요')
  await expect(day).toBeHidden()
  // 이사 온 날 글이 지워졌으면 보기 단추가 없다
  await page.getByTestId('book-neighbor-momo').click()
  await expect(page.getByTestId('book-neighbor-about')).toHaveText('모모 · 10월 3일에 이사 왔어요 · 좋아하는 것: 복숭아 우유')
  await expect(day).toBeHidden()
  await page.getByTestId('book-neighbor-dubu').click()
  await expect(page.getByTestId('book-neighbor-about')).toHaveText('두부 · 10월 7일에 이사 왔어요 · 좋아하는 것: 따끈한 두부 부침')
  await expect(day).toBeVisible()
  for (const id of ['book-neighbor-dubu', 'book-neighbor-day']) {
    const b = (await page.getByTestId(id).boundingBox())!
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.width).toBeLessThanOrEqual(390)
  }
  // 수첩은 폰 한 화면에 맞는다: 머리·책갈피·"닫기"는 늘 보이고, 칸이 길면 그 칸 안에서만 스크롤한다
  const fits = async () => {
    const sheet = (await page.getByTestId('book').boundingBox())!
    expect(sheet.y).toBeGreaterThanOrEqual(0)
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(845)
    for (const id of ['book-stage', 'book-tab-neighbors', 'book-close']) {
      const b = (await page.getByTestId(id).boundingBox())!
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.y + b.height).toBeLessThanOrEqual(844)
    }
  }
  await finishAnimations(page)
  await fits()
  const pane = page.locator('.book-pane[data-pane="neighbors"]')
  await day.scrollIntoViewIfNeeded()
  await fits()
  expect(await page.getByTestId('book').evaluate((el) => el.scrollTop)).toBe(0)
  const dayBox = (await day.boundingBox())!
  const paneBox = (await pane.boundingBox())!
  expect(dayBox.y + dayBox.height).toBeLessThanOrEqual(paneBox.y + paneBox.height + 1)
  await page.screenshot({ path: 'test-results/screens/book-neighbors.png' })

  await day.click()
  await expect(page.getByTestId('book')).toBeHidden()
  await page.clock.runFor(2000)
  await expect(page.getByTestId('reader')).toBeVisible()
  await expect(page.getByTestId('reader-text')).toHaveText('두부가 온 날의 한 줄')

  // 글을 읽고 수첩으로 돌아오면 보던 이웃 책갈피가 열려 있다
  await page.getByTestId('reader-close').click()
  await page.getByTestId('village-stage').click()
  await expect(page.getByTestId('book-tab-neighbors')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('book-neighbors')).toBeVisible()
  await finishAnimations(page)
  await fits()
  await page.screenshot({ path: 'test-results/screens/book-return.png' })
  // "닫기"로 닫았다가 다시 열면 건물부터
  await page.getByTestId('book-close').click()
  await page.getByTestId('village-stage').click()
  await expect(page.getByTestId('book-tab-buildings')).toHaveAttribute('aria-selected', 'true')
  await page.getByTestId('book-close').click()
  // 수첩은 계산만 하고 저장을 바꾸지 않는다
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before)
})

test('숲가에 토끼·다람쥐, 봄 낮엔 나비가 나오고 하늘엔 새 떼가 지나간다(누르기 통과, 밤엔 쉬러 간다)', async ({ page }) => {
  const entries = [...monthEntries('2026-03', [4, 11, 20]), ...monthEntries('2026-04', [2, 9, 17, 25]), ...monthEntries('2026-05', [3, 6, 8])] as Entry[]
  // 토끼나 다람쥐, 나비, 새 떼가 모두 나오는 5월 날을 고른다(날짜로만 정해진다)
  const today = Array.from({ length: 20 }, (_, i) => `2026-05-${String(i + 10).padStart(2, '0')}`).find((d) => {
    const list = critters(buildVillage(entries, d), d, 'day', 'partly')
    return birdFlock(d, 'day', 'partly') && list.some((c) => c.kind === 'butterfly') && list.some((c) => c.kind !== 'butterfly')
  })!
  await page.clock.install({ time: new Date(`${today}T13:00:00+09:00`) })
  await page.goto('./')
  const saved = JSON.stringify({ version: 1, entries })
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, saved])
  await page.reload()
  await expect(page.getByTestId('house-2026-05-08')).toBeVisible()

  const expected = critters(buildVillage(entries, today), today, 'day', 'partly')
  await expect(page.locator('.critter')).toHaveCount(expected.length)
  expect(await page.getByTestId('critter-butterfly').count()).toBe(expected.filter((c) => c.kind === 'butterfly').length)
  await expect(page.getByTestId('bird-flock')).toHaveCount(1)
  const through = await page.locator('.critter').evaluateAll((els) => els.every((e) => getComputedStyle(e).pointerEvents === 'none'))
  expect(through).toBe(true)
  // 새 떼가 화면을 건너는 중간쯤에서 멈춰 찍는다
  await page.evaluate(() =>
    document.getAnimations().forEach((a) => {
      const target = (a.effect as KeyframeEffect | null)?.target
      if (target instanceof HTMLElement && target.classList.contains('flock')) a.currentTime = Number(a.effect!.getComputedTiming().duration) * 0.3
      a.pause()
    }),
  )
  await expect(page.getByTestId('bird-flock')).toBeInViewport()
  await page.screenshot({ path: 'test-results/screens/village-critters.png' })

  // 동물 하나와 나비 둘레를 크게 찍는다
  for (const [sel, name] of [['.critter.rabbit, .critter.squirrel', 'near'], ['.critter.butterfly', 'butterfly']]) {
    // 화면 안에 보이는 것 하나를 고른다
    const boxes = await Promise.all((await page.locator(sel).all()).map((l) => l.boundingBox()))
    const box = boxes.find((b) => b && b.x > 20 && b.x < 370 && b.y > 80 && b.y < 560)
    if (!box) continue
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.screenshot({ path: `test-results/screens/village-critters-${name}.png`, clip: { x: Math.max(0, cx - 60), y: Math.max(0, cy - 60), width: 120, height: 120 } })
  }

  // 밤이 되면 동물·새 떼는 쉬러 간다(다시 그린다). 저장은 그대로다
  await page.clock.setSystemTime(new Date(`${today}T21:30:00+09:00`))
  await page.clock.runFor(31_000)
  await expect(page.locator('.critter')).toHaveCount(0)
  await expect(page.getByTestId('bird-flock')).toHaveCount(0)
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(saved)
})

test('마을 수첩 "마을이 자라 온 길" — 첫 집부터 날짜 순으로 집이 올라오고, 축하 날 한 줄, 끝 문장 뒤 지금 마을로', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T14:00:00+09:00') })
  await page.goto('./')
  // 집이 없으면 단추가 없다
  await page.getByTestId('village-stage').click()
  await expect(page.getByTestId('book')).toBeVisible()
  await expect(page.getByTestId('book-growth')).toHaveCount(0)
  await page.getByTestId('book-close').click()

  // 9월 20일부터 10월 26일까지 37일을 지었고 10월 15일은 지웠다
  const sept = Array.from({ length: 11 }, (_, i) => 20 + i)
  const oct = Array.from({ length: 26 }, (_, i) => i + 1).filter((d) => d !== 15)
  const entries = [...monthEntries('2026-09', sept), ...monthEntries('2026-10', oct)] as Entry[]
  const erased = [{ date: '2026-10-15', erasedAt: Date.parse('2026-10-16T09:00:00+09:00') }]
  const data = { version: 1 as const, entries, erased }
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify(data)])
  await page.reload()
  const before = await page.evaluate((k) => localStorage.getItem(k), KEY)
  const steps = growthSteps(data)
  const delays = growthDelays(steps)
  expect(steps).toHaveLength(37)

  await page.getByTestId('village-stage').click()
  const open = page.getByTestId('book-growth')
  await expect(open).toHaveText('▶ 마을이 자라 온 길')
  expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.clock.runFor(1000)
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/book-growth.png' })
  await open.click()
  await expect(page.getByTestId('book')).toBeHidden()
  await expect(page.getByTestId('growth')).toBeVisible()
  const skip = page.getByTestId('growth-skip')
  const sb = (await skip.boundingBox())!
  expect(sb.height).toBeGreaterThanOrEqual(44)
  expect(sb.x + sb.width).toBeLessThanOrEqual(390)
  // 처음엔 빈 섬: 집·명소·주민·오늘 자리가 감춰진다(그림은 그대로 있다)
  await expect(page.getByTestId('house-2026-09-20')).toBeHidden()
  await expect(page.getByTestId('house-2026-10-26')).toBeHidden()
  await expect(page.getByTestId('landmark-fountain')).toBeHidden()
  await expect(page.getByTestId('today-spot')).toBeHidden()
  await expect(page.locator('.resident:visible')).toHaveCount(0)

  // 첫 집이 오른다
  await page.clock.runFor(650)
  await expect(page.getByTestId('house-2026-09-20')).toBeVisible()
  await expect(page.getByTestId('house-2026-09-21')).toBeHidden()
  await expect(page.getByTestId('growth-caption')).toHaveText('9월 20일첫 집')

  // 30일째(분수가 생긴 날)까지 간다. 그날 한 줄이 뜨고, 그 뒤 날 집은 아직 없다
  const at = steps.findIndex((s) => s.day === 30)
  expect(growthNote(steps[at])).toContain('분수')
  await page.clock.runFor(delays.slice(0, at).reduce((a, b) => a + b, 0))
  await expect(page.getByTestId('growth-note')).toHaveText(growthNote(steps[at])!)
  await expect(page.getByTestId('growth-caption')).toContainText(`${steps[at].house}번째 집`)
  await expect(page.getByTestId('landmark-fountain')).toBeVisible()
  await expect(page.getByTestId(`house-${steps[at].date}`)).toBeVisible()
  await expect(page.getByTestId(`house-${steps[at + 1].date}`)).toBeHidden()
  // 지운 날은 집이 서지 않는다
  await expect(page.getByTestId('house-2026-10-15')).toHaveCount(0)
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/growth-middle.png' })

  // 끝 문장(지금 서 있는 집 36채)
  await page.clock.runFor(delays.slice(at).reduce((a, b) => a + b, 0) + 50)
  await expect(page.getByTestId('growth-end')).toHaveText('🏡 오늘까지 36채의 집이 모였어요')
  await expect(page.getByTestId('house-2026-10-26')).toBeVisible()
  // 가장 최근 집(10월 26일)이 반짝이며 마무리한다
  await expect(page.getByTestId('house-2026-10-26')).toHaveClass(/growth-shine/)
  await expect(page.getByTestId('house-2026-10-26').getByTestId('growth-shine')).toHaveCount(1)
  await finishAnimations(page)
  await page.screenshot({ path: 'test-results/screens/growth-end.png' })
  // 잠시 뒤 지금 마을로 돌아온다
  await page.clock.runFor(2700)
  await expect(page.getByTestId('growth')).toBeHidden()
  await expect(page.getByTestId('today-spot')).toBeVisible()
  await expect(page.getByTestId('weather')).toBeVisible()
  await expect(page.locator('svg.growing')).toHaveCount(0)

  // "건너뛰기"로 바로 끝난다
  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-growth').click()
  await page.clock.runFor(1500)
  await expect(page.getByTestId('growth-caption')).toContainText('9월')
  await skip.click()
  await expect(page.getByTestId('growth')).toBeHidden()
  await expect(page.getByTestId('house-2026-10-26')).toBeVisible()
  // 화면 아무 곳이나 눌러도 끝난다
  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-growth').click()
  await page.mouse.click(195, 400)
  await expect(page.getByTestId('growth')).toBeHidden()
  await expect(page.getByTestId('house-2026-09-20')).toBeVisible()
  // 보기만 했을 뿐 저장은 그대로다
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before)
})

test('자라 온 길: 집이 오를수록 높아지는 실로폰 소리, 움직임 줄이기면 몇 장면만, 소리를 끄면 조용하다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T14:00:00+09:00') })
  await page.addInitScript(listenSound)
  const entries = monthEntries('2026-10', Array.from({ length: 26 }, (_, i) => i + 1)) as Entry[]
  const data = { version: 1 as const, entries }
  await page.addInitScript(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify(data)])
  await page.goto('./')
  const steps = growthSteps(data)
  const notes = () => page.evaluate(() => (window as unknown as { notes: number[] }).notes)

  // 소리: 한 집마다 한 음, 뒤로 갈수록 높아진다(오실레이터 두 개 가운데 바탕음만 본다)
  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-growth').click()
  await page.clock.runFor(16000)
  await expect(page.getByTestId('growth-end')).toBeVisible()
  const base = (await notes()).filter((_, i) => i % 2 === 0)
  expect(base).toHaveLength(steps.length)
  expect(base[base.length - 1]).toBeGreaterThan(base[0])
  for (let i = 1; i < base.length; i++) expect(base[i]).toBeGreaterThanOrEqual(base[i - 1])
  await page.getByTestId('growth-skip').click()
  await expect(page.getByTestId('growth')).toBeHidden()

  // 움직임 줄이기: 첫 집 → 축하 날 몇 → 오늘 집, 몇 장면만 차례로(움직임 없이)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  const scenes = growthScenes(steps)
  expect(scenes.length).toBeLessThanOrEqual(5)
  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-growth').click()
  await page.clock.runFor(650)
  await expect(page.getByTestId('growth-caption')).toHaveText('10월 1일첫 집')
  await expect(page.getByTestId('house-2026-10-02')).toBeHidden()
  await expect(page.locator('svg .house.pop')).toHaveCount(0)
  // 다음 장면: 그날까지의 집이 한꺼번에 보인다
  await page.clock.runFor(GROWTH_CALM_MS)
  const second = steps[scenes[1]]
  await expect(page.getByTestId('growth-caption')).toContainText(`${second.house}번째 집`)
  await expect(page.getByTestId(`house-${second.date}`)).toBeVisible()
  await expect(page.getByTestId('house-2026-10-02')).toBeVisible()
  await expect(page.getByTestId(`house-${steps[scenes[1] + 1].date}`)).toBeHidden()
  await expect(page.getByTestId('growth-note')).toHaveText(growthNote(second)!)
  await expect(page.locator('svg .house.pop')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/screens/growth-calm.png' })
  await page.clock.runFor(GROWTH_CALM_MS * (scenes.length - 1))
  await expect(page.getByTestId('growth-end')).toBeVisible()
  await expect(page.getByTestId('house-2026-10-26')).toHaveClass(/growth-shine/)
  await page.screenshot({ path: 'test-results/screens/growth-calm-end.png' })
  await page.getByTestId('growth-skip').click()

  // 소리를 끄면 조용하다
  await page.evaluate(() => {
    localStorage.setItem('diary-village:sound', 'off')
    ;(window as unknown as { notes: number[] }).notes = []
  })
  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-growth').click()
  await page.clock.runFor(8000)
  expect(await notes()).toEqual([])
  await page.getByTestId('growth-skip').click()
})

test('이웃의 이사 기념일: 콩이가 이사 온 지 100일째 날 고깔모자·첫 한마디·짓는 알림 줄·수첩 "다음 기념일"(저장 안 함)', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-29T13:00:00+09:00') })
  await page.goto('./')
  // 7월 22일부터 사흘에 한 번 썼다. 콩이는 첫날(7월 22일)에, 모모는 셋째 날(7월 28일)에 이사 왔다
  const entries = dayEntries('2026-07-22', 99).filter((_, i) => i % 3 === 0)
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  const before = await page.evaluate((k) => localStorage.getItem(k), KEY)

  // 오늘은 콩이가 이사 온 지 100일째 날: 콩이만 고깔모자를 쓴다(쓰기 전에도)
  const kong = page.locator('.things [data-resident="kong"], .things [data-guest="kong"]')
  await expect(kong.locator('.party-hat')).toHaveCount(1)
  await expect(page.locator('.things .party-hat')).toHaveCount(1)
  // 모자는 제 몸 가까이에만 있다
  const hat = (await kong.locator('.party-hat').boundingBox())!
  const body = (await kong.locator('.party-hat').locator('xpath=..').boundingBox())!
  expect(hat.x).toBeGreaterThanOrEqual(body.x - 2)
  expect(hat.x + hat.width).toBeLessThanOrEqual(body.x + body.width + 2)

  // 처음 누르면 기념일 인사, 다시 누르면 여느 차례
  const note = page.getByTestId('build-note')
  await kong.dispatchEvent('click')
  await expect(note).toHaveText('콩이: “오늘은 내가 이사 온 지 100일 되는 날이에요!”')
  await kong.dispatchEvent('click')
  await expect(note).not.toContainText('100일 되는 날')
  // 모모는 기념일이 아니라 여느 한마디
  await page.locator('.things [data-resident="momo"], .things [data-guest="momo"]').dispatchEvent('click')
  await expect(note).toContainText('모모:')
  await expect(note).not.toContainText('이사 온 지')

  // 오늘 한 줄을 지으면 짓는 알림에 기념일 한 줄
  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('바람이 시원했다')
  await page.getByTestId('write-submit').click()
  await expect(note).toContainText('🎉 콩이가 이사 온 지 100일 되는 날이에요')
  // 기념일은 저장하지 않는다: 저장된 칸은 한 줄이 더해진 것뿐이다
  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(Object.keys(stored).sort()).toEqual(Object.keys(JSON.parse(before!)).sort())
  expect(stored.entries).toHaveLength(entries.length + 1)
  await page.clock.runFor(1500)
  await page.evaluate(() => document.getAnimations().forEach((a) => ((a.currentTime = 1500), a.pause())))
  await page.screenshot({ path: 'test-results/screens/anniversary-note.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
  await page.clock.runFor(800 + 1800 + 900 + 4000)
  if (await page.getByTestId('celebrate').isVisible()) await page.getByTestId('celebrate-close').click()
  await expect(kong.locator('.party-hat')).toHaveCount(1)

  // 콩이 쪽으로 가까이 보아 모자를 확인한다
  const kb = (await kong.boundingBox())!
  await page.mouse.move(Math.min(Math.max(kb.x + kb.width / 2, 20), 370), Math.min(Math.max(kb.y + kb.height / 2, 160), 480))
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -300)
  await page.waitForTimeout(600)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/anniversary-hat.png' })
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))

  // 이웃 수첩: 콩이는 오늘이 기념일, 모모는 다음 기념일
  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-tab-neighbors').click()
  await page.getByTestId('book-neighbor-kong').click()
  await expect(page.getByTestId('book-anniversary')).toHaveText('🎉 이사 기념일 · 오늘 (100일)')
  await page.getByTestId('book-neighbor-momo').click()
  await expect(page.getByTestId('book-anniversary')).toHaveText('🎉 다음 기념일 · 11월 4일 (100일)')
  await expect(page.getByTestId('book-anniversary')).toBeInViewport({ ratio: 0.95 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'test-results/screens/anniversary-book.png' })
  // 아직 안 온 이웃은 기념일 줄이 없다
  await page.getByTestId('book-neighbor-dotori').click()
  await expect(page.getByTestId('book-anniversary')).toHaveCount(0)
})

test('짓는 알림이 줄 많은 날에도 칸마다 잘리지 않고, 세 칸이 넘으면 "다음 ›"으로 넘겨 본다(저장 안 함)', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-29T13:00:00+09:00') })
  await page.goto('./')
  // 콩이가 7월 22일에 이사 와 오늘이 100일째. 어제 '커피'를 썼고, 오늘이 서른다섯째 날이라 해바라기가 열린다
  const entries = [
    ...dayEntries('2026-07-22', 99).filter((_, i) => i % 3 === 0),
    { date: '2026-10-28', text: '커피를 샀다', mood: 'calm', writtenAt: Date.parse('2026-10-28T22:00:00+09:00') },
  ]
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  const before = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)

  await page.getByTestId('mood-great').click()
  await page.getByTestId('write-input').fill('카페 앞에서 커피를 마셨다')
  await page.getByTestId('write-submit').click()
  const note = page.getByTestId('build-note')
  // 줄은 정해 둔 차례로 모두 들어 있다(건물 → … → 기념일 → 꾸밈 소품)
  await expect(note).toContainText('카페가 두 번째로 생겼어요')
  await expect(note).toContainText('🎉 콩이가 이사 온 지 100일 되는 날이에요')
  await expect(note).toContainText('해바라기가 열렸어요')
  const cells = note.locator('.note-cell')
  const total = await cells.count()
  expect(total).toBeGreaterThan(3)
  const kinds = await cells.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid!))
  expect(kinds[0]).toBe('note-cell-building')
  expect(kinds.indexOf('note-cell-anniversary')).toBeLessThan(kinds.indexOf('note-cell-decor'))

  // 첫 장: 세 칸만, 말줄임 없이 감기고, 메아리 버튼은 마지막 장에
  await page.clock.runFor(1500)
  await finishAnimations(page)
  const pages = note.getByTestId('note-page')
  const count = Math.ceil(total / 3)
  await expect(pages).toHaveCount(count)
  await expect(pages.first().locator('.note-cell')).toHaveCount(3)
  await expect(pages.nth(1)).toBeHidden()
  await expect(page.getByTestId('note-echo')).toBeHidden()
  await expect(page.getByTestId('note-count')).toHaveText(`1 / ${count}`)
  const next = page.getByTestId('note-next')
  const nb = (await next.boundingBox())!
  expect(nb.height).toBeGreaterThanOrEqual(44)
  expect(nb.width).toBeGreaterThanOrEqual(44)
  const fits = () =>
    note.locator('.note-page:not([hidden]) .note-text').evaluateAll((els) =>
      els.every((e) => e.scrollWidth <= e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis' && e.getBoundingClientRect().height < 3 * parseFloat(getComputedStyle(e).lineHeight)),
    )
  expect(await fits()).toBe(true)
  await expect(note).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: 'test-results/screens/note-cells.png' })

  // "다음 ›"을 누르면 알림은 닫히지 않고 다음 장으로 넘어간다. 마지막 장에 메아리 버튼
  for (let i = 1; i < count; i++) await next.click()
  await expect(note).toBeVisible()
  await expect(pages.first()).toBeHidden()
  await expect(pages.last()).toBeVisible()
  await expect(next).toBeHidden()
  await expect(page.getByTestId('note-echo')).toBeVisible()
  await expect(page.getByTestId('note-echo')).toContainText("'커피' — 10월 28일에도 썼어요")
  expect(await fits()).toBe(true)
  await finishAnimations(page)
  await expect(note).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: 'test-results/screens/note-cells-next.png' })

  // 넘긴 장은 저장하지 않는다
  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)
  expect(Object.keys(stored).sort()).toEqual(Object.keys(before).sort())
  expect(stored.entries).toHaveLength(entries.length + 1)
  // 넘긴 장의 칸 수만큼 머문 뒤 닫힌다
  await page.clock.runFor(10000)
  await expect(note).toBeHidden()
})

test('달력 한 달 보기에서 "📖 이 달 이어 읽기"로 그달 한 줄들을 한 장에 읽고, 이웃한 달로 넘기고, 누르면 그 집 글을 연다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T14:00:00+09:00') })
  await page.goto('./')
  const entries = [...monthEntries('2026-08', [3, 20]), ...monthEntries('2026-10', [2, 5, 9, 20, 26])] as Entry[]
  entries[2] = { ...entries[2], text: '아침에 라떼 한 잔' }
  entries[3] = { ...entries[3], more: '바람이 좋아서 오래 걸었다. 길가에 코스모스가 피어 있었다.', treasured: true }
  entries[4] = { ...entries[4], text: '<b>소설</b>을 끝까지 읽었다' }
  entries[6] = { ...entries[6], text: '이사 짐을 거의 다 풀었다. 창밖으로 노을이 길게 번지고 새 동네 골목이 조금씩 눈에 익어 간다' }
  const erased = [{ date: '2026-10-10', erasedAt: Date.parse('2026-10-11T09:00:00+09:00') }]
  const data = { version: 1, entries, erased, monthTitles: { '2026-10': '이사한 달' } }
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify(data)])
  await page.reload()
  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-calendar').click()
  await page.getByTestId('calendar').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))

  // 쓴 날이 있는 달에만 단추가 있다
  const read = page.getByTestId('calendar-chapter')
  await expect(read).toHaveText('📖 이 달 이어 읽기')
  expect((await read.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: 'test-results/screens/chapter-button.png' })
  await page.getByTestId('calendar-prev').click()
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년 9월')
  await expect(read).toHaveCount(0)
  await page.getByTestId('calendar-next').click()

  // 장 제목과 그달 한 줄들이 날짜 순으로 이어진다(지운 날·빠진 날은 없다)
  await read.click()
  await expect(page.getByTestId('calendar-days')).toHaveCount(0)
  await expect(page.getByTestId('chapter-title')).toHaveText('10월 · 이사한 달')
  await expect(page.getByTestId('chapter-count')).toHaveText('2026년 · 한 줄 5일')
  const list = page.getByTestId('chapter-list').locator('.cal-hit')
  await expect(list).toHaveCount(5)
  expect(await list.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')))).toEqual([
    'hit-2026-10-02',
    'hit-2026-10-05',
    'hit-2026-10-09',
    'hit-2026-10-20',
    'hit-2026-10-26',
  ])
  await expect(page.getByTestId('hit-2026-10-02').locator('.cal-hit-date')).toHaveText('10월 2일 금요일 · ☕')
  await expect(page.getByTestId('hit-2026-10-05').locator('.cal-hit-date')).toHaveText('10월 5일 월요일 · 🏠 📝 💛')
  // 긴 글은 표시만 하고 글은 넣지 않는다. 꺾쇠는 글자 그대로
  await expect(page.getByTestId('chapter-list')).not.toContainText('코스모스')
  await expect(page.getByTestId('hit-2026-10-09')).toContainText('<b>소설</b>을 끝까지 읽었다')
  await expect(page.getByTestId('chapter-prev')).toHaveText('‹ 8월')
  await expect(page.getByTestId('chapter-next')).toBeHidden()
  for (const id of ['hit-2026-10-02', 'hit-2026-10-26', 'chapter-prev']) {
    const b = (await page.getByTestId(id).boundingBox())!
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(b.x + b.width).toBeLessThanOrEqual(390)
  }
  await page.getByTestId('chapter-title').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/screens/chapter-october-top.png' })
  await page.getByTestId('chapter-prev').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/screens/chapter-october.png' })

  // 쓴 날이 없는 9월은 건너뛰고 8월로 넘긴다
  await page.getByTestId('chapter-prev').click()
  await expect(page.getByTestId('chapter-title')).toHaveText('8월')
  await expect(page.getByTestId('chapter-count')).toHaveText('2026년 · 한 줄 2일')
  await expect(page.getByTestId('chapter-prev')).toBeHidden()
  await expect(page.getByTestId('chapter-next')).toHaveText('10월 ›')
  await page.screenshot({ path: 'test-results/screens/chapter-august.png' })

  // "한 달"을 누르면 읽던 달의 달력으로 돌아온다
  await page.getByTestId('calendar-mode-month').click()
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년 8월')
  await read.click()
  await page.getByTestId('chapter-next').click()
  await expect(page.getByTestId('chapter-title')).toHaveText('10월 · 이사한 달')

  // 한 줄을 누르면 창이 닫히고 그 집으로 가서 글을 연다
  await page.getByTestId('hit-2026-10-20').click()
  await expect(page.getByTestId('calendar')).toBeHidden()
  await page.clock.runFor(1500)
  await expect(page.getByTestId('reader-text')).toHaveText('2026-10 20일의 한 줄')

  // 읽기만 했으니 저장은 그대로다
  expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)).toEqual(data)
})

test('돌아보기 쪽지와 한 해 보기에서 이어 읽기로 들어가고, "📅 달력으로" 들어온 달력에 돌아간다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-03T21:00:00+09:00') })
  await page.goto('./')
  const entries = [...monthEntries('2026-08', [3, 20]), ...monthEntries('2026-10', [2, 5, 9]), ...monthEntries('2026-11', [1])]
  const data = { version: 1, entries, monthTitles: { '2026-10': '이사한 달' } }
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify(data)])
  await page.reload()

  // 지난달 돌아보기 쪽지 → 10월 달력 → 돌아보기 줄 바로 아래 "📖 이 달 이어 읽기"
  await page.getByTestId('recap').click()
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년 10월')
  await page.getByTestId('calendar-chapter').click()
  await expect(page.getByTestId('chapter-title')).toHaveText('10월 · 이사한 달')
  const back = page.getByTestId('chapter-calendar')
  await expect(back).toHaveText('📅 달력으로')
  await back.scrollIntoViewIfNeeded()
  // 세 단추는 한 줄에 겹치지 않고 놓인다(44px 이상, 화면 안)
  const [p, c, n] = await Promise.all(['chapter-prev', 'chapter-calendar', 'chapter-next'].map(async (id) => (await page.getByTestId(id).boundingBox())!))
  for (const b of [p, c, n]) {
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.width).toBeLessThanOrEqual(390)
  }
  expect(p.x + p.width).toBeLessThanOrEqual(c.x)
  expect(c.x + c.width).toBeLessThanOrEqual(n.x)
  expect(Math.abs(p.y - n.y)).toBeLessThan(2)
  await page.screenshot({ path: 'test-results/screens/chapter-nav-back.png' })
  // 8월로 넘긴 뒤 "달력으로"는 읽던 8월 달력이다
  await page.getByTestId('chapter-prev').click()
  await expect(page.getByTestId('chapter-title')).toHaveText('8월')
  await back.click()
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년 8월')
  await expect(page.getByTestId('calendar-mode-month')).toHaveAttribute('aria-pressed', 'true')

  // 한 해 보기 → "📖 2026년 첫 달부터 이어 읽기"로 8월부터 읽는다
  await page.getByTestId('calendar-mode-year').click()
  const fromYear = page.getByTestId('calendar-year-chapter')
  await expect(fromYear).toHaveText('📖 2026년 첫 달부터 이어 읽기')
  expect((await fromYear.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await fromYear.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/screens/chapter-year-button.png' })
  await fromYear.click()
  await expect(page.getByTestId('chapter-title')).toHaveText('8월')
  await expect(page.getByTestId('chapter-prev')).toBeHidden()
  await back.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/screens/chapter-from-year.png' })
  await page.getByTestId('chapter-next').click()
  await expect(page.getByTestId('chapter-title')).toHaveText('10월 · 이사한 달')
  // 한 해 보기에서 들어왔으면 "달력으로"는 그해 한 해 보기다
  await back.click()
  await expect(page.getByTestId('calendar-mode-year')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년')
  // 이어 읽다 "한 달"을 누르면 읽던 달 달력이다
  await fromYear.click()
  await page.getByTestId('chapter-next').click()
  await page.getByTestId('calendar-mode-month').click()
  await expect(page.getByTestId('calendar-title')).toHaveText('2026년 10월')

  // 읽기만 했으니 저장은 그대로다
  expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)).toEqual(data)
})

test('이어 읽기의 "🎵 이 달의 노래"는 쓴 날마다 한 음씩 울리며 그날 쪽지를 차례로 빛내고, 다시 누르거나 달을 넘기거나 닫으면 멈춘다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T14:00:00+09:00') })
  await page.addInitScript(listenSound)
  await page.goto('./')
  const entries = [...monthEntries('2026-08', [3, 20]), ...monthEntries('2026-10', [2, 5, 9, 20, 26])] as Entry[]
  const data = { version: 1, entries, monthTitles: { '2026-10': '이사한 달' } }
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify(data)])
  await page.reload()
  await page.getByTestId('village-stage').click()
  await page.getByTestId('book-calendar').click()
  await page.getByTestId('calendar').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  await page.getByTestId('calendar-chapter').click()

  const song = page.getByTestId('chapter-song')
  await expect(song).toHaveText('🎵 이 달의 노래')
  expect((await song.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: 'test-results/screens/song-button.png' })
  const heard = () => page.evaluate(() => (window as unknown as { notes: number[] }).notes.length)
  const before = await heard()
  await song.click()
  await expect(song).toHaveText('⏹ 노래 멈추기')
  await expect(song).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('chapter-song-line')).toBeHidden()
  // 쓴 날 다섯 음과 맺는 음 하나(음마다 바탕음과 배음)
  expect((await heard()) - before).toBe(12)
  const sing = page.locator('.cal-hit.sing')
  await page.clock.runFor(100)
  await expect(sing).toHaveCount(1)
  await expect(page.getByTestId('hit-2026-10-02')).toHaveClass(/sing/)
  await page.clock.runFor(350)
  await expect(page.getByTestId('hit-2026-10-05')).toHaveClass(/sing/)
  await expect(sing).toHaveCount(1)
  await sing.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  await page.screenshot({ path: 'test-results/screens/song-playing.png' })
  // 다시 누르면 멈춘다
  await song.click()
  await expect(song).toHaveText('🎵 이 달의 노래')
  await expect(sing).toHaveCount(0)
  await page.clock.runFor(1000)
  await expect(sing).toHaveCount(0)

  // 끝까지 울리면 단추가 처음대로 돌아온다(12초 안)
  await song.click()
  await page.clock.runFor(3000)
  await expect(song).toHaveText('🎵 이 달의 노래')
  await expect(sing).toHaveCount(0)

  // 달을 넘기면 멈춘다
  await song.click()
  await page.getByTestId('chapter-prev').click()
  await expect(page.getByTestId('chapter-title')).toHaveText('8월')
  await expect(song).toHaveAttribute('aria-pressed', 'false')
  await page.clock.runFor(1000)
  await expect(sing).toHaveCount(0)
  // 창을 닫아도 멈춘다
  await song.click()
  await page.getByTestId('calendar-close').click()
  await page.clock.runFor(1000)
  await expect(sing).toHaveCount(0)

  // 듣기만 했으니 저장은 그대로다
  expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)).toEqual(data)
})

test('소리를 꺼 두면 이 달의 노래는 빛으로만, 움직임 줄이기면 빛 없이 안내 한 줄로 흐른다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T14:00:00+09:00') })
  await page.addInitScript(listenSound)
  await page.goto('./')
  const data = { version: 1, entries: monthEntries('2026-10', [2, 5, 9]) }
  await page.evaluate(([k, s]) => (localStorage.setItem(k, s), localStorage.setItem('diary-village:sound', 'off')), [KEY, JSON.stringify(data)])
  await page.reload()
  const open = async () => {
    await page.getByTestId('village-stage').click()
    await page.getByTestId('book-calendar').click()
    await page.getByTestId('calendar').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
    await page.getByTestId('calendar-chapter').click()
  }
  await open()
  const heard = () => page.evaluate(() => (window as unknown as { notes: number[] }).notes.length)
  const before = await heard()
  await page.getByTestId('chapter-song').click()
  await expect(page.getByTestId('chapter-song-line')).toHaveText('🔇 소리를 꺼 두어서 빛으로만 따라가요')
  await page.clock.runFor(100)
  await expect(page.getByTestId('hit-2026-10-02')).toHaveClass(/sing/)
  expect(await heard()).toBe(before)
  await page.locator('.cal-hit.sing').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  await page.screenshot({ path: 'test-results/screens/song-silent.png' })

  // 움직임 줄이기 + 소리 켬: 빛 없이 안내 한 줄
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => localStorage.setItem('diary-village:sound', 'on'))
  await page.reload()
  await open()
  await page.getByTestId('chapter-song').click()
  await expect(page.getByTestId('chapter-song-line')).toHaveText('🎵 이 달의 노래가 흐르고 있어요')
  await page.clock.runFor(500)
  await expect(page.locator('.cal-hit.sing')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/screens/song-calm.png' })
  await page.clock.runFor(2000)
  await expect(page.getByTestId('chapter-song-line')).toBeHidden()
  await expect(page.getByTestId('chapter-song')).toHaveText('🎵 이 달의 노래')
})
