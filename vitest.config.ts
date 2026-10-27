import { defineConfig } from 'vitest/config'

// 날짜 경계(하루 한 줄)는 사용자 기준인 한국 시간으로 계산한다
process.env.TZ = 'Asia/Seoul'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'loop/**/*.test.mjs'],
  },
})
