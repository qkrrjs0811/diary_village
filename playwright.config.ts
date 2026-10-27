import { defineConfig } from '@playwright/test'

const baseURL = 'http://localhost:4174/diary_village/'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // 숨은 크롬을 한꺼번에 많이 띄우면 메모리(16GB)가 모자라 루프가 멈춘 적이 있다
  workers: 2,
  use: { baseURL, viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR' },
  webServer: { command: 'npm run preview -- --port 4174 --strictPort', url: baseURL, reuseExistingServer: false },
})
