import { test, expect } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isAncestor, revertInProgress, safeRevert, killTree } from './git.mjs'

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'loop-git-'))
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  g('init', '-q', '-b', 'main')
  g('config', 'user.email', 't@t')
  g('config', 'user.name', 't')
  const commit = (file, text, msg) => {
    writeFileSync(join(dir, file), text)
    g('add', file)
    g('commit', '-q', '-m', msg)
    return g('rev-parse', 'HEAD')
  }
  return { dir, g, commit }
}

test('safeRevert: 정상이면 prevHead 이후 커밋을 되돌림', () => {
  const { dir, commit } = repo()
  const prev = commit('a.txt', '1', 'base')
  commit('a.txt', '2', 'loop')
  expect(safeRevert(dir, prev)).toEqual({ ok: true })
  expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('1')
})

test('safeRevert: 되돌리다 막히면 중단하고 진행 중 상태를 남기지 않으며 사용자 글을 지킴', () => {
  const { dir, commit } = repo()
  commit('피드백.md', 'v1', 'base')
  const prev = commit('a.txt', '1', 'base2')
  commit('피드백.md', 'v2', 'loop touched feedback')
  writeFileSync(join(dir, '피드백.md'), 'user typing')
  const r = safeRevert(dir, prev)
  expect(r.ok).toBe(false)
  expect(revertInProgress(dir)).toBe(false)
  expect(readFileSync(join(dir, '피드백.md'), 'utf8')).toBe('user typing')
})

test('isAncestor: amend 로 prevHead 가 바뀌면 false', () => {
  const { dir, g, commit } = repo()
  commit('a.txt', '1', 'base')
  const prev = commit('a.txt', '2', 'second')
  expect(isAncestor(dir, prev, 'HEAD')).toBe(true)
  writeFileSync(join(dir, 'a.txt'), '3')
  g('commit', '-q', '-a', '--amend', '-m', 'amended')
  expect(isAncestor(dir, prev, 'HEAD')).toBe(false)
})

test.runIf(process.platform === 'win32')('killTree: 손자 프로세스까지 끝냄', async () => {
  const script = "const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000)"
  const parent = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'] })
  const gpid = await new Promise((res) => parent.stdout.once('data', (d) => res(Number(String(d).trim()))))
  killTree(parent.pid)
  await new Promise((r) => setTimeout(r, 1000))
  const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
  expect(alive(gpid)).toBe(false)
  expect(alive(parent.pid)).toBe(false)
})
