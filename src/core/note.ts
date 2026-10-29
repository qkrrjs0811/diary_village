/** 짓는 알림 칸: 한 줄을 지을 때 뜨는 알림의 줄을 칸으로 나누고 장으로 넘겨 본다. 줄 내용은 각 규칙이 정하고 여기서는 차례·모양만 정한다(저장하지 않음) */

export type NoteKind = 'building' | 'neighbor' | 'friend' | 'anniversary' | 'decor' | 'guest'

/** 칸 차례: 건물 → 새 이웃 → 정 걸음 → 이사 기념일 → 꾸밈 소품 → 손님 맞장구 */
export const NOTE_ORDER: readonly NoteKind[] = ['building', 'neighbor', 'friend', 'anniversary', 'decor', 'guest']

/** 한 장에 보이는 칸 수 */
export const NOTE_PAGE = 3

export interface NoteCell {
  kind: NoteKind
  icon: string
  text: string
}

/** 앞 그림글자가 없는 줄에 쓰는 아이콘 */
const ICON: Record<NoteKind, string> = {
  building: '🏠',
  neighbor: '🏡',
  friend: '💛',
  anniversary: '🎉',
  decor: '🎁',
  guest: '💬',
}

const LEAD = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s+/u

/** 종류별 줄(비었으면 null·false)을 정해 둔 차례의 칸으로. 앞 그림글자는 아이콘으로 떼고 글은 그대로 둔다 */
export function noteCells(lines: Partial<Record<NoteKind, string | null | false | undefined>>): NoteCell[] {
  return NOTE_ORDER.flatMap((kind) => {
    const line = lines[kind]
    if (!line) return []
    const lead = LEAD.exec(line)
    return [lead ? { kind, icon: lead[1], text: line.slice(lead[0].length) } : { kind, icon: ICON[kind], text: line }]
  })
}

/** 한 장에 per 칸씩 나눈다. 칸이 없어도 버튼을 둘 한 장은 있다 */
export function notePages<T>(cells: readonly T[], per = NOTE_PAGE): T[][] {
  const pages: T[][] = []
  for (let i = 0; i < cells.length; i += per) pages.push(cells.slice(i, i + per))
  return pages.length ? pages : [[]]
}

/** 알림이 짓는 연출 뒤에 더 머무는 시간(ms). 한 장의 칸 수에 맞춰 조금 늘고, 버튼이 있으면 누를 틈을 더 준다 */
export function noteStay(cells: number, actions: boolean): number {
  const extra = Math.max(0, Math.min(cells, NOTE_PAGE) - 1) * 1200
  return (actions ? 5000 : 2500) + extra
}
