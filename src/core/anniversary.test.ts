import { describe, expect, it } from 'vitest'
import { anniversariesOn, anniversaryLine, anniversaryNote, anniversaryOf, nextAnniversary } from './anniversary'
import { RESIDENTS, arrivalsOf } from './resident'
import { addDays } from './date'
import type { Dated } from './types'

/** start 부터 n일을 이어서 지은 날 */
const days = (n: number, start = '2026-01-01'): Dated[] => Array.from({ length: n }, (_, i) => ({ date: addDays(start, i) }))
const byId = (id: string) => RESIDENTS.find((r) => r.id === id)!

describe('이웃의 이사 기념일', () => {
  it('이사 온 날을 1일째로 세어 100·200·300일째 날이 기념일이다', () => {
    expect(anniversaryOf('2026-01-01', '2026-04-10')).toEqual({ label: '100일' })
    expect(anniversaryOf('2026-01-01', addDays('2026-01-01', 199))).toEqual({ label: '200일' })
    expect(anniversaryOf('2026-01-01', addDays('2026-01-01', 299))).toEqual({ label: '300일' })
    expect(anniversaryOf('2026-01-01', addDays('2026-01-01', 100))).toBeNull()
    expect(anniversaryOf('2026-01-01', addDays('2026-01-01', 399))).toBeNull()
  })

  it('해마다 같은 달·날이 1년·2년 기념일이다', () => {
    expect(anniversaryOf('2026-03-05', '2027-03-05')).toEqual({ label: '1년' })
    expect(anniversaryOf('2026-03-05', '2028-03-05')).toEqual({ label: '2년' })
    expect(anniversaryOf('2026-03-05', '2027-03-06')).toBeNull()
  })

  it('이사 온 날 당일과 그 이전은 기념일이 아니다', () => {
    expect(anniversaryOf('2026-03-05', '2026-03-05')).toBeNull()
    expect(anniversaryOf('2026-03-05', '2025-03-05')).toBeNull()
  })

  it('2월 29일에 온 이웃은 평년엔 2월 28일에 맞는다', () => {
    expect(anniversaryOf('2028-02-29', '2029-02-28')).toEqual({ label: '1년' })
    expect(anniversaryOf('2028-02-29', '2029-03-01')).toBeNull()
    expect(anniversaryOf('2028-02-29', '2032-02-29')).toEqual({ label: '4년' })
    expect(anniversaryOf('2028-02-29', '2032-02-28')).toBeNull()
  })

  it('그날 기념일인 이웃들을 이사 온 차례로 꺼낸다', () => {
    const built = days(10) // 콩이 1/1, 모모 1/3, 보리 1/5, 두부 1/7, 호두 1/10
    const on = anniversariesOn(built, '2026-04-10')
    expect(on.map((a) => a.resident.id)).toEqual(['kong'])
    expect(on[0].label).toBe('100일')
    expect(anniversariesOn(built, '2027-01-03').map((a) => a.resident.id)).toEqual(['momo'])
    expect(anniversariesOn(built, '2026-01-01')).toEqual([])
    // 두 이웃이 같은 날 기념일이면 이사 온 차례로
    const both = [...days(1), { date: '2026-04-11' }, { date: '2026-04-12' }] // 모모 4/12(3번째 날)
    expect(anniversariesOn(both, '2027-04-12').map((a) => a.resident.id)).toEqual(['momo'])
    const pair = [{ date: '2026-01-01' }, { date: '2026-01-02' }, { date: '2026-04-11' }] // 콩이 1/1, 모모 4/11
    expect(anniversariesOn(pair, '2027-04-11').map((a) => a.resident.id)).toEqual(['momo'])
    expect(anniversariesOn(pair, '2027-01-01').map((a) => a.resident.id)).toEqual(['kong'])
    const same = [{ date: '2025-01-01' }, { date: '2025-09-22' }, { date: '2026-01-01' }] // 콩이 25/1/1, 모모 26/1/1
    expect(anniversariesOn(same, '2027-01-01').map((a) => [a.resident.id, a.label])).toEqual([
      ['kong', '2년'],
      ['momo', '1년'],
    ])
  })

  it('쓰지 않은 날에도 기념일은 온다(빠진 날에 벌이 없다)', () => {
    const built = days(1) // 콩이만 1/1에 오고 그 뒤로 쓰지 않음
    expect(anniversariesOn(built, '2027-01-01').map((a) => a.resident.id)).toEqual(['kong'])
  })

  it('이사 온 날은 지운 날을 포함한 지은 날로 정해 지워도 바뀌지 않는다', () => {
    const built = days(10) // 지운 날도 지은 날로 남는다
    expect(arrivalsOf(built).find((a) => a.resident.id === 'hodu')!.date).toBe('2026-01-10')
    expect(anniversariesOn(built, '2027-01-10').map((a) => a.resident.id)).toEqual(['hodu'])
  })

  it('기분·글 길이와 상관없이 날짜로만 정한다', () => {
    const plain: Dated[] = days(5)
    const rich = plain.map((d, i) => ({ ...d, text: 'x'.repeat(i * 50), mood: 'sad' }))
    expect(anniversariesOn(rich, '2027-01-05')).toEqual(anniversariesOn(plain, '2027-01-05'))
  })

  it('다음 기념일: 오늘이거나 그 뒤 가장 가까운 날', () => {
    expect(nextAnniversary('2026-01-01', '2026-01-01')).toEqual({ date: '2026-04-10', label: '100일' })
    expect(nextAnniversary('2026-01-01', '2026-04-10')).toEqual({ date: '2026-04-10', label: '100일' })
    expect(nextAnniversary('2026-01-01', '2026-04-11')).toEqual({ date: '2026-07-19', label: '200일' })
    expect(nextAnniversary('2026-01-01', '2026-10-27')).toEqual({ date: '2026-10-27', label: '300일' })
    expect(nextAnniversary('2026-01-01', '2026-10-28')).toEqual({ date: '2027-01-01', label: '1년' })
    expect(nextAnniversary('2026-01-01', '2027-01-02')).toEqual({ date: '2028-01-01', label: '2년' })
    expect(nextAnniversary('2028-02-29', '2029-01-01')).toEqual({ date: '2029-02-28', label: '1년' })
  })

  it('기념일 한마디와 알림 줄(받침에 맞춰 이/가)', () => {
    expect(anniversaryLine({ label: '100일' })).toBe('오늘은 내가 이사 온 지 100일 되는 날이에요!')
    expect(anniversaryNote([])).toBeNull()
    const kong = { resident: byId('kong'), label: '1년' }
    const somi = { resident: byId('somi'), label: '100일' }
    // 짓는 알림 한 줄에 잘리지 않게 "오늘은"을 뺀다(알림은 오늘 한 줄을 지을 때만 뜬다)
    expect(anniversaryNote([kong])).toBe('🎉 콩이가 이사 온 지 1년 되는 날이에요')
    expect(anniversaryNote([{ resident: byId('gamja'), label: '200일' }])).toBe('🎉 감자가 이사 온 지 200일 되는 날이에요')
    expect(anniversaryNote([{ resident: byId('dotori'), label: '1년' }])).toBe('🎉 도토리가 이사 온 지 1년 되는 날이에요')
    expect(anniversaryNote([{ resident: byId('byeol'), label: '1년' }])).toBe('🎉 별이가 이사 온 지 1년 되는 날이에요')
    expect(anniversaryNote([{ resident: { ...byId('kong'), name: '달님' }, label: '1년' }])).toBe('🎉 달님이 이사 온 지 1년 되는 날이에요')
    expect(anniversaryNote([kong, somi])).toBe('🎉 콩이(1년)와 솜이(100일)의 이사 기념일이에요')
  })
})
