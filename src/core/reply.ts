import { BUILDINGS, buildingInfo, buildingOf, hasFinal } from './building'
import { hash } from './village'
import type { Entry, MoodId } from './types'

/**
 * 주민의 맞장구(로드맵 R18). 오늘 한 줄에 손님이 건네는 한마디다.
 * 글은 폰 안에서 단어 찾기로만 읽고(기획서 3번), 말에 글 조각을 옮기지 않는다.
 * 글 단어·기분·건물·날짜로만 계산하고 저장하지 않는다. 글 길이와 무관하고 언제나 한마디뿐이다
 */
export type ReplyKind = 'comfort' | 'effort' | 'rest' | 'joy' | 'together' | 'food' | 'weather'

/** 여러 갈래가 맞을 때 고르는 순서. 마음이 힘든 날의 말을 먼저 듣는다 */
export const REPLY_KINDS: ReplyKind[] = ['comfort', 'effort', 'rest', 'joy', 'together', 'food', 'weather']

const WORDS: Record<ReplyKind, string[]> = {
  comfort: ['슬프', '슬펐', '슬픈', '속상', '우울', '울적', '울었', '눈물', '힘들', '힘든', '외로', '서운', '아팠', '아프', '걱정'],
  effort: ['회사', '출근', '퇴근', '야근', '회의', '업무', '시험', '과제', '마감', '알바', '발표', '면접', '일했', '일이 많', '바빴', '바쁜'],
  rest: ['피곤', '졸려', '졸리', '지쳤', '지쳐', '지치', '쉬었', '쉬고', '휴식', '낮잠', '늦잠', '잠이', '잠을', '잤다'],
  joy: ['기쁘', '기뻤', '기쁜', '행복', '웃었', '웃고', '웃음', '웃겼', '웃긴', '신났', '신나', '설레', '좋았', '즐거', '즐겁'],
  together: ['친구', '엄마', '아빠', '가족', '언니', '오빠', '누나', '동생', '할머니', '할아버지', '부모', '남편', '아내', '애인', '같이', '함께', '데이트'],
  food: ['맛있', '맛나', '먹었', '먹고', '먹은', '배불', '배고', '맛집', '점심', '저녁밥', '아침밥', '간식', '요리'],
  weather: ['비가', '비 오', '비오', '비와', '빗소리', '소나기', '장마', '우산', '눈이 와', '눈이 내', '눈 오', '눈오', '첫눈', '함박눈', '눈사람', '바람', '추워', '추웠', '추운', '더워', '더웠', '더운', '햇살', '햇볕', '날씨', '무지개'],
}

/** 갈래 말이 들어 있지만 다른 뜻인 말. 찾기 전에 지운다 */
const NOT_WORDS = ['똑같이', '잠깐', '아프리카', '바람직']

const KIND_LINES: Record<ReplyKind, string[]> = {
  comfort: ['곁에 있을게요. 천천히 해요.', '오늘은 제가 토닥토닥 해 줄게요.', '괜찮아요, 마을이 곁에 있어요.'],
  effort: ['오늘도 애썼어요.', '바빴던 하루, 따뜻한 차 한 잔 어때요?', '고생 많았어요. 오늘 밤은 편히 쉬어요.'],
  rest: ['오늘은 푹 쉬어요.', '포근한 이불 속에서 푹 자요.', '천천히 쉬어 가도 괜찮아요.'],
  joy: ['덩달아 웃음이 나요!', '마을까지 환해졌어요.', '그 기분, 저도 나눠 가질게요.'],
  together: ['함께한 시간이 따뜻해요.', '좋은 사람들 이야기, 듣기 좋아요.', '둘러앉은 마음이 느껴져요.'],
  food: ['맛있는 하루였네요!', '냄새가 여기까지 나는 것 같아요.', '배도 마음도 든든한 날이에요.'],
  weather: ['오늘 하늘 이야기, 저도 봤어요.', '창밖 날씨를 함께 느꼈어요.', '날씨 따라 마을도 옷을 갈아입어요.'],
}

/** 갈래 말이 없을 때 기분에 맞춘 말. 기분은 말결만 바꾸고 더 좋은 말·나쁜 말은 없다 */
const MOOD_LINES: Record<MoodId, string[]> = {
  great: ['반짝이는 하루였나 봐요.', '오늘 마을 하늘이 참 맑아요.'],
  calm: ['잔잔한 하루, 차 한 잔 같아요.', '평온한 마음이 전해져요.'],
  meh: ['그런 날도 있지요. 들려줘서 고마워요.', '구름 낀 날도 마을은 포근해요.'],
  blue: ['비 오는 날엔 제가 우산이 될게요.', '곁에 있을게요. 천천히 해요.'],
  tired: ['별이 뜬 밤처럼 푹 쉬어요.', '오늘은 일찍 불 끄고 쉬어요.'],
}

function buildingLine(name: string): string {
  return `${name}${hasFinal(name) ? '이' : '가'} 생겨서 반가워요.`
}

/** 맞장구로 나올 수 있는 모든 말. 말은 언제나 이 안에서만 고른다(글 조각이 들어갈 틈이 없다) */
export const ALL_REPLIES: string[] = [
  ...new Set([...Object.values(KIND_LINES).flat(), ...Object.values(MOOD_LINES).flat(), ...BUILDINGS.map((b) => buildingLine(b.name))]),
]

/** 글에서 맞장구 갈래를 찾는다. 여러 개가 맞으면 REPLY_KINDS 순서로 하나만, 없으면 null */
export function replyKind(text: string): ReplyKind | null {
  let hay = text.toLowerCase()
  for (const not of NOT_WORDS) hay = hay.split(not).join(' '.repeat(not.length))
  return REPLY_KINDS.find((k) => WORDS[k].some((w) => hay.includes(w))) ?? null
}

/**
 * 그날 글에 손님이 건네는 한마디. 지운 날(글 없음)은 null.
 * 갈래가 맞으면 그 갈래 말, 아니면 건물 말, 보통 집이면 기분 말. 같은 갈래 안에서는 날짜로 고른다
 */
export function replyOf(entry: Entry | null | undefined): string | null {
  if (!entry) return null
  const kind = replyKind(entry.text)
  if (kind) return pick(KIND_LINES[kind], `${entry.date}:${kind}`)
  const building = buildingOf(entry)
  if (building) return buildingLine(buildingInfo(building.id).name)
  return pick(MOOD_LINES[entry.mood], `${entry.date}:${entry.mood}`)
}

function pick(lines: string[], key: string): string {
  return lines[hash(`reply:${key}`) % lines.length]
}
