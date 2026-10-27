import type { DecorId } from './decor'

export type MoodId = 'great' | 'calm' | 'meh' | 'blue' | 'tired'

/** 하루 한 줄. 저장 원본이다. 마을은 이 기록에서 계산한다 */
export interface Entry {
  /** 그 일기의 날짜(한국 시간 YYYY-MM-DD). 하루에 하나 */
  date: string
  text: string
  mood: MoodId
  /** 처음 쓴 시각(ms) */
  writtenAt: number
  /** 마지막으로 고친 시각(ms). 고친 적 없으면 없다. 이 칸이 없는 이전 기록도 그대로 읽는다 */
  editedAt?: number
}

/** 사용자가 지운 날. 글은 남기지 않고 날짜와 지운 시각만 둔다. 명소·마을 단계를 셀 때 "집을 지었던 날"로 센다 */
export interface Erased {
  date: string
  erasedAt: number
}

/** 날 수를 셀 때 쓰는 날짜 하나(쓴 날이든 지운 날이든) */
export interface Dated {
  date: string
}

export interface SaveData {
  version: 1
  entries: Entry[]
  /** 지운 날. 없으면 지운 적이 없다. 이 칸이 없는 이전 저장도 그대로 읽는다 */
  erased?: Erased[]
  /** 사용자가 지은 마을 이름. 없으면 기본 이름. 이 칸이 없는 이전 저장도 그대로 읽는다 */
  villageName?: string
  /** 사용자가 직접 놓은 꾸밈 소품 자리. 없으면 놓은 적이 없다. 이 칸이 없는 이전 저장도 그대로 읽는다 */
  decor?: PlacedDecor[]
}

/**
 * 직접 놓은 꾸밈 소품 하나. 자리는 마을 칸 좌표가 아니라 "그달 구역(또는 광장) 안 칸"으로 둔다.
 * 앞선 달이 백업으로 더해져 구역 자리가 바뀌어도 소품은 그 칸에 남는다
 */
export interface PlacedDecor {
  id: DecorId
  /** 'plaza' 또는 구역의 달(YYYY-MM) */
  at: string
  /** 구역(광장) 안 칸. 왼쪽 위가 0,0 */
  col: number
  row: number
}
