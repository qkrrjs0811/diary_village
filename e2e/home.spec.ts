import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'

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
  const entries = monthEntries('2026-10', [6, 9, 13, 15, 20, 22, 24, 25, 26])
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

test('365일을 쓴 마을에는 명소 7곳이 모두 서고, 가져오기로 한꺼번에 넘으면 함께 축하한다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  const entries = dayEntries('2025-10-27', 365)
  await page.getByTestId('settings-open').click()
  await page.getByTestId('backup-file').setInputFiles({ name: 'diary-village.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, entries })) })
  await page.getByTestId('import-ok').click()
  await expect(page.getByTestId('celebrate')).toBeVisible()
  await expect(page.getByTestId('celebrate-title')).toHaveText('🎉 명소 7곳이 생겼어요!')
  await expect(page.getByTestId('celebrate-body')).toHaveText('한 줄을 365일 남겼어요. 광장에 우물, 꽃 정원, 분수, 다리, 시계탑, 풍차, 무지개 큰 나무가 섰어요.')
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

  // 첫 한 줄을 쓰면 첫 주민이 오늘 구역 길에 온다
  await page.getByTestId('mood-calm').click()
  await page.getByTestId('write-input').fill('라떼 한 잔 마신 날')
  await page.getByTestId('write-submit').click()
  await expect(page.locator('.resident')).toHaveCount(1)
  await page.clock.runFor(4000)
  await finishAnimations(page)
  const kong = page.getByTestId('resident-kong')
  await expect(kong).toBeInViewport()
  // 걷는 중이다
  const walking = await page.evaluate(() => document.getAnimations().some((a) => (a as CSSAnimation).animationName === 'stroll' && a.playState === 'running'))
  expect(walking).toBe(true)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/resident-first.png' })

  // 누르면 짧은 한마디. 다시 누르면 다른 말
  await kong.click({ force: true })
  await expect(page.getByTestId('build-note')).toHaveText('콩이: “새로 생긴 카페에 가 봤어요!”')
  const box = (await page.getByTestId('build-note').boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'test-results/screens/resident-talk.png' })
  await kong.click({ force: true })
  await expect(page.getByTestId('build-note')).not.toHaveText('콩이: “새로 생긴 카페에 가 봤어요!”')
  await expect(page.getByTestId('build-note')).toContainText('콩이: “')

  // 40일을 쓴 마을에는 주민 10명이 오늘 구역 길과 광장을 걷는다
  const entries = dayEntries('2026-09-18', 40)
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, s as string), [KEY, JSON.stringify({ version: 1, entries })])
  await page.reload()
  await expect(page.locator('.resident')).toHaveCount(10)
  await finishAnimations(page)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/residents-town.png' })
  await zoomToPlaza(page, 3)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  await page.screenshot({ path: 'test-results/screens/residents-plaza.png' })

  // 다시 열어도 주민은 그대로(마을은 기록에서 계산한다)
  await page.reload()
  await expect(page.locator('.resident')).toHaveCount(10)
})

test('오늘 기분에 따라 마을 하늘에 해·구름·비·별이 뜨고, 누르기를 막지 않는다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T21:00:00+09:00') })
  await page.goto('./')
  // 오늘 자리가 비었으면 구름 조금 낀 하늘
  await expect(page.getByTestId('sky').locator('.sun')).toHaveCount(1)
  await expect(page.getByTestId('sky').locator('.cloud')).toHaveCount(3)
  await expect(page.getByTestId('rain').locator('.drop')).toHaveCount(0)

  const today = (mood: string, text = '오늘의 한 줄') =>
    JSON.stringify({ version: 1, entries: [{ date: '2026-10-27', text, mood, writtenAt: Date.parse('2026-10-27T20:00:00+09:00') }] })
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
