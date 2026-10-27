import type { BuildingId } from './building'
import { collectionOf } from './collection'
import { seasonOf, type Season } from './season'
import type { Entry } from './types'

/**
 * 오늘의 물음(로드맵 R6). 쓰기 칸의 빈 글자 자리에 띄워 쓸 말이 떠오르게 한다.
 * 날짜·기록으로 계산하고 저장하지 않는다. 물음에 답해도 더 주는 것은 없다(건물은 늘 글 단어로만 정한다).
 * 기분·글 길이·연속 기록은 보지 않는다
 */

/** 빈 글자 자리(폰 세로 화면 쓰기 칸)에서 잘리지 않는 글자 수 */
export const PROMPT_MAX = 14

export const PROMPTS: string[] = [
  '오늘 제일 맛있던 건?',
  '오늘 본 하늘은 어땠나요?',
  '오늘 웃었던 순간은?',
  '오늘 고마웠던 사람은?',
  '오늘 들은 좋은 말은?',
  '오늘 나에게 한마디!',
  '오늘 가장 편했던 때는?',
  '오늘 새로 알게 된 건?',
  '오늘의 작은 행운은?',
  '오늘 입은 옷은 어땠나요?',
  '오늘 누구와 이야기했나요?',
  '오늘 들은 소리 하나는?',
  '오늘 나를 칭찬한다면?',
  '오늘 제일 바빴던 때는?',
  '오늘 손에 든 물건은?',
  '오늘 창밖 풍경은?',
  '오늘 기다린 것이 있나요?',
  '오늘 하고 싶던 일은?',
  '오늘 잠깐 쉰 곳은?',
  '오늘의 한 장면은?',
  '오늘 들은 반가운 소식은?',
  '오늘 떠오른 사람은?',
  '오늘 해낸 일 하나는?',
  '오늘 아쉬웠던 건?',
  '오늘 기분을 날씨로 하면?',
  '오늘 가장 따뜻했던 건?',
  '오늘 처음 해 본 일은?',
  '내일 기대되는 건?',
  '오늘 오래 본 것은?',
  '오늘 걸음은 가벼웠나요?',
]

/** 계절 물음. 계절마다 수가 같아야 계절이 바뀌는 날에도 이웃한 날 물음이 겹치지 않는다 */
export const SEASON_PROMPTS: Record<Season, string[]> = {
  spring: ['오늘 본 봄빛은 어땠나요?', '봄바람이 분 순간은?', '오늘 핀 꽃을 봤나요?', '봄옷 꺼내 입었나요?', '봄이 온 걸 느낀 때는?', '오늘 새싹을 봤나요?'],
  summer: ['오늘 시원했던 순간은?', '여름 냄새가 났나요?', '오늘 먹은 시원한 건?', '매미 소리를 들었나요?', '여름밤은 어땠나요?', '오늘 흘린 땀은 어땠나요?'],
  autumn: ['단풍은 얼마나 들었나요?', '가을바람은 어땠나요?', '오늘 본 낙엽은?', '가을 하늘은 높았나요?', '오늘 산 가을 간식은?', '선선한 저녁은 어땠나요?'],
  winter: ['오늘 손은 따뜻했나요?', '겨울 공기는 어땠나요?', '오늘 먹은 따뜻한 건?', '눈 소식이 있었나요?', '이불 밖은 어땠나요?', '겨울밤에 한 일은?'],
}

/** 그 건물 말이 나올 만한 물음. 물음 안에는 건물 이름을 숨긴다 */
export const BUILDING_PROMPTS: Record<BuildingId, string> = {
  cafe: '오늘 마신 한 잔은?',
  bookstore: '요즘 읽는 책이 있나요?',
  field: '오늘 몸을 움직였나요?',
  catHouse: '오늘 고양이를 만났나요?',
  dogHouse: '오늘 만난 강아지는?',
  flowerShop: '오늘 본 꽃은 무슨 색?',
  bakery: '오늘 먹은 빵이 있나요?',
  lighthouse: '바다가 보고 싶나요?',
  musicHall: '오늘 흥얼거린 노래는?',
  cinema: '요즘 본 영화가 있나요?',
  restaurant: '오늘 먹은 밥은 뭐였나요?',
  park: '오늘 걸은 길은 어땠나요?',
  school: '오늘 공부한 것은?',
  station: '가고 싶은 여행지는?',
  gallery: '오늘 찍은 사진이 있나요?',
  farm: '키우는 식물이 있나요?',
}

/** 어제 쓰기 칸의 물음 */
export const YESTERDAY_PROMPTS: string[] = [
  '어제 가장 기억나는 건?',
  '어제 먹은 것 중 최고는?',
  '어제 누구를 만났나요?',
  '어제 웃었던 일은?',
  '어제 마지막으로 한 일은?',
  '어제의 작은 기쁨은?',
  '어제 들른 곳은?',
  '어제 하늘은 어땠나요?',
]

export interface Prompt {
  text: string
  /** 못 만난 건물로 이어지는 물음이면 그 건물 */
  building?: BuildingId
}

/** 1970-01-01부터 센 날 수 */
function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86400000)
}

/**
 * 날마다 섞어 도는 순서(n × step). step 이 목록 길이와 서로소라 한 바퀴 안에 같은 물음이 다시 나오지 않고,
 * 이웃한 날은 늘 다르다
 */
function rotate<T>(list: readonly T[], n: number, step: number): T {
  return list[(((n * step) % list.length) + list.length) % list.length]
}

/** 오늘 쓰기 칸의 물음. 사흘에 한 번은 아직 못 만난 건물 물음(16종을 다 만났으면 여느 물음) */
export function todayPrompt(entries: readonly Entry[], today: string): Prompt {
  const n = dayNumber(today)
  if (n % 3 === 0) {
    const unmet = collectionOf([...entries]).filter((c) => !c.found).map((c) => c.building.id)
    if (unmet.length > 0) {
      const building = unmet[Math.floor(n / 3) % unmet.length]
      return { text: BUILDING_PROMPTS[building], building }
    }
  }
  return { text: rotate([...PROMPTS, ...SEASON_PROMPTS[seasonOf(today)]], n, 11) }
}

/** 어제 쓰기 칸의 물음. today 는 오늘 날짜(같은 날은 같은 물음) */
export function yesterdayPrompt(today: string): string {
  return rotate(YESTERDAY_PROMPTS, dayNumber(today), 3)
}
