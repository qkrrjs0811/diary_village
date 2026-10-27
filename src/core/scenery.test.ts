import { describe, expect, it } from 'vitest'
import { blockScenery, PLAZA_TREES } from './scenery'
import { buildVillage, hash } from './village'
import { LANDMARKS } from './landmark'
import type { Entry } from './types'

const e = (date: string): Entry => ({ date, text: date, mood: 'calm', writtenAt: 0 })

// 2026년 10월: 1일이 목요일(4번째 칸)이라 첫 줄 0~3칸과 여섯째 줄(31일이 다섯째 줄 토요일)이 달력 밖이다
const october = (entries: Entry[] = [], today = '2026-10-28') => buildVillage(entries, today).blocks[0]

/** 칸 (col,row) 바로 뒤(화면 위쪽으로 이웃한) 세 칸 */
const behind = (col: number, row: number) => [
  [col - 1, row],
  [col, row - 1],
  [col - 1, row - 1],
]

describe('빈 땅 나무·꽃 자리', () => {
  it('집·건물 바로 앞(화면 아래쪽으로 이웃한) 칸에는 나무가 서지 않는다', () => {
    const block = october()
    const lots = new Set(block.lots.map((l) => `${l.col},${l.row}`))
    const trees = blockScenery(block, '2026-10-28').filter((s) => s.kind === 'tree')
    expect(trees.length).toBeGreaterThan(0)
    for (const t of trees) {
      expect(lots.has(`${t.col},${t.row}`)).toBe(false)
      for (const [c, r] of behind(t.col, t.row)) expect(lots.has(`${c},${r}`)).toBe(false)
    }
  })

  it('나무가 설 자리였던 집 앞 칸에는 꽃·풀이 난다', () => {
    const block = october()
    const scenery = blockScenery(block, '2026-10-28')
    // 31일(토, 6칸·다섯째 줄 row 4) 아래 여섯째 줄은 모두 달력 밖이고 다섯째 줄 집들 바로 앞이다
    for (let col = 0; col < 7; col++) {
      const s = scenery.find((x) => x.col === col && x.row === 5)
      if (hash(`2026-10:${col}:5`) % 5 < 3) expect(s?.kind).toBe('flowers')
      else expect(s).toBeUndefined()
    }
  })

  it('집과 떨어진 달력 밖 칸은 예전처럼 날짜로 정한 나무숲이다', () => {
    const scenery = blockScenery(october(), '2026-10-28')
    // 첫 줄 0~3칸은 앞에도 뒤에도 그달의 날이 없다
    for (let col = 0; col < 4; col++) {
      const s = scenery.find((x) => x.col === col && x.row === 0)
      const seed = hash(`2026-10:${col}:0`)
      if (seed % 5 < 3) expect(s).toEqual({ col, row: 0, gx: col, gy: 0, kind: 'tree', seed })
      else expect(s).toBeUndefined()
    }
  })

  it('지난 빈 날에는 가끔 꽃이 피고, 집이 선 날·오늘·앞날에는 아무것도 없다', () => {
    const block = october([e('2026-10-05')])
    const scenery = blockScenery(block, '2026-10-28')
    for (const lot of block.lots) {
      const s = scenery.find((x) => x.col === lot.col && x.row === lot.row)
      const seed = hash(`2026-10:${lot.col}:${lot.row}`)
      if (!lot.entry && lot.date < '2026-10-28' && seed % 3 === 0) expect(s?.kind).toBe('flowers')
      else expect(s).toBeUndefined()
    }
  })

  it('나무 자리는 기록으로 바뀌지 않는다(집을 지어도 옆 나무가 갑자기 사라지지 않는다)', () => {
    const trees = (entries: Entry[]) => blockScenery(october(entries), '2026-10-28').filter((s) => s.kind === 'tree')
    expect(trees([e('2026-10-01'), e('2026-10-31')])).toEqual(trees([]))
  })

  it('광장 모서리 나무는 명소 자리도, 명소 바로 앞도 아니다', () => {
    for (const [col, row] of PLAZA_TREES) {
      for (const l of LANDMARKS) {
        expect([l.col, l.row]).not.toEqual([col, row])
        for (const [c, r] of behind(col, row)) expect([l.col, l.row]).not.toEqual([c, r])
      }
    }
  })
})
