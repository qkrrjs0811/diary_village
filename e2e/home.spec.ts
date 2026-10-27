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
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('{broken')
})
