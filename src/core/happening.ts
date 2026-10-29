import { buildingInfo, buildingOf, hasFinal, type BuildingId } from './building'
import { hash, type Village } from './village'
import type { DayPart, WeatherKind } from './weather'

/**
 * 건물에서 일어나는 작은 일 하나. scene: 마을에 그리는 장면(코드로 그린 도형) 이름, line: 말풍선 한 줄,
 * when: 언제 일어나는지(any 늘, fair 비 안 오는 낮·저녁, rain 비 오는 날, night 밤)
 */
export interface Happening {
  id: string
  scene: string
  line: string
  when: 'any' | 'fair' | 'rain' | 'night'
}

const h = (id: string, scene: string, when: Happening['when'], line: string): Happening => ({ id, scene, line, when })

/** 건물마다 두세 가지 작은 일. 어떤 일도 다른 일보다 좋지 않다(보상이 아니다) */
export const HAPPENINGS: Record<BuildingId, Happening[]> = {
  cafe: [
    h('cafe-steam', 'steam', 'any', '카페에서 따뜻한 커피 김이 올라요'),
    h('cafe-parasol', 'parasol', 'fair', '카페 앞에 파라솔이 펴졌어요'),
    h('cafe-umbrella', 'umbrella', 'rain', '카페 문 앞에 우산이 줄지어 섰어요'),
  ],
  bookstore: [
    h('book-pages', 'pages', 'fair', '책방 창가에서 책장이 팔랑여요'),
    h('book-lamp', 'lamp', 'night', '책방에 늦게까지 등이 켜져 있어요'),
    h('book-rain', 'drops', 'rain', '빗소리 들으며 책 읽기 좋은 날이래요'),
  ],
  field: [
    h('field-ball', 'ball', 'fair', '운동장에서 공이 통통 튀어요'),
    h('field-puddle', 'puddle', 'rain', '운동장에 작은 물웅덩이가 생겼어요'),
    h('field-stars', 'twinkle', 'night', '운동장 위로 별이 총총해요'),
  ],
  catHouse: [
    h('cat-nap', 'catNap', 'fair', '고양이가 지붕에서 낮잠을 자요'),
    h('cat-window', 'catEyes', 'any', '고양이가 창밖을 가만히 보고 있어요'),
  ],
  dogHouse: [
    h('dog-bone', 'bone', 'fair', '강아지가 마당에 뼈다귀를 숨겼대요'),
    h('dog-dream', 'zzz', 'night', '강아지가 쿨쿨 꿈을 꿔요'),
    h('dog-rain', 'drops', 'rain', '강아지가 빗방울 구경을 해요'),
  ],
  flowerShop: [
    h('flower-bloom', 'petals', 'fair', '꽃집에 새 꽃이 활짝 피었어요'),
    h('flower-water', 'drops', 'rain', '꽃집 화분들이 비를 맞고 웃어요'),
    h('flower-scent', 'sparkle', 'night', '꽃집에서 밤 꽃향기가 나요'),
  ],
  bakery: [
    h('bakery-steam', 'steam', 'any', '빵집에서 갓 구운 빵 냄새가 나요'),
    h('bakery-sign', 'sparkle', 'fair', '빵집에 오늘의 빵이 나왔어요'),
  ],
  lighthouse: [
    h('light-gulls', 'gulls', 'fair', '등대 옆으로 갈매기가 날아요'),
    h('light-beam', 'beam', 'night', '등대 불빛이 바다를 비춰요'),
    h('light-fog', 'mist', 'rain', '등대가 빗속에서 길을 밝혀요'),
  ],
  musicHall: [
    h('music-notes', 'notes', 'any', '음악당에서 노래가 흘러나와요'),
    h('music-tune', 'sparkle', 'night', '음악당에서 밤 연주 연습을 해요'),
  ],
  cinema: [
    h('cinema-popcorn', 'popcorn', 'any', '영화관에서 팝콘 튀기는 소리가 나요'),
    h('cinema-lights', 'sparkle', 'night', '영화관 간판 불이 반짝여요'),
  ],
  restaurant: [
    h('rest-steam', 'steam', 'any', '식당에서 보글보글 국 끓는 냄새가 나요'),
    h('rest-lantern', 'lamp', 'night', '식당 문 앞 등불이 따뜻해요'),
  ],
  park: [
    h('park-kite', 'kite', 'fair', '공원 위로 연이 높이 떴어요'),
    h('park-puddle', 'puddle', 'rain', '공원 길에 빗물 거울이 생겼어요'),
    h('park-fireflies', 'twinkle', 'night', '공원 풀숲에 반딧불이 떴어요'),
  ],
  school: [
    h('school-bell', 'notes', 'fair', '학교에서 종이 땡땡 울려요'),
    h('school-plane', 'plane', 'any', '학교 창에서 종이비행기가 날아요'),
  ],
  station: [
    h('station-train', 'train', 'any', '기차역 앞으로 꼬마 기차가 지나가요'),
    h('station-lamp', 'lamp', 'night', '기차역 등불 아래 막차를 기다려요'),
  ],
  gallery: [
    h('gallery-new', 'sparkle', 'any', '미술관에 새 그림이 걸렸어요'),
    h('gallery-easel', 'easel', 'fair', '미술관 앞에서 누가 그림을 그려요'),
  ],
  farm: [
    h('farm-water', 'wateringCan', 'fair', '텃밭 새싹에 물을 주었어요'),
    h('farm-rain', 'drops', 'rain', '텃밭이 단비를 맞아요'),
    h('farm-sprout', 'sprout', 'any', '텃밭에 새싹이 하나 더 났어요'),
  ],
}

/** 지금 때·날씨에 맞는 일. 비 오는 날엔 비 일, 밤엔 밤 일이 있으면 그것만, 없으면 늘 있는 일 */
export function happeningsFor(id: BuildingId, part: DayPart, weather: WeatherKind): Happening[] {
  const list = HAPPENINGS[id]
  const only = (when: Happening['when']) => {
    const hit = list.filter((x) => x.when === when)
    return hit.length ? hit : list.filter((x) => x.when === 'any')
  }
  if (weather === 'rain') return only('rain')
  if (part === 'night') return only('night')
  return list.filter((x) => x.when === 'any' || x.when === 'fair')
}

/** 오늘 어느 건물에서 일어난 일. date: 그 건물이 생긴 날, block·gx·gy: 그 집 자리 */
export interface DayHappening {
  building: BuildingId
  happening: Happening
  date: string
  block: string
  gx: number
  gy: number
}

/**
 * 오늘 마을의 작은 일. 지운 날을 뺀 선 건물 가운데 날짜로 고른 한두 곳(서로 다른 건물 종류)에 일을 붙인다.
 * 저장하지 않고 기록·오늘 날짜·때·날씨로만 정해 같은 날엔 늘 같고 날마다 바뀐다.
 * 기분·글 길이·연속 기록과 무관하고, 쓰지 않은 날에도 일어난다(벌 없음)
 */
export function dayHappenings(village: Village, today: string, part: DayPart, weather: WeatherKind): DayHappening[] {
  const byKind = new Map<BuildingId, { date: string; block: string; gx: number; gy: number }[]>()
  for (const block of village.blocks)
    for (const lot of block.lots) {
      if (!lot.entry) continue
      const id = buildingOf(lot.entry)?.id
      if (!id) continue
      const list = byKind.get(id) ?? []
      list.push({ date: lot.date, block: block.month, gx: lot.gx, gy: lot.gy })
      byKind.set(id, list)
    }
  // 건물 종류를 날짜로 섞어 앞에서 한두 종류를 고른다
  const kinds = [...byKind.keys()].sort((a, b) => hash(`happen:${today}:${a}`) - hash(`happen:${today}:${b}`) || (a < b ? -1 : 1))
  const s = hash(`happen:${today}`)
  const count = Math.min(kinds.length, s % 3 === 0 ? 1 : 2)
  return kinds.slice(0, count).map((id) => {
    const homes = byKind.get(id)!
    const home = homes[hash(`happen:${today}:${id}:home`) % homes.length]
    const ways = happeningsFor(id, part, weather)
    const happening = ways[hash(`happen:${today}:${id}:way`) % ways.length]
    return { building: id, happening, ...home }
  })
}

/** 말풍선 글: "… · 이 빵집은 9월 3일에 생겼어요". today를 주면 다른 해에 생긴 건물에 해를 붙인다 */
export function happeningNote(x: DayHappening, today?: string): string {
  const name = buildingInfo(x.building).name
  const [y, m, d] = x.date.split('-').map(Number)
  const year = today && today.slice(0, 4) !== x.date.slice(0, 4) ? `${y}년 ` : ''
  return `${x.happening.line} · 이 ${name}${hasFinal(name) ? '은' : '는'} ${year}${m}월 ${d}일에 생겼어요`
}
