// 실행기가 쓰는 git·프로세스 도우미. 실패해도 저장소를 어중간한 상태로 남기지 않는다.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const run = (root, ...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

export function revertInProgress(root) {
  const gitDir = join(root, run(root, 'rev-parse', '--git-dir'))
  return existsSync(join(gitDir, 'REVERT_HEAD')) || existsSync(join(gitDir, 'sequencer'))
}

export function isAncestor(root, a, b) {
  return spawnSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: root }).status === 0
}

/** prevHead 이후 커밋을 되돌린다. 막히면 --abort 로 시작 전 상태로 돌려놓고 실패를 알린다 */
export function safeRevert(root, prevHead) {
  try {
    run(root, 'revert', '--no-edit', `${prevHead}..HEAD`)
    return { ok: true }
  } catch (e) {
    try {
      if (revertInProgress(root)) run(root, 'revert', '--abort')
    } catch {
      // abort 도 실패하면 아래 오류만 알린다. 실행기는 멈추고 푸시하지 않는다
    }
    return { ok: false, error: String(e.stderr || e.message).split('\n')[0] }
  }
}

/** 윈도우에서 child.kill() 은 자식만 끝내므로, 프로세스 트리 전체를 끝낸다 */
export function killTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
  else {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // 이미 끝남
    }
  }
}
