import { defineConfig } from '@playwright/test'

const baseURL = 'http://localhost:4174/diary_village/'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL, viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR' },
  webServer: { command: 'npm run preview -- --port 4174 --strictPort', url: baseURL, reuseExistingServer: false },
})
