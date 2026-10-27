import { test, expect } from 'vitest'
import { parseRateLimit, decideNext, shouldPush, oldLogs } from './lib.mjs'

const ev = (fu, fs, su, ss) =>
  JSON.stringify({
    type: 'rate_limit_event',
    rate_limit_info: {
      unifiedWindows: {
        five_hour: { utilization: fu, resetsAt: 1000, status: fs },
        seven_day: { utilization: su, resetsAt: 2000, status: ss },
      },
    },
  })
const NOW = 5_000_000
const base = { nowMs: NOW, stopFile: false, idleFile: false, rate: null, iteration: 0, maxIterations: null, consecutiveFailures: 0, maxConsecutiveFailures: 3, weeklyStopAt: 0.9, idleWaitMinutes: 60, failurePauseMinutes: 30 }

test('parseRateLimit: 마지막 이벤트 사용, 다른 줄 무시', () => {
  const text = ['{"type":"system"}', ev(0.1, 'allowed', 0.2, 'allowed'), 'not json', ev(0.3, 'allowed', 0.5, 'allowed')].join('\n')
  expect(parseRateLimit(text)).toEqual({
    fiveHour: { utilization: 0.3, resetsAt: 1000, status: 'allowed' },
    sevenDay: { utilization: 0.5, resetsAt: 2000, status: 'allowed' },
  })
  expect(parseRateLimit('{"type":"result"}')).toBeNull()
})

test('decideNext 순서: 멈추는 건 STOP 파일과 최대 바퀴뿐, 나머지는 기다렸다가 다시', () => {
  const r = (fu, fs, su, ss) => parseRateLimit(ev(fu, fs, su, ss))
  expect(decideNext({ ...base, stopFile: true, idleFile: true })).toEqual({ action: 'stop', reason: 'STOP 파일' })
  expect(decideNext({ ...base, iteration: 5, maxIterations: 5 })).toEqual({ action: 'stop', reason: '최대 바퀴' })
  expect(decideNext({ ...base, idleFile: true, rate: r(0.1, 'allowed', 0.9, 'allowed') })).toEqual({ action: 'wait', untilMs: 2_060_000, reason: '주간 사용량' })
  expect(decideNext({ ...base, rate: r(0.1, 'allowed', 0.5, 'rejected') })).toEqual({ action: 'wait', untilMs: 2_060_000, reason: '주간 사용량' })
  expect(decideNext({ ...base, rate: r(1, 'rejected', 0.5, 'allowed') })).toEqual({ action: 'wait', untilMs: 1_060_000, reason: '5시간 한도' })
  expect(decideNext({ ...base, consecutiveFailures: 3, idleFile: true })).toEqual({ action: 'wait', untilMs: NOW + 30 * 60_000, reason: '연속 실패', reset: 'failures' })
  expect(decideNext({ ...base, idleFile: true })).toEqual({ action: 'wait', untilMs: NOW + 60 * 60_000, reason: '할 일 없음', reset: 'idle' })
  expect(decideNext({ ...base, rate: r(0.5, 'allowed', 0.89, 'allowed') })).toEqual({ action: 'run' })
  expect(decideNext(base)).toEqual({ action: 'run' })
})

test('decideNext: 주간 한도의 되돌아오는 시각을 모르면 한 시간 뒤 다시 본다', () => {
  const rate = { fiveHour: { utilization: 0, resetsAt: 1000, status: 'allowed' }, sevenDay: { utilization: 0.95, resetsAt: undefined, status: 'allowed' } }
  expect(decideNext({ ...base, rate })).toEqual({ action: 'wait', untilMs: NOW + 60 * 60_000, reason: '주간 사용량' })
})

test('decideNext: 푸시가 계속 실패해도 멈추지 않음', () => {
  expect(decideNext({ ...base, consecutivePushFailures: 10 })).toEqual({ action: 'run' })
})

test('oldLogs: 이름순(시각순)으로 최근 keep개만 남기고 나머지를 돌려준다', () => {
  const names = ['2026-10-24T03.jsonl', '2026-10-24T01.jsonl', 'runs.jsonl', '2026-10-24T02.jsonl', 'user-files']
  expect(oldLogs(names, 2)).toEqual(['2026-10-24T01.jsonl'])
  expect(oldLogs(names, 5)).toEqual([])
  expect(oldLogs(['b', 'a', 'c'], 1, (n) => true)).toEqual(['a', 'b'])
})

test('shouldPush', () => {
  expect(shouldPush(null, 0, 60)).toBe(true)
  expect(shouldPush(0, 59 * 60_000, 60)).toBe(false)
  expect(shouldPush(0, 60 * 60_000, 60)).toBe(true)
})

import { moveFeedback, leftoverPaths } from './lib.mjs'

const FB = (newItems, done = '') => `# 피드백\n\n> 안내\n\n## 새 피드백\n${newItems}\n## 처리됨\n${done}`

test('moveFeedback: 새 피드백을 원문 그대로 할일 맨 위로, 피드백은 처리됨으로', () => {
  const todo = '# 할 일\n\n> 안내\n\n- [ ] 기존 일\n'
  const r = moveFeedback(FB('- 버튼이 너무 작아\n보스가 너무 세\n\n'), todo, '2026-10-25')
  expect(r.moved).toBe(2)
  expect(r.todo).toBe('# 할 일\n\n> 안내\n\n- [ ] (피드백 2026-10-25) 버튼이 너무 작아\n- [ ] (피드백 2026-10-25) 보스가 너무 세\n- [ ] 기존 일\n')
  expect(r.feedback).toBe('# 피드백\n\n> 안내\n\n## 새 피드백\n\n## 처리됨\n- (2026-10-25) 버튼이 너무 작아\n- (2026-10-25) 보스가 너무 세\n')
})

test('moveFeedback: 새 피드백이 없으면 그대로', () => {
  const fb = FB('\n')
  const r = moveFeedback(fb, '# 할 일\n', '2026-10-25')
  expect(r).toEqual({ moved: 0, feedback: fb, todo: '# 할 일\n' })
})

test('moveFeedback: 할일에 목록이 비어 있으면 끝에 붙임', () => {
  const r = moveFeedback(FB('- 하나\n'), '# 할 일\n\n> 안내\n', '2026-10-25')
  expect(r.todo).toBe('# 할 일\n\n> 안내\n- [ ] (피드백 2026-10-25) 하나\n')
})

test('leftoverPaths: 사용자 파일과 무시할 경로를 뺀 변경만', () => {
  const z = [' M 피드백.md', ' M 기획서.md', ' M src/a.ts', '?? loop/new.txt', 'R  b.ts', 'old.ts', ''].join('\0')
  expect(leftoverPaths(z, ['피드백.md', '기획서.md'])).toEqual(['src/a.ts', 'loop/new.txt', 'b.ts'])
})

