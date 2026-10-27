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
  await page.clock.runFor(1500)
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

  // 끌어서 지난달 구역을 본다
  const box = (await page.getByTestId('village').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 60)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + 300, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByTestId('month-2026-09')).toBeInViewport()
  await expect(page.getByTestId('reader')).toBeHidden() // 끌기는 누름이 아니다
  await page.screenshot({ path: 'test-results/screens/home-drag.png' })
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
