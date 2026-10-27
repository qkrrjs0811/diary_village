import type { MoodId } from './types'

/**
 * 기분은 등급이 아니라 색깔이다. 어떤 기분의 집도 똑같이 예쁘게 그린다.
 * roofs: 그 기분의 집 지붕 색 후보(날짜로 하나 고름), sky: 그날 하늘 위·아래 색
 */
export interface Mood {
  id: MoodId
  emoji: string
  label: string
  weather: string
  roofs: string[]
  sky: [string, string]
}

export const MOODS: Mood[] = [
  { id: 'great', emoji: '☀️', label: '좋아요', weather: '맑음', roofs: ['#ff9f7a', '#ffc15e', '#ff8fa3'], sky: ['#9fd8ff', '#e8f7ff'] },
  { id: 'calm', emoji: '🌤️', label: '평온해요', weather: '구름 조금', roofs: ['#7cc8a0', '#9ed39b', '#6fbfb8'], sky: ['#b5dcf2', '#f0f8f0'] },
  { id: 'meh', emoji: '☁️', label: '그저 그래요', weather: '흐림', roofs: ['#c9b49b', '#b8c4d0', '#d6b8a8'], sky: ['#c9d3dc', '#eef0f2'] },
  { id: 'blue', emoji: '🌧️', label: '울적해요', weather: '비', roofs: ['#7fa7d9', '#8fb8e8', '#6e9cc9'], sky: ['#9fb3c8', '#dde6ee'] },
  { id: 'tired', emoji: '🌙', label: '지쳤어요', weather: '별밤', roofs: ['#a99be0', '#c4a3d8', '#8f8ad1'], sky: ['#5d6aa8', '#c9c3ea'] },
]

export function moodOf(id: MoodId): Mood {
  return MOODS.find((m) => m.id === id) ?? MOODS[0]
}

export function isMoodId(s: unknown): s is MoodId {
  return MOODS.some((m) => m.id === s)
}
