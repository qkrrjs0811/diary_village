// 루프 실행기: claude -p 를 한 바퀴씩 반복 실행한다.
// 사용법: npm run loop | npm run loop:once | node loop/run.mjs --cleanup-only
// 한 번 실행하면 멈추지 않는다. 할 일 없음·연속 실패·사용량 한도는 기다렸다가 다시 한다.
// 멈춤: 저장소 루트에 STOP 파일을 만든다. 실행기가 스스로 위험하다고 판단해 멈출 때도 STOP 파일에 이유를 적는다.
import { spawn, execFileSync } from 'node:child_process'
import { appendFileSync, copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decideNext, leftoverPaths, moveFeedback, oldLogs, parseRateLimit, shouldPush } from './lib.mjs'
import { isAncestor, killTree, revertInProgress, safeRevert } from './git.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOGS = join(ROOT, 'loop', 'logs')
const STOP = join(ROOT, 'STOP')
const IDLE = join(ROOT, 'IDLE') // 세션은 loop/ 에 쓸 수 없으므로 루트에 둔다
const FEEDBACK = '피드백.md'
const TODO = '할일.md'
const USER_FILES = [FEEDBACK, '기획서.md'] // 사용자 소유: 실행기가 치우거나 되돌리지 않는다
const args = new Set(process.argv.slice(2))

// 시작할 때 한 번만 읽는다. 세션이 이 파일들을 고쳐도 이번 실행에는 반영되지 않는다
const config = JSON.parse(readFileSync(join(ROOT, 'loop', 'config.json'), 'utf8'))
const PROMPT = readFileSync(join(ROOT, 'loop', 'PROMPT.md'), 'utf8')
// 루프 세션 전용 권한. .claude/settings.json 에 두면 사람이 쓰는 대화에도 같이 걸리므로 따로 둔다
const PERMISSIONS = JSON.parse(readFileSync(join(ROOT, 'loop', 'permissions.json'), 'utf8'))

mkdirSync(LOGS, { recursive: true })

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-')
const today = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD
const log = (msg) => console.log(`[${new Date().toLocaleString('ko-KR')}] ${msg}`)
// trim 하지 않은 출력. status --porcelain 은 첫 줄이 공백으로 시작할 수 있어 trim 하면 경로 첫 글자가 잘린다
const gitRaw = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const git = (...a) => gitRaw(...a).trim()
const record = (entry) => appendFileSync(join(LOGS, 'runs.jsonl'), JSON.stringify(entry) + '\n')

/** 위험한 상태라 사람이 봐야 할 때: STOP 에 이유를 적고, 푸시하지 않고 끝낸다 */
function halt(reason, extra = {}) {
  writeFileSync(STOP, `${new Date().toISOString()} 실행기가 멈춤: ${reason}\n`)
  record({ event: 'halt', at: new Date().toISOString(), reason, ...extra })
  log(`위험 정지: ${reason}`)
  process.exit(1)
}

/** 프로세스를 띄워 출력을 모은다. 시간 초과면 트리 전체를 끝내고, close 가 안 와도 결과를 돌려준다 */
function runProcess(file, argv, { input, timeoutMs, logPath, shell = false }) {
  return new Promise((resolve) => {
    const child = spawn(file, argv, { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'], shell })
    const out = logPath ? createWriteStream(logPath, { flags: 'a' }) : null
    let text = ''
    let timedOut = false
    let settled = false
    const finish = (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(fallback)
      out?.end()
      resolve({ text, code, timedOut })
    }
    let fallback
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child.pid)
      fallback = setTimeout(() => finish(null), 30_000)
    }, timeoutMs)
    child.stdout.on('data', (d) => {
      text += d
      out?.write(d)
    })
    child.stderr.on('data', (d) => out?.write(d))
    child.on('error', (e) => {
      out?.write(`spawn 오류: ${e.message}\n`)
      finish(null)
    })
    child.on('close', finish)
    child.stdin.end(input ?? '')
  })
}

function runClaude({ model, prompt, timeoutMs, logPath, permissionMode }) {
  const cli = ['-p', '--model', model, '--output-format', 'stream-json', '--verbose']
  // 사용자 전역 설정(플러그인·스킬·훅·MCP)을 빼고 이 저장소 설정만 쓴다. 질문을 요구하는 스킬이 혼자 도는 세션을 멈추지 않게
  cli.push('--setting-sources', 'project,local', '--disable-slash-commands', '--strict-mcp-config')
  cli.push('--allowedTools', ...PERMISSIONS.allow, '--disallowedTools', ...PERMISSIONS.deny)
  if (permissionMode) cli.push('--permission-mode', permissionMode)
  return runProcess('claude', cli, { input: prompt, timeoutMs, logPath })
}

/** 바퀴마다 사용자 파일 사본을 남긴다. 무슨 일이 생겨도 되살릴 수 있게 */
function backupUserFiles() {
  const dir = join(LOGS, 'user-files', stamp())
  mkdirSync(dir, { recursive: true })
  for (const f of USER_FILES) if (existsSync(join(ROOT, f))) copyFileSync(join(ROOT, f), join(dir, f))
}

/** 새 피드백을 할 일로 옮기고 바로 커밋한다. 세션이 실패해도 피드백이 사라지지 않게 세션 전에 한다 */
function moveFeedbackAndCommit() {
  const r = moveFeedback(readFileSync(join(ROOT, FEEDBACK), 'utf8'), readFileSync(join(ROOT, TODO), 'utf8'), today())
  if (r.moved === 0) return 0
  writeFileSync(join(ROOT, FEEDBACK), r.feedback)
  writeFileSync(join(ROOT, TODO), r.todo)
  git('add', '--', FEEDBACK, TODO)
  git('commit', '-q', '-m', `chore: 피드백 ${r.moved}건을 할 일로 옮김`, '--', FEEDBACK, TODO)
  log(`피드백 ${r.moved}건을 할 일로 옮김`)
  return r.moved
}

/** 사용자 파일을 뺀 남은 변경을 stash 로 치운다(되살릴 수 있게). reset·clean 은 쓰지 않는다 */
function cleanup() {
  const paths = leftoverPaths(gitRaw('status', '--porcelain', '-z', '-uall'), USER_FILES)
  if (paths.length === 0) return null
  const message = `loop-leftover-${stamp()}`
  git('stash', 'push', '-u', '-m', message, '--', ...paths)
  log(`남은 변경 ${paths.length}개를 stash 로 치움`)
  return { message, paths }
}

function unpushedCount() {
  try {
    return Number(git('rev-list', '--count', 'origin/main..HEAD'))
  } catch {
    return Number(git('rev-list', '--count', 'HEAD'))
  }
}

function push() {
  try {
    git('push', 'origin', 'main')
    log('원격에 푸시함')
    return { pushed: true }
  } catch (e) {
    const error = String(e.stderr || e.message).trim().split('\n').pop()
    log(`푸시 실패: ${error}`)
    return { pushed: false, error }
  }
}

/** 멈추지 않고 오래 돌아도 디스크가 차지 않게, 최근 keepLogs개 바퀴의 로그·사용자 파일 사본만 남긴다 */
function pruneLogs() {
  try {
    for (const n of oldLogs(readdirSync(LOGS), config.keepLogs)) rmSync(join(LOGS, n), { force: true })
    const copies = join(LOGS, 'user-files')
    if (existsSync(copies)) for (const n of oldLogs(readdirSync(copies), config.keepLogs, () => true)) rmSync(join(copies, n), { recursive: true, force: true })
  } catch (e) {
    log(`오래된 로그 정리 실패(계속함): ${e.message}`)
  }
}

async function sleepUntil(untilMs) {
  while (Date.now() < untilMs && !existsSync(STOP)) await new Promise((r) => setTimeout(r, 60_000))
}

async function main() {
  if (args.has('--cleanup-only')) {
    cleanup()
    return
  }
  if (existsSync(STOP)) {
    record({ event: 'stop', at: new Date().toISOString(), reason: 'STOP 파일', iteration: 0 })
    log('멈춤: STOP 파일')
    return
  }
  if (revertInProgress(ROOT)) halt('되돌리기(revert)가 진행 중인 상태로 남아 있음')
  // 다시 시작했다는 건 할 일이 생겼다는 뜻이다(예: 기획서를 고침)
  if (existsSync(IDLE)) {
    unlinkSync(IDLE)
    log('지난번 "할 일 없음" 표시를 지우고 시작')
  }

  log('사용량 확인 중')
  const probe = await runClaude({ model: 'haiku', prompt: 'OK라고만 답해', timeoutMs: 120_000 })
  let rate = parseRateLimit(probe.text)
  log(`주간 사용률 ${rate ? Math.round(rate.sevenDay.utilization * 100) + '%' : '알 수 없음'}`)

  let iteration = 0
  let consecutiveFailures = 0
  let consecutivePushFailures = 0
  let lastPushMs = null

  const pushNow = () => {
    const p = push()
    if (p.pushed) {
      lastPushMs = Date.now()
      consecutivePushFailures = 0
    } else consecutivePushFailures++
    return p
  }

  for (;;) {
    const decision = decideNext({
      nowMs: Date.now(),
      stopFile: existsSync(STOP),
      idleFile: existsSync(IDLE),
      rate,
      iteration,
      maxIterations: args.has('--once') ? 1 : config.maxIterations,
      consecutiveFailures,
      maxConsecutiveFailures: config.maxConsecutiveFailures,
      weeklyStopAt: config.weeklyStopAt,
      idleWaitMinutes: config.idleWaitMinutes,
      failurePauseMinutes: config.failurePauseMinutes,
    })

    if (decision.action === 'stop') {
      const p = unpushedCount() > 0 ? push() : { pushed: 'skipped' }
      record({ event: 'stop', at: new Date().toISOString(), reason: decision.reason, iteration, ...p })
      log(`멈춤: ${decision.reason}`)
      return
    }
    if (decision.action === 'wait') {
      // 기다리는 동안에도 폰에서 새 버전을 받을 수 있게 먼저 올린다
      const p = unpushedCount() > 0 ? pushNow() : { pushed: 'skipped' }
      record({ event: 'wait', at: new Date().toISOString(), reason: decision.reason, until: new Date(decision.untilMs).toISOString(), iteration, ...p })
      log(`대기: ${decision.reason}, ${new Date(decision.untilMs).toLocaleString('ko-KR')}까지 (멈추려면 STOP 파일)`)
      await sleepUntil(decision.untilMs)
      if (decision.reset === 'idle' && existsSync(IDLE)) unlinkSync(IDLE)
      if (decision.reset === 'failures') consecutiveFailures = 0
      rate = null // 다음 바퀴 출력에서 다시 읽는다
      continue
    }

    iteration++
    try {
      await runIteration()
    } catch (e) {
      // 예상 못 한 오류(일시적인 git 잠금 등)는 실패 한 번으로 세고 계속 간다. 위험한 상태는 halt()가 따로 멈춘다
      consecutiveFailures++
      record({ event: 'error', at: new Date().toISOString(), iteration, error: String(e?.message ?? e).split('\n')[0], stack: String(e?.stack ?? e) })
      log(`${iteration}바퀴 오류(계속함): ${String(e?.message ?? e).split('\n')[0]}`)
    }
  }

  async function runIteration() {
    pruneLogs()
    const startedAt = new Date().toISOString()
    const logPath = join(LOGS, `${stamp()}.jsonl`)
    backupUserFiles()
    const feedbackMoved = moveFeedbackAndCommit()
    const prevHead = git('rev-parse', 'HEAD')
    log(`${iteration}바퀴 시작`)

    const out = await runClaude({
      model: config.model,
      prompt: PROMPT,
      timeoutMs: config.iterationTimeoutMinutes * 60_000,
      logPath,
      permissionMode: 'acceptEdits',
    })
    rate = parseRateLimit(out.text) ?? rate

    const stashed = cleanup()
    const head = git('rev-parse', 'HEAD')
    let result
    if (head !== prevHead) {
      if (!isAncestor(ROOT, prevHead, head)) halt('세션이 이전 커밋을 고쳐 썼음(amend 등)', { prevHead, head, log: logPath })
      const check = await runProcess('npm', ['run', 'check'], { timeoutMs: config.checkTimeoutMinutes * 60_000, logPath, shell: true })
      if (check.code === 0) {
        result = 'committed'
        consecutiveFailures = 0
      } else {
        const r = safeRevert(ROOT, prevHead)
        if (!r.ok) halt(`검사 실패 후 되돌리기도 실패: ${r.error}`, { prevHead, head, log: logPath })
        result = check.timedOut ? 'check-timeout-reverted' : 'check-failed-reverted'
        consecutiveFailures++
      }
    } else if (existsSync(IDLE)) {
      result = 'idle'
    } else {
      result = out.timedOut ? 'timeout' : 'no-commit'
      consecutiveFailures++
    }

    let p = { pushed: 'skipped' }
    if (unpushedCount() > 0 && shouldPush(lastPushMs, Date.now(), config.pushIntervalMinutes)) p = pushNow()

    record({
      iteration,
      startedAt,
      endedAt: new Date().toISOString(),
      prevHead,
      head: git('rev-parse', 'HEAD'),
      result,
      feedbackMoved,
      stashed,
      ...p,
      exitCode: out.code,
      fiveHour: rate?.fiveHour ?? null,
      sevenDay: rate?.sevenDay ?? null,
      log: logPath,
      ...(consecutivePushFailures > 0 ? { consecutivePushFailures } : {}),
    })
    log(`${iteration}바퀴 끝: ${result}`)
  }
}

main().catch((e) => halt(`실행기 오류: ${String(e?.message ?? e).split('\n')[0]}`, { stack: String(e?.stack ?? e) }))
