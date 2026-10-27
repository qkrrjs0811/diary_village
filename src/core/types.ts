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

export interface SaveData {
  version: 1
  entries: Entry[]
}
