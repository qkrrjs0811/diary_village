import { hasFinal } from './building'
import { hash } from './village'
import { RESIDENTS, type Resident } from './resident'
import type { Dated } from './types'

export type FriendToken = 'scarf' | 'pin' | 'star'

export interface FriendStep {
  level: 1 | 2 | 3
  /** 이사 온 뒤 함께 지은 날 수가 이만큼이면 이 걸음이 된다 */
  days: number
  name: string
  /** 마을에서 달고 걷는 정표 */
  token: FriendToken
}

/** 함께 쌓는 정의 세 걸음(누적 날 수, 줄지 않음) */
export const FRIEND_STEPS: FriendStep[] = [
  { level: 1, days: 10, name: '안녕 이웃', token: 'scarf' },
  { level: 2, days: 30, name: '친한 이웃', token: 'pin' },
  { level: 3, days: 100, name: '단짝 이웃', token: 'star' },
]

/** 이웃마다 걸음이 오를 때 하나씩 털어놓는 자기 이야기(좋아하는 것과 이어짐) */
export const STORIES: Record<string, [string, string, string]> = {
  kong: ['낮잠 잘 때 콩자반 꿈을 자주 꿔요', '사실 이 마을에 제일 먼저 온 게 자랑이에요', '당신 집 불빛을 보면 마음이 놓여요'],
  momo: ['복숭아 우유는 꼭 빨대 두 개로 마셔요', '어릴 적 복숭아 밭에서 길을 잃은 적이 있어요', '언젠가 같이 복숭아를 따러 가요'],
  bori: ['보리차는 미지근할 때가 제일 맛있어요', '할머니가 끓여 주던 보리차 냄새를 기억해요', '힘든 날엔 제 보리차 한 잔 나눠 드릴게요'],
  dubu: ['두부 부침은 간장 한 방울이면 돼요', '말랑해 보여도 속은 꽤 단단하답니다', '당신이 쓴 한 줄을 몰래 따라 써 봤어요'],
  hodu: ['호두과자는 꼭 봉지째 들고 다녀요', '기차역에서 호두과자를 처음 먹어 봤어요', '마지막 한 알은 늘 당신 몫으로 남겨요'],
  somi: ['솜이불 속에서 책 읽는 걸 좋아해요', '천둥 치는 밤엔 아직도 조금 무서워요', '추운 날엔 제 이불을 빌려 드릴게요'],
  gomi: ['동그란 돌멩이는 주머니에 넣어 다녀요', '제일 아끼는 돌은 하트 모양이에요', '그 하트 돌멩이, 당신에게 주고 싶어요'],
  dalle: ['봄이 오면 들판부터 둘러봐요', '나물 이름을 서른 개쯤 외우고 있어요', '봄마다 첫 나물은 당신 집 앞에 둘게요'],
  gamja: ['군감자는 껍질째 먹어야 맛있어요', '감자 굽는 냄새로 계절을 알아요', '당신이랑 모닥불에 감자 굽고 싶어요'],
  dotori: ['도토리는 크기별로 나눠 모아요', '다람쥐랑 도토리를 두고 다툰 적이 있어요', '제일 반짝이는 도토리를 골라 두었어요'],
  nabi: ['꽃밭을 걸으면 발걸음이 가벼워져요', '사실 나비를 따라 이 마을에 왔어요', '당신 마을 꽃밭이 제일 좋아요'],
  gureum: ['오늘 구름은 토끼를 닮았어요', '구름이 흘러가는 걸 한참 보곤 해요', '당신 닮은 구름을 찾으면 알려 줄게요'],
  sagwa: ['사과는 아삭한 첫 입이 제일이에요', '얼굴이 금방 빨개져서 부끄러워요', '빨간 사과처럼 당신이 좋아요'],
  byeol: ['밤마다 별을 세다 잠들어요', '별똥별에 빈 소원이 하나 있어요', '그 소원은 이 마을에 오래 사는 거였어요'],
  danchu: ['단추는 색깔별로 병에 모아요', '떨어진 단추를 보면 그냥 못 지나가요', '제일 예쁜 단추를 당신 옷에 달아 줄게요'],
  maru: ['마루에 누우면 바람이 솔솔 들어와요', '빗소리를 들으며 뒹구는 게 좋아요', '우리 집 마루에 언제든 누우러 와요'],
  haru: ['해 질 녘엔 언덕에 올라가요', '노을 색을 이름 붙여 공책에 적어요', '오늘 노을 이름은 당신 이름으로 할래요'],
  mango: ['망고 빙수는 여름의 맛이에요', '더운 나라에서 먼 길을 왔어요', '이제 이 마을이 제 고향 같아요'],
  mongsil: ['비눗방울은 크게 불어야 재밌어요', '터지기 전 무지개 빛을 좋아해요', '제일 큰 방울에 당신 하루를 담아 볼래요'],
  pori: ['풀잎 하나면 노래를 불 수 있어요', '처음엔 소리가 안 나서 속상했어요', '당신을 위한 노래를 하나 지었어요'],
  choco: ['초코 쿠키는 반쯤 덜 구워야 맛있어요', '처음 구운 쿠키는 까맣게 탔어요', '오늘 구운 쿠키, 제일 먼저 드릴게요'],
  ssuk: ['쑥떡엔 따뜻한 차가 꼭 있어야 해요', '쑥 냄새를 맡으면 마음이 차분해져요', '차 한 잔 하며 당신 얘기 듣고 싶어요'],
  donggeul: ['보름달은 저처럼 동그래요', '달이 차오르는 걸 기다리는 게 좋아요', '보름달이 뜨면 같이 소원 빌어요'],
}

/** 이웃 하나와 쌓인 정 */
export interface Friend {
  resident: Resident
  /** 이사 온 날부터 지은 날 수(이사 온 날 포함) */
  together: number
  /** 0이면 아직 걸음이 없다 */
  level: 0 | 1 | 2 | 3
  step: FriendStep | null
  /** 다음 걸음까지 남은 날 수. 단짝이면 null */
  left: number | null
}

/**
 * 이웃과 쌓인 정. built 는 집을 지었던 날(지운 날 포함)이라 지워도 줄지 않는다.
 * 기분·글 길이·연속 기록은 보지 않는다. 아직 오지 않은 이웃이면 null
 */
export function friendOf(resident: Resident, built: readonly Dated[]): Friend | null {
  const total = new Set(built.map((d) => d.date)).size
  if (total < resident.days) return null
  const together = total - resident.days + 1
  let step: FriendStep | null = null
  for (const s of FRIEND_STEPS) if (together >= s.days) step = s
  const next = FRIEND_STEPS.find((s) => together < s.days)
  return { resident, together, level: step?.level ?? 0, step, left: next ? next.days - together : null }
}

/** 온 이웃마다 정(오는 순서대로) */
export function friendsOf(built: readonly Dated[]): Friend[] {
  return RESIDENTS.map((r) => friendOf(r, built)).filter((f): f is Friend => f !== null)
}

/** before → after 로 바뀌며 걸음이 오른 이웃(짓는 알림에 쓴다) */
export function reachedFriends(before: readonly Dated[], after: readonly Dated[]): Friend[] {
  return friendsOf(after).filter((f) => f.level > (friendOf(f.resident, before)?.level ?? 0))
}

/** 열린 자기 이야기(걸음만큼) */
export function storiesOf(f: Friend): string[] {
  return (STORIES[f.resident.id] ?? []).slice(0, f.level)
}

/** 걸음이 오른 이웃이 있을 때 짓는 알림에 더하는 한 줄. 없으면 null */
export function friendNote(reached: readonly Friend[]): string | null {
  const parts = reached
    .filter((f) => f.step)
    .map((f) => `${f.resident.name}${hasFinal(f.resident.name) ? '과' : '와'} ${f.step!.name}`)
  return parts.length ? `💛 ${parts.join(', ')}이 되었어요` : null
}

/** 마을 그림에서 이웃마다 달고 걷는 정표(지금 걸음의 것 하나). 걸음이 없는 이웃은 없다 */
export function friendTokens(built: readonly Dated[]): Partial<Record<string, FriendToken>> {
  return Object.fromEntries(friendsOf(built).flatMap((f) => (f.step ? [[f.resident.id, f.step.token]] : [])))
}

/** 주민을 누르면 가끔 꺼내는 자기 이야기. 열린 이야기 중 이웃·날짜로 하나 고른다(저장하지 않음). 걸음이 없으면 null */
export function friendStory(f: Friend, today: string): string | null {
  const open = storiesOf(f)
  return open.length ? open[hash(`friend:${f.resident.id}:${today}`) % open.length] : null
}
