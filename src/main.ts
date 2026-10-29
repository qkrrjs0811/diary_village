import './style.css'
import { backedUpAt, backupDue, backupFileName, backupText, markBackedUp, planImport } from './core/backup'
import { buildingNote, buildingOf } from './core/building'
import { buildingOrdinal } from './core/collection'
import { dayKey } from './core/date'
import { builtDays, editEntry, entryOn, eraseEntry, neighborDays, writeEntry, yesterdayOpen, type Day } from './core/entries'
import { moodOf } from './core/mood'
import { loadSave, writeSave, type KV } from './core/storage'
import { TITLE_MAX, setMonthTitle } from './core/title'
import type { Dated, Entry, MoodId, SaveData } from './core/types'
import { memoryOf } from './core/memory'
import { echoNote, echoOf, echoTag } from './core/echo'
import { anniversariesOn, anniversaryLine, anniversaryNote } from './core/anniversary'
import { toggleTreasured } from './core/treasure'
import { arrivedLetters, eraseLetter, markLetterRead, receivedLetters, waitingLetters, writeLetter } from './core/letter'
import { createLetterArrival, createLetterBox } from './ui/letters'
import { festivalCard, festivalOn, type Festival } from './core/festival'
import { recapOf, yearRecapOf } from './core/recap'
import { todayPrompt, yesterdayPrompt } from './core/prompt'
import { buildVillage } from './core/village'
import { LANDMARKS, PLAZA, earnedLandmarks, landmarkSpot, nextSign, reachedLandmarks, type Landmark } from './core/landmark'
import { NAME_MAX, renameVillage, villageTitle } from './core/name'
import { milestoneCard, reachedStages, stageLabel } from './core/stage'
import { RESIDENTS, arrivedOn, dayReplyLine, guestLine, neighborNote, onPlaza, plazaEntrance, reachedResidents, residentTalk, residentWalks, residentsOf, todayGuests, hangoutsOf, type Guest, type Hangout, type Walk } from './core/resident'
import { DECORS, decorBook, decorNote, reachedDecors, unlockedDecors, type Decor, type DecorId } from './core/decor'
import { decorSpots, decorsOnMap, moveDecor, placeAt, placeDecor, removeDecor, type PlaceResult } from './core/placing'
import { createBook } from './ui/book'
import { createCalendar } from './ui/calendar'
import { createDecorTray } from './ui/decorate'
import { createCelebration } from './ui/celebrate'
import { FIRST_GIFTS, firstSignDate, giftCard, reachedGifts } from './core/gift'
import { friendNote, friendOf, friendStory, friendTokens, friendsRoseOn, reachedFriends } from './core/friendship'
import { createReader } from './ui/reader'
import { createGrowth } from './ui/growth'
import { growthSteps } from './core/growth'
import type { View } from './village/camera'
import { dateLabel } from './ui/format'
import { createSettings } from './ui/settings'
import { createSound } from './ui/sound'
import { setSound, soundOn } from './core/sound'
import { createWriteCard } from './ui/write'
import { createLockScreen } from './ui/lock'
import { lockOn, readLock, shouldRelock, writeLock } from './core/lock'
import { photoDays, photosShown, type Photos } from './core/photo'
import { openPhotoStore, type PhotoStore } from './photos'
import { createCamera } from './village/camera'
import { drawSky } from './village/sky'
import { dayPart, skyColors, weatherOf, windowsLit, type DayPart } from './core/weather'
import { critters } from './core/critter'
import { smokeOn } from './core/season'
import { SHOW, START_UNIT } from './core/view'
import { blockView, cellAt, drawVillage, hushSigns, iso, unveil, veilFront } from './village/render'
import type { Village } from './core/village'

/** 브라우저 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 메모리에만 둔다 */
function openStorage(): { kv: KV; persistent: boolean } {
  try {
    const s = window.localStorage
    s.setItem('diary-village:probe', '1')
    s.removeItem('diary-village:probe')
    return { kv: s, persistent: true }
  } catch {
    const m = new Map<string, string>()
    return { kv: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }, persistent: false }
  }
}

const { kv, persistent } = openStorage()
let save: SaveData = { version: 1, entries: [] }
/** 저장된 기록을 못 읽으면 덮어쓰지 않도록 쓰기를 막는다 */
let readOnly = false
try {
  save = loadSave(kv)
} catch {
  readOnly = true
}

/** 사진 일기 보관함(폰 안 IndexedDB). 열리기 전이나 쓸 수 없으면 null 이고, 사진 없이 앱은 그대로 쓴다 */
let photoStore: PhotoStore | null = null
/** 날짜 → 사진. 보관함에서 한 번 읽어 두고, 붙이고 뗄 때 함께 고친다 */
let photos: Photos = {}

/** 그날 사진을 붙이거나(data) 뗀다(null). 보관함에 못 담으면 되돌리고 다정하게 알린다 */
function setPhoto(date: string, data: string | null) {
  const store = photoStore
  if (!store) return
  const before = photos[date]
  const next = { ...photos }
  if (data) next[date] = data
  else delete next[date]
  photos = next
  ;(data ? store.put(date, data) : store.remove(date)).catch(() => {
    const back = { ...photos }
    if (before) back[date] = before
    else delete back[date]
    photos = back
    showNote(data ? '사진을 담지 못했어요 · 폰 저장 공간을 확인해 주세요' : '사진을 떼지 못했어요', 0)
  })
}

/** 집이 올라오는 순간의 소리와 떨림(⚙️ 설정에서 끈다) */
const sound = createSound(kv)

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <header class="top"><b data-testid="village-name">한 줄 마을</b><button type="button" class="stage-btn" data-testid="village-stage" aria-label="마을 수첩 열기"><span class="stage"></span></button><span class="count" data-testid="house-count"></span><button type="button" class="gear" data-testid="settings-open" aria-label="설정">⚙️<i class="gear-dot" data-testid="backup-dot" hidden></i></button></header>
  <div class="banner" data-testid="storage-warning" hidden></div>
  <main class="scene" data-testid="scene">
    <div class="sky sky-back" data-testid="sky" aria-hidden="true"></div>
    <div class="sky far" data-testid="far" aria-hidden="true"></div>
    <svg data-testid="village" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"></svg>
    <div class="sky sky-front" data-testid="rain" aria-hidden="true"></div>
    <div class="weather" data-testid="weather"></div>
    <button type="button" class="backup-ask" data-testid="backup-ask" hidden><span>📦 백업해 둘까요?</span></button>
    <div class="build-note" data-testid="build-note" role="status" hidden></div>
  </main>`
const svg = app.querySelector<SVGSVGElement>('svg')!
const scene = app.querySelector<HTMLElement>('.scene')!
const skyBack = app.querySelector<HTMLElement>('.sky-back')!
const skyFront = app.querySelector<HTMLElement>('.sky-front')!
const skyFar = app.querySelector<HTMLElement>('.far')!
const banner = app.querySelector<HTMLElement>('.banner')!
if (readOnly) {
  banner.textContent = '저장된 일기를 읽지 못했어요. 기록을 지키려고 새로 쓰기를 잠시 막았어요.'
  banner.hidden = false
} else if (!persistent) {
  banner.textContent = '이 브라우저에서는 일기가 저장되지 않아요. 창을 닫으면 사라져요.'
  banner.hidden = false
}

const reader = createReader({
  onEdit: readOnly
    ? null
    : (date, text, mood, more) => {
        const r = editEntry(save, date, { text, mood, more }, Date.now())
        if (!r.ok)
          return {
            error: r.reason === 'missing' ? '이 날의 기록을 찾지 못했어요' : r.reason === 'moreLong' ? '더 쓴 글을 조금만 줄여 주세요' : '한 줄을 다시 확인해 주세요',
          }
        if (!r.changed) return { entry: r.entry }
        try {
          writeSave(kv, r.save)
        } catch {
          return { error: '저장하지 못했어요. 저장 공간을 확인해 주세요' }
        }
        save = r.save
        render()
        veilFront(svg, date)
        return { entry: r.entry }
      },
  onErase: readOnly
    ? null
    : (date) => {
        const r = eraseEntry(save, date, Date.now())
        if (!r.ok) return '이 날의 기록을 찾지 못했어요'
        try {
          writeSave(kv, r.save)
        } catch {
          return '저장하지 못했어요. 저장 공간을 확인해 주세요'
        }
        save = r.save
        // 글을 지우면 그날 사진도 함께 뗀다(지우기 확인 문구에 사진도 적혀 있다)
        if (photos[date]) setPhoto(date, null)
        render()
        showNote(`🌱 ${dateLabel(date).replace(/ \S+요일$/, '')} 자리가 빈 땅으로 돌아갔어요`, 0)
        return null
      },
  onClose: () => unveil(svg),
  neighbors: (date) => {
    const near = neighborDays(save.entries, date)
    return { prev: near.prev ? entryOn(save, near.prev) ?? null : null, next: near.next ? entryOn(save, near.next) ?? null : null }
  },
  onTurn: turnTo,
  reply: (entry) => dayReplyLine(entry, builtDays(save), friendsRoseOn(builtDays(save), entry.date)),
  onBuilding: (id) => calendar.openBuilding(save.entries, (save.erased ?? []).map((x) => x.date), dayKey(Date.now()), id),
  echo: (entry) => echoTag(save.entries, entry.date) ?? null,
  onEcho: (word) => calendar.openSearch(save.entries, (save.erased ?? []).map((x) => x.date), dayKey(Date.now()), word),
  photo: (date) => photos[date] ?? null,
  // 사진을 붙이거나 떼면 마당 액자도 바로 바뀌게 다시 그린다
  onPhoto: readOnly
    ? null
    : (date, data) => {
        setPhoto(date, data)
        render()
        veilFront(svg, date)
      },
  canPhoto: () => !!photoStore,
  onTreasure: readOnly
    ? null
    : (date) => {
        const r = toggleTreasured(save, date)
        if (!r.ok) return null
        try {
          writeSave(kv, r.save)
        } catch {
          showNote('저장하지 못했어요. 저장 공간을 확인해 주세요', 0)
          return null
        }
        save = r.save
        render()
        veilFront(svg, date)
        return entryOn(save, date) ?? null
      },
})
document.body.appendChild(reader.root)

/** 그날 글을 연다. 읽는 동안 그 집 앞을 가리는 나무·주민은 옅어진다 */
let veilTimer = 0
function readEntry(entry: Entry) {
  clearTimeout(veilTimer)
  reader.open(entry)
  veilFront(svg, entry.date)
}

/** 읽기 창에서 앞뒤 날로 넘기면 마을 보기도 그 집으로 옮겨 가고, 그 집 앞을 옅게 한다 */
function turnTo(entry: Entry) {
  clearTimeout(veilTimer)
  clearTimeout(memoryTimer)
  const lot = drawn?.village.blocks.flatMap((b) => b.lots).find((l) => l.date === entry.date)
  if (lot) camera.glide(iso(lot.gx + 0.5, lot.gy + 0.5, 22), START_UNIT)
  veilFront(svg, entry.date)
  sound.cue('turn')
}

const settings = createSettings({
  soundOn: () => soundOn(kv),
  setSound(on) {
    try {
      setSound(kv, on)
      return true
    } catch {
      return false
    }
  },
  lock: () => readLock(kv),
  setLock(lock) {
    try {
      writeLock(kv, lock)
      return true
    } catch {
      return false
    }
  },
  villageName: () => save.villageName ?? '',
  rename: readOnly
    ? null
    : (input) => {
        const r = renameVillage(save, input)
        if (!r.ok) return `이름은 ${NAME_MAX}자까지 지을 수 있어요`
        try {
          writeSave(kv, r.save)
        } catch {
          return '저장하지 못했어요. 저장 공간을 확인해 주세요'
        }
        save = r.save
        render()
        return null
      },
  exportFile: readOnly ? null : () => ({ name: backupFileName(dayKey(Date.now())), text: backupText(save, photos) }),
  // 사진 보관함을 쓸 수 없으면 사진은 두고 글만 가져온다
  planImport: readOnly ? null : (text) => planImport(save, text, photoStore ? photos : null),
  applyImport(plan) {
    if (readOnly) return '지금은 가져올 수 없어요'
    try {
      writeSave(kv, plan.save)
    } catch {
      return '저장하지 못했어요. 저장 공간을 확인해 주세요'
    }
    const before = builtDays(save)
    save = plan.save
    // 백업에서 온 사진을 그날에 붙인다(폰에 있던 사진은 그대로다). 못 담으면 setPhoto 가 알린다
    for (const [date, data] of Object.entries(plan.photos)) if (photos[date] !== data) setPhoto(date, data)
    render()
    celebrate(before, 0, undefined, false)
    return null
  },
  backupNote() {
    const t = backedUpAt(kv)
    if (t !== null) return `마지막 백업: ${dateLabel(dayKey(t))}`
    return save.entries.length ? '아직 백업한 적이 없어요' : ''
  },
  photoCount: () => Object.keys(photos).length,
  onExported() {
    try {
      markBackedUp(kv, Date.now())
    } catch {
      // 적지 못해도 파일은 받았다. 다음에 또 물을 뿐이다
    }
    showBackupDue()
  },
})
document.body.appendChild(settings.root)

const backupDot = app.querySelector<HTMLElement>('[data-testid="backup-dot"]')!
const backupAsk = app.querySelector<HTMLButtonElement>('[data-testid="backup-ask"]')!
/** 이번 열기에서 설정을 열어 봤으면 말풍선은 접고 ⚙️ 옆 점만 남긴다 */
let backupAsked = false
/** 마지막 백업 뒤 한 달이 지나면 ⚙️ 옆에 작은 점과 "백업해 둘까요?"를 띄운다 */
function showBackupDue() {
  const due = persistent && !readOnly && backupDue(save, backedUpAt(kv), dayKey(Date.now()))
  backupDot.hidden = !due
  backupAsk.hidden = !due || backupAsked
}
/** 설정 창을 열면(⚙️든 말풍선이든) 말풍선은 이번 열기 동안 접는다 */
function openSettings() {
  backupAsked = true
  showBackupDue()
  settings.open()
}
backupAsk.addEventListener('click', openSettings)

/** 브라우저가 저장 공간을 비울 때 이 마을 글은 남겨 달라고 부탁한다(묻지 않고 정해지기도 한다) */
function keepStorage() {
  if (!persistent || readOnly || !save.entries.length) return
  const storage = navigator.storage
  if (!storage?.persist) return
  Promise.resolve(storage.persisted?.())
    .then((done) => done || storage.persist())
    .catch(() => {})
}
keepStorage()

/** 저장하고 마을을 다시 그린다(우체통 깃발). 실패하면 이유 */
function keepLetters(next: SaveData): string | null {
  try {
    writeSave(kv, next)
  } catch {
    return '저장하지 못했어요. 저장 공간을 확인해 주세요'
  }
  save = next
  render()
  return null
}

/** 광장 우체통을 누르면 여는 편지 창. 편지는 집·명소·단계와 무관하다 */
const letterBox = createLetterBox({
  lists() {
    const now = Date.now()
    return { today: dayKey(now), arrived: arrivedLetters(save, now), waiting: waitingLetters(save, now), received: receivedLetters(save, now), now }
  },
  onWrite: readOnly
    ? null
    : (text, wait) => {
        const r = writeLetter(save, { text, wait }, Date.now())
        if (!r.ok) return '편지를 다시 확인해 주세요'
        return keepLetters(r.save)
      },
  onRead: readOnly
    ? null
    : (writtenAt) => {
        const r = markLetterRead(save, writtenAt, Date.now())
        if (!r.ok) return r.reason === 'sealed' ? '아직 열리지 않은 편지예요' : '편지를 찾지 못했어요'
        return r.save === save ? null : keepLetters(r.save)
      },
  onErase: readOnly
    ? null
    : (writtenAt) => {
        const r = eraseLetter(save, writtenAt)
        if (!r.ok) return '편지를 찾지 못했어요'
        return keepLetters(r.save)
      },
})
document.body.appendChild(letterBox.root)

const celebrateCard = createCelebration({ onVisit: visitLandmark })
document.body.appendChild(celebrateCard.root)
let celebrateTimer = 0
/** before → 지금 기록으로 명소가 생기거나 마을 단계가 올랐으면 축하 카드를 띄운다. wait: 짓는 연출이 끝날 때까지 기다리는 시간 */
/** then: 축하 카드가 있으면 닫힌 뒤, 없으면 wait 뒤에 할 일(새 이웃 맞이) */
/** gifts: 첫 주 선물도 축하한다(한 줄을 쓸 때. 백업을 가져와 되돌릴 때는 명소·단계만) */
function celebrate(before: Dated[], wait: number, then?: () => void, gifts = true) {
  const days = builtDays(save)
  const landmarks = reachedLandmarks(before, days)
  const stages = reachedStages(before, days)
  // 첫 주 선물(1·2·3·5일째)은 명소·단계와 같은 날이 아니라서 따로 축하한다. 소품 선물이면 바로 놓으러 갈 수 있다
  const gift = gifts ? giftCard(reachedGifts(before, days), days) : null
  if (landmarks.length === 0 && stages.length === 0 && !gift) {
    if (then) welcomeTimer = window.setTimeout(then, wait)
    return
  }
  clearTimeout(celebrateTimer)
  const milestone = landmarks.length > 0 || stages.length > 0
  const text = milestone ? milestoneCard(landmarks, stages, days) : { ...gift!, visit: null }
  const decor = milestone ? null : gift!.decor
  const go = decor && !readOnly ? { label: `${DECORS.find((d) => d.id === decor)!.icon} 놓으러 가기`, go: true, onDone: () => setDecorating(true, decor) } : undefined
  celebrateTimer = window.setTimeout(() => celebrateCard.open(text, go, then), wait)
  // 소리는 누른 순간에 예약해야 폰이 막지 않는다. 카드가 뜨는 순간 울린다
  sound.cue('celebrate', '', wait)
}
/**
 * 잔치 날 앱을 열면(켜 둔 채 잔치 날이 되어도) 잔치 카드를 이번 열기에 한 번 띄운다. 본 표시는 저장하지 않는다.
 * 폰은 손길 없이 소리를 막으니 축하 가락은 "잔치 즐기기"를 누른 순간 울리고, 광장 잔치 장식으로 간다
 */
function showFestival(f: Festival, then: () => void) {
  celebrateCard.open(
    festivalCard(f),
    {
      label: '🎉 잔치 즐기기',
      onDone() {
        sound.cue('celebrate')
        // 큰 잔치 장식(광장 (5,2)) 언저리로 간다
        camera.glide(iso(PLAZA.gx + 4.5, PLAZA.gy + 2.5, 26), 0.8)
      },
    },
    then,
  )
}

/** 앱을 열 때 찾아오는 편지 도착 카드. 읽음 표시는 열어 본 편지에만 저장한다 */
const letterArrival = createLetterArrival({
  onRead(writtenAt) {
    const r = markLetterRead(save, writtenAt, Date.now())
    if (!r.ok) return '편지를 찾지 못했어요'
    return r.save === save ? null : keepLetters(r.save)
  },
  onOpen: () => sound.cue('celebrate'),
})
document.body.appendChild(letterArrival.root)
/** 이번 열기에 이미 보인 편지("나중에"를 누른 편지는 날이 바뀌어도 다시 띄우지 않는다. 우체통에 그대로 있다) */
const shownLetters = new Set<number>()
function showArrivals() {
  if (readOnly) return
  const now = Date.now()
  const fresh = arrivedLetters(save, now).filter((l) => !shownLetters.has(l.writtenAt))
  for (const l of fresh) shownLetters.add(l.writtenAt)
  letterArrival.open(fresh, now)
}
/** 광장의 명소로 화면을 옮기고, 그 명소가 쑥 올라온다 */
function visitLandmark(l: Landmark) {
  const s = landmarkSpot(l)
  const node = svg.querySelector<SVGGElement>(`[data-landmark="${l.id}"].landmark`)
  // 처음 보기보다 조금 멀리: 그 명소와 "광장" 이름표·다음 명소 팻말이 화면 끝에 잘리지 않고 함께 보인다
  const c = iso(s.gx + 0.5, s.gy + 0.5)
  const b = node?.getBBox()
  camera.glide([...plazaBoxes(), b ? { x: b.x, y: b.y, w: b.width, h: b.height } : { x: c.x - 30, y: c.y - 60, w: 60, h: 64 }], 0.8)
  if (!node || calm) return
  node.classList.remove('pop')
  node.style.setProperty('--delay', `${SHOW.go}ms`)
  void node.getBoundingClientRect()
  node.classList.add('pop')
}
app.querySelector('[data-testid="settings-open"]')!.addEventListener('click', openSettings)

/** 머리줄 단계 이름표를 누르면 마을 수첩(단계·건물 도감·명소)이 열린다 */
const book = createBook({
  onDecorate: readOnly ? null : () => setDecorating(true),
  onCalendar: () => calendar.open(save.entries, (save.erased ?? []).map((x) => x.date), dayKey(Date.now())),
  onBuilding: (id) => calendar.openBuilding(save.entries, (save.erased ?? []).map((x) => x.date), dayKey(Date.now()), id),
  onEntry: (entry) => visitMemory(entry),
  onGrowth: () => growth.play(svg, growthSteps(save)),
  onTurn: () => sound.cue('turn'),
})
document.body.appendChild(book.root)

/** 마을이 자라 온 길: 멀리 보기로 물러나 첫 집부터 다시 보고, 끝나면 보던 자리·지금 마을로 돌아온다 */
let beforeGrowth: View | null = null
const growth = createGrowth({
  onStart() {
    showNote(null)
    beforeGrowth = camera.current()
    const land = svg.querySelector<SVGGraphicsElement>('.ground')!.getBBox()
    camera.glide([{ x: land.x, y: land.y, w: land.width, h: land.height }], START_UNIT)
  },
  onEnd() {
    render()
    if (beforeGrowth) camera.show(beforeGrowth)
    beforeGrowth = null
  },
  calm: () => calm,
  onRing: (index, total) => sound.rise(index, total),
  titles: () => save.monthTitles ?? {},
})
document.body.appendChild(growth.root)
app.querySelector('[data-testid="village-stage"]')!.addEventListener('click', () => book.open(save.entries, builtDays(save), drawn?.hangouts ?? [], dayKey(Date.now())))

const card = createWriteCard({
  onSubmit(text: string, mood: MoodId, day: Day, more: string, photo: string | null) {
    if (readOnly) return '지금은 쓸 수 없어요'
    const r = writeEntry(save, { text, mood, more }, Date.now(), day)
    if (!r.ok) {
      if (r.reason === 'already') return `${day === 'today' ? '오늘은' : '어제는'} 이미 집을 지었어요`
      return r.reason === 'moreLong' ? '더 쓴 글을 조금만 줄여 주세요' : '한 줄을 다시 확인해 주세요'
    }
    try {
      writeSave(kv, r.save)
    } catch {
      return '저장하지 못했어요. 저장 공간을 확인해 주세요'
    }
    const before = builtDays(save)
    save = r.save
    // 사진은 한 줄을 꾸밀 뿐, 집·건물·명소는 한 줄로만 정한다
    if (photo) setPhoto(r.entry.date, photo)
    // 새 이웃은 짓는 연출이 끝나고 원래 보기로 돌아온 뒤 섬 가장자리에서 광장으로 통통 뛰어 들어온다
    const comers = reachedResidents(before, builtDays(save))
    render(r.entry.date, comers.map((x) => x.id))
    keepStorage()
    // 다가가 짓는 동안 새 집 앞을 가리는 나무·주민을 옅게 했다가, 원래 보기로 돌아올 때 되돌린다
    clearTimeout(veilTimer)
    veilFront(svg, r.entry.date)
    hushSigns(svg)
    veilTimer = window.setTimeout(() => unveil(svg), (calm ? 0 : SHOW.go) + SHOW.hold)
    sound.build(r.entry.mood, r.entry.date, calm ? 0 : SHOW.go)
    // 지은 건물·새 이웃·새로 열린 꾸밈 소품·찾아온 손님의 맞장구를 한 알림에 줄을 나눠 보인다(손님을 누르면 다시 들린다)
    // 손님은 오늘 집에만 온다. 어제 칸을 쓴 날은 맞장구가 없다
    // 정 걸음이 오른 이웃이 손님이면 다 뛰어 와 머리 위에 하트가 뜰 때 하트 가락을 울린다
    // 알림은 "💛 …와 친한 이웃" 줄이 걸음을 알리니 손님 줄은 맞장구 그대로 두고, 걸음 인사는 손님을 누르면 들린다
    const guest = drawn?.guests.find((g) => g.reply && g.date === r.entry.date)
    const friend = drawn?.guests.find((g) => g.step && g.date === r.entry.date)
    if (friend) sound.cue('friend', friend.resident.id, calm ? 0 : SHOW.go + 1950)
    // 첫 주 선물 소품은 축하 카드가 따로 알려 준다
    const opened = reachedDecors(before, builtDays(save)).filter((d) => !FIRST_GIFTS.some((g) => g.decor === d.id))
    const notes = [
      buildingNote(buildingOf(r.entry), buildingOrdinal(save.entries, r.entry.date)),
      neighborNote(comers),
      friendNote(reachedFriends(before, builtDays(save))),
      // 이사 기념일은 오늘 한 줄을 지을 때만 알린다(어제 칸을 쓴 날은 "오늘은"이 맞지 않는다)
      r.entry.date === dayKey(Date.now()) && anniversaryNote(anniversariesOn(builtDays(save), r.entry.date)),
      decorNote(opened),
      guest && `${guest.resident.name}: “${guest.reply}”`,
    ].filter(Boolean)
    // 작은 시설이 열렸으면 알림에서 바로 그 시설을 고른 채 꾸미기로 간다
    const facility = opened.find((d) => d.kind === 'facility')
    // 말의 메아리: 한 줄의 말을 지난날에도 썼으면 그날을 알리고, 누르면 그 집으로 날아가 글을 연다
    const echo = echoOf(save.entries, r.entry.date)
    const echoed = echo && save.entries.find((x) => x.date === echo.last)
    const actions: NoteAction[] = []
    if (facility) actions.push({ label: `${facility.icon} 놓으러 가기`, run: () => setDecorating(true, facility.id) })
    if (echo && echoed) actions.push({ label: echoNote(echo, r.entry.date), run: () => visitMemory(echoed), testid: 'note-echo', soft: true })
    showNote(notes.length ? notes.join('\n') : null, SHOW.go, actions)
    celebrate(before, calm ? 0 : SHOW.go + SHOW.hold + SHOW.back, welcomeNeighbor(comers.map((x) => x.id)))
    return null
  },
  onOpen: readEntry,
  onMemory: visitMemory,
  onRecap: (at, name) => calendar.open(save.entries, (save.erased ?? []).map((x) => x.date), dayKey(Date.now()), at, name),
  monthTitle: (month) => save.monthTitles?.[month] ?? '',
  canName: !readOnly,
  canPhoto: () => !!photoStore && !readOnly,
})

/**
 * 새 이웃 맞이: 광장 앞 가장자리 쪽으로 다가가 새 이웃이 통통 뛰어 들어오는 것을 보고 원래 보기로 돌아온다.
 * 원래 보기로 돌아온 뒤(축하 카드가 있으면 닫은 뒤)에 부른다. 광장 길로 오는 새 이웃이 없으면 없다
 */
let welcomeTimer = 0
function welcomeNeighbor(ids: string[]): (() => void) | undefined {
  clearTimeout(welcomeTimer)
  const w = drawn?.walks.find((x) => ids.includes(x.resident.id) && onPlaza(x.from))
  if (!w || calm) return
  const gate = plazaEntrance(w.from)
  return () => {
    const node = svg.querySelector(`.resident.newcomer[data-resident="${w.resident.id}"]`)
    if (!node) return
    // 짓는 연출처럼 다가가 머무는 동안 들어오고, 원래 보기로 돌아온다
    // 들어오는 길 양 끝과 "광장" 이름표·다음 명소 팻말이 모두 화면 안에 들어오게
    const body = (gx: number, gy: number) => {
      const p = iso(gx + 0.5, gy)
      return { x: p.x - 16, y: p.y - 40, w: 32, h: 44 }
    }
    camera.visit([body(w.from.gx, w.from.gy), body(gate.gx, gate.gy), ...plazaBoxes()])
    welcomeTimer = window.setTimeout(() => {
      // 뛰어 오는 동안은 맨 앞에 그려 우체통·명소에 가리지 않고, 다 오면 제 깊이 자리로 돌아간다
      const parent = node.parentNode!
      const next = node.nextSibling
      parent.appendChild(node)
      const land = (e: Event) => {
        if (e.target !== node) return
        node.removeEventListener('animationend', land)
        if (node.parentNode === parent && (!next || next.parentNode === parent)) parent.insertBefore(node, next)
      }
      node.addEventListener('animationend', land)
      node.classList.add('coming')
    }, SHOW.go)
  }
}

/** 광장으로 다가갈 때 화면 안에 두는 것: "광장" 이름표와 다음 명소 팻말(모두 세웠으면 이름표만) */
function plazaBoxes() {
  return [...svg.querySelectorAll<SVGGraphicsElement>('[data-testid="plaza-sign"], [data-testid="next-landmark"]')].map((n) => {
    const b = n.getBBox()
    return { x: b.x, y: b.y, w: b.width, h: b.height }
  })
}

/** "N일 전 오늘"의 집으로 날아가 그 집이 반짝이고, 도착하면 그날 글을 연다 */
let memoryTimer = 0
function visitMemory(entry: Entry) {
  const lot = drawn?.village.blocks.flatMap((b) => b.lots).find((l) => l.date === entry.date)
  clearTimeout(memoryTimer)
  if (!lot) return readEntry(entry)
  camera.glide(iso(lot.gx + 0.5, lot.gy + 0.5, 22), START_UNIT)
  const node = svg.querySelector(`[data-testid="house-${entry.date}"]`)
  node?.classList.remove('remember')
  void node?.getBoundingClientRect()
  node?.classList.add('remember')
  memoryTimer = window.setTimeout(() => readEntry(entry), calm ? 0 : SHOW.go + 150)
}
app.appendChild(card.root)

/** 마을 수첩에서 여는 기분 달력. 쓴 날을 누르면 그 집으로 날아가 글을 연다 */
const calendar = createCalendar({
  onOpen: visitMemory,
  titles: () => save.monthTitles ?? {},
  // 사진 보관함을 못 열면 null 이라 "📷 사진" 갈래가 없다
  photos: () => (photoStore ? photoDays(save, photos) : null),
  // 달 이름은 사용자가 정한 것이라 저장한다. 구역 이름표가 바로 바뀌게 다시 그린다
  onTitle: readOnly
    ? null
    : (month, input) => {
        const r = setMonthTitle(save, month, input)
        if (!r.ok) return `${TITLE_MAX}자까지 지을 수 있어요`
        return keepLetters(r.save)
      },
})
document.body.appendChild(calendar.root)

const camera = createCamera(svg, (target, at) => {
  if (decorating) return decorTap(target, at)
  if (target.closest('.postbox')) return letterBox.open()
  const id =target.closest('.landmark')?.getAttribute('data-landmark')
  const landmark = LANDMARKS.find((l) => l.id === id)
  if (landmark) return showNote(`${landmark.icon} ${landmark.name} · 한 줄을 ${landmark.days}일 남겨 생겼어요`, 0)
  const gid = target.closest('.guest')?.getAttribute('data-guest')
  const rid = gid ?? target.closest('.resident')?.getAttribute('data-resident')
  const resident = RESIDENTS.find((r) => r.id === rid)
  if (resident) {
    sound.cue('resident', resident.id)
    const today = dayKey(Date.now())
    // 이사 기념일인 이웃은 그날 처음 누르면 기념일 인사를 하고, 다음부터는 여느 차례(손님 한마디·잔치 한마디…)를 잇는다
    const anniversary = anniversariesOn(builtDays(save), today).find((a) => a.resident.id === resident.id)
    const annKey = `anniversary:${resident.id}:${today}`
    if (anniversary && !taps.has(annKey)) {
      taps.set(annKey, 1)
      return showNote(`${resident.name}: “${anniversaryLine(anniversary)}”`, 0)
    }
    // 손님은 처음엔 손님 한마디(기다리다 집이 생기면 다시 처음부터), 다시 누르면 오늘 이야기 다음 차례를 잇는다
    const guest = gid ? drawn?.guests.find((g) => g.resident.id === gid) : undefined
    // 글을 고쳐 맞장구가 바뀌면 다시 처음부터 그 말을 한다
    const guestKey = `guest:${resident.id}:${guest ? guestLine(guest) : 'wait'}`
    if (guest && !taps.has(guestKey)) {
      taps.set(guestKey, 1)
      taps.set(resident.id, Math.max(1, taps.get(resident.id) ?? 0))
      return showNote(`${resident.name}: “${guestLine(guest)}”`, 0)
    }
    const tap = taps.get(resident.id) ?? 0
    taps.set(resident.id, tap + 1)
    // 정이 쌓인 이웃은 한마디 차례에 열린 자기 이야기 하나를 끼운다
    const friend = friendOf(resident, builtDays(save))
    const talk = residentTalk(resident, save.entries, today, tap, builtDays(save), festivalOn(builtDays(save), today), friend && friendStory(friend, today))
    // 지난 이야기면 "보러 가기"로 그 집에 날아가 글을 연다
    const told = talk.date ? entryOn(save, talk.date) : undefined
    return showNote(`${resident.name}: “${talk.text}”`, 0, told && { label: '보러 가기', run: () => visitMemory(told) })
  }
  const date = target.closest('[data-date]')?.getAttribute('data-date')
  const entry = date ? entryOn(save, date) : undefined
  if (entry) readEntry(entry)
}, grabDecor)

/*
 * 꾸미기 모드: "오늘의 한 줄" 카드 자리에 소품 바구니가 온다.
 * 바구니에서 소품을 골라(pick) 빈 자리를 누르면 놓이고, 놓인 소품을 누르면 골라져(picked) 빈 자리를 누르거나 끌어서 옮긴다.
 * 소품 자리만 저장하고 기록(글)은 건드리지 않는다
 */
let decorating = false
let pick: DecorId | null = null
let picked: number | null = null
let decorMsg = ''
/** 마지막으로 그린 마을(누른 칸을 자리로 바꿀 때 쓴다) */
let drawn: { village: Village; today: string; guests: Guest[]; walks: Walk[]; hangouts: Hangout[] } | null = null
const HINT = '소품을 고르고 빈 자리(점선)를 눌러 놓아요. 놓은 소품은 눌러서 옮기거나 치워요'
const decorName = (id: DecorId) => {
  const d = DECORS.find((x) => x.id === id)!
  return `${d.icon} ${d.name}`
}
/** "🪴 화분을", "🪑 벤치를": 받침이 있으면 '을' */
const decorObj = (id: DecorId) => {
  const name = decorName(id)
  const last = name.charCodeAt(name.length - 1) - 0xac00
  return `${name}${last >= 0 && last % 28 > 0 ? '을' : '를'}`
}

const tray = createDecorTray({
  onPick(id) {
    pick = id
    picked = null
    decorMsg = id ? `${decorObj(id)} 놓을 빈 자리를 눌러요` : HINT
    render()
  },
  onRemove() {
    if (picked == null) return
    const id = save.decor?.[picked]?.id
    if (!id || !keepDecor(removeDecor(save, picked))) return render()
    picked = null
    decorMsg = `${decorObj(id)} 치웠어요. 다시 놓을 수 있어요`
    render()
  },
  onDone: () => setDecorating(false),
})
app.appendChild(tray.root)

/** id: 바구니에서 미리 고를 소품(첫 주 선물의 "놓으러 가기") */
function setDecorating(on: boolean, id: DecorId | null = null) {
  if (on && !decorating) tray.reset()
  decorating = on
  pick = on ? id : null
  picked = null
  decorMsg = pick ? `${decorObj(pick)} 놓을 빈 자리를 눌러요` : HINT
  note.hidden = true
  render()
}

/** 소품 자리를 저장한다. 못 하면 바구니에 알리고 false */
function keepDecor(next: SaveData): boolean {
  try {
    writeSave(kv, next)
  } catch {
    decorMsg = '저장하지 못했어요. 저장 공간을 확인해 주세요'
    return false
  }
  save = next
  return true
}

/** 화면 좌표 → 그 아래 땅의 소품 자리 */
function placeUnder(p: { x: number; y: number }) {
  if (!drawn) return null
  const { gx, gy } = cellAt(camera.toVillage(p))
  return placeAt(drawn.village, gx, gy)
}

/** 놓기·옮기기 결과를 저장하고 알린다 */
function applyPlace(r: PlaceResult | null, done: string) {
  if (r?.ok && keepDecor(r.save)) {
    pick = null
    picked = null
    decorMsg = done
    sound.cue('place')
  } else if (!r?.ok) decorMsg = '거기에는 놓을 수 없어요. 점선 자리를 골라요'
  render()
}

/**
 * 꾸미기 중 마을을 짧게 눌렀을 때: 고른 소품이 있으면 그 자리에 놓거나 옮긴다.
 * 집·명소를 누르면 놓지 않고, 나무를 누르면 그 나무가 선 칸으로 본다(그림이 뒤 칸에 걸쳐 있어도)
 */
function decorTap(target: Element, at: { x: number; y: number }) {
  if (!drawn || (pick == null && picked == null)) {
    decorMsg = HINT
    return render()
  }
  const { village, today } = drawn
  const tree = target.closest('.tree, .bush')?.getAttribute('data-cell')?.split(',').map(Number)
  const place = target.closest('.house, .landmark, .postbox') ? null : tree ? placeAt(village, tree[0], tree[1]) : placeUnder(at)
  if (pick != null) {
    const id = pick
    applyPlace(place && placeDecor(save, village, today, id, place), `${decorObj(id)} 놓았어요`)
  } else if (picked != null) {
    const id = save.decor![picked].id
    applyPlace(place && moveDecor(save, village, today, picked, place), `${decorObj(id)} 옮겼어요`)
  }
}

/** 꾸미기 중 놓인 소품에 손을 대면 화면 대신 그 소품을 잡는다. 짧게 누르면 고르고, 끌면 옮긴다 */
let drag: { id: number; index: number; x: number; y: number; moved: boolean } | null = null
function grabDecor(e: PointerEvent): boolean {
  if (!decorating) return false
  const node = (e.target as Element).closest('.decor')
  const index = Number(node?.getAttribute('data-testid')?.replace('decor-', ''))
  if (!node || !Number.isInteger(index)) return false
  drag = { id: e.pointerId, index, x: e.clientX, y: e.clientY, moved: false }
  return true
}
const dragNode = (index: number) => svg.querySelector<SVGGElement>(`[data-testid="decor-${index}"]`)
window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return
  const dx = e.clientX - drag.x
  const dy = e.clientY - drag.y
  if (!drag.moved) {
    if (Math.hypot(dx, dy) < 8) return
    // 끌기 시작: 그 소품을 고르고 빈 자리를 보인다
    drag.moved = true
    pick = null
    picked = drag.index
    decorMsg = `${decorName(save.decor![drag.index].id)} · 빈 자리에 내려놓아요`
    render()
    dragNode(drag.index)?.classList.add('lifted')
  }
  const u = camera.unit()
  dragNode(drag.index)?.setAttribute('transform', `translate(${(dx * u).toFixed(1)} ${(dy * u).toFixed(1)})`)
})
window.addEventListener('pointerup', (e) => {
  if (!drag || e.pointerId !== drag.id) return
  const { index, moved, x, y } = drag
  drag = null
  if (!moved) {
    // 짧게 누름: 고르기(다시 누르면 내려놓기)
    pick = null
    picked = picked === index ? null : index
    decorMsg = picked == null ? HINT : `${decorName(save.decor![index].id)} · 빈 자리를 누르거나 끌어서 옮겨요`
    return render()
  }
  // 소품 발밑(칸 가운데)이 손가락을 따라 움직인 만큼 옮긴 자리
  const d = drawn && decorsOnMap(drawn.village, drawn.today, save).find((x) => x.index === index)
  if (!d || !drawn) return render()
  const foot = iso(d.gx + 0.5, d.gy + 0.5)
  const u = camera.unit()
  const { gx, gy } = cellAt({ x: foot.x + (e.clientX - x) * u, y: foot.y + (e.clientY - y) * u })
  const place = placeAt(drawn.village, gx, gy)
  if (place && place.at === d.at && place.col === d.col && place.row === d.row) return render()
  applyPlace(place && moveDecor(save, drawn.village, drawn.today, index, place), `${decorObj(d.id)} 옮겼어요`)
})
window.addEventListener('pointercancel', (e) => {
  if (!drag || e.pointerId !== drag.id) return
  drag = null
  render()
})

let shownDay = ''
/** 주민마다 누른 횟수(누를 때마다 다른 한마디). 저장하지 않는다 */
const taps = new Map<string, number>()

const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** 지은 건물을 마을 아래쪽에 잠깐 알려 준다("'커피'를 찾아 카페가 생겼어요"). 누르면 닫힌다 */
const note = app.querySelector<HTMLElement>('.build-note')!
let noteTimer = 0
note.addEventListener('click', () => (note.hidden = true))
/** 알림 안의 버튼. soft 면 줄처럼 옅게(말의 메아리 줄) */
type NoteAction = { label: string; run: () => void; testid?: string; soft?: boolean }
/** action: 알림 안에 둘 버튼(누르면 할 일을 하고 닫힌다). 버튼이 있으면 누를 틈을 조금 더 준다. 글이 비어도 버튼이 있으면 보인다 */
function showNote(text: string | null, delay = SHOW.go, action?: NoteAction | NoteAction[] | null) {
  clearTimeout(noteTimer)
  const actions = action ? [action].flat() : []
  note.hidden = !text && !actions.length
  if (note.hidden) return
  note.textContent = text ?? ''
  note.classList.toggle('with-action', actions.length > 0)
  for (const a of actions) {
    const go = document.createElement('button')
    go.type = 'button'
    go.className = a.soft ? 'note-go note-soft' : 'note-go'
    go.dataset.testid = a.testid ?? 'note-go'
    go.textContent = a.label
    go.addEventListener('click', a.run)
    note.appendChild(go)
  }
  note.style.setProperty('--delay', `${calm ? 0 : delay}ms`)
  noteTimer = window.setTimeout(() => (note.hidden = true), delay + SHOW.hold + SHOW.back + (actions.length ? 5000 : 2500))
}

/** newDate: 방금 지은 집이 있으면 그 집으로 다가가 짓는 연출을 보인다. comers: 방금 이사 온 새 이웃(광장으로 들어온다) */
/** 마을을 그린 때. 밤이 되면 작은 동물이 쉬러 가도록 때가 바뀌면 다시 그린다 */
let drawnPart: DayPart = 'day'

function render(newDate?: string, comers: string[] = []) {
  const today = dayKey(Date.now())
  // 지운 날은 빈 땅으로 돌아가지만 집을 지었던 날로 센다(명소·단계·주민을 빼앗지 않는다)
  const days = builtDays(save)
  const village = buildVillage(save.entries, today, (save.erased ?? []).map((x) => x.date))
  const festival = festivalOn(days, today)
  // 오늘의 손님: 소품이 놓인 칸은 피해 오늘 집 앞에 선다. 손님이 된 주민은 걷지 않는다
  const decors = decorsOnMap(village, today, save)
  // 오늘 이사 온 새 이웃은 손님보다 광장 길을 먼저 받는다(기록·날짜로 계산, 저장하지 않음)
  const newcomers = [...new Set([...arrivedOn(days, today).map((x) => x.id), ...comers])]
  const guests = todayGuests(village, residentsOf(days), save.entries, today, decors, newcomers, friendsRoseOn(days, today))
  // 놓아 둔 쉼터에는 손님·새 이웃이 아닌 이웃이 놀러 와 머문다(걷지 않는다)
  const hangouts = hangoutsOf(residentsOf(days), decors, [...guests.map((g) => g.resident.id), ...newcomers])
  const staying = new Set(hangouts.map((h) => h.resident.id))
  const walks = residentWalks(village, residentsOf(days).filter((r) => !staying.has(r.id)), guests, newcomers)
  drawnPart = dayPart(Date.now())
  drawn = { village, today, guests, walks, hangouts }
  showBackupDue()
  if (picked != null && !save.decor?.[picked]) picked = null
  // 꾸미기 중 소품을 골랐으면 놓을 수 있는 빈 자리를 점선으로 보인다
  const spots = decorating && (pick != null || picked != null) ? decorSpots(village, today, save) : []
  card.root.hidden = decorating
  tray.root.hidden = !decorating
  scene.classList.toggle('decorating', decorating)
  if (decorating) {
    // 빈 갈래에는 다음에 열릴 것을 보인다
    const book = decorBook(days)
    const ahead = (kind: Decor['kind']) => book.find((d) => !d.unlocked && d.decor.kind === kind)
    const next = Object.fromEntries((['decor', 'facility'] as const).flatMap((k) => (ahead(k) ? [[k, ahead(k)!]] : [])))
    tray.render(unlockedDecors(days), pick, picked != null, decorMsg, next)
  }
  drawVillage(svg, village, {
    spots,
    picked: decorating ? (picked ?? undefined) : undefined,
    today,
    newDate,
    buildDelay: newDate && !calm ? SHOW.go : 0,
    landmarks: earnedLandmarks(days),
    sign: nextSign(days),
    walks,
    arrive: calm ? [] : comers,
    guests,
    hangouts,
    tokens: friendTokens(days),
    hats: new Set(anniversariesOn(days, today).map((a) => a.resident.id)),
    decors,
    festival: festival?.id,
    mailbox: { waiting: waitingLetters(save, Date.now()).length > 0 },
    firstSign: firstSignDate(days),
    critters: critters(village, today, drawnPart, weatherOf(save.entries, today), new Set(decors.map((d) => `${d.gx},${d.gy}`))),
    titles: save.monthTitles,
    photoDays: new Set(Object.keys(photos)),
  })
  // 가장 멀리 볼 때 화면 가운데로 데려올 마을(섬 전체) 자리
  const land = svg.querySelector<SVGGraphicsElement>('.ground')!.getBBox()
  camera.setWorld(land.width > 0 ? { x: land.x, y: land.y, w: land.width, h: land.height } : null)
  const todayEntry = entryOn(save, today)
  renderCard(today)
  const count = save.entries.length
  app.querySelector('[data-testid="house-count"]')!.textContent = `🏠 ${count}채`
  app.querySelector('[data-testid="village-stage"] .stage')!.textContent = stageLabel(days)
  app.querySelector('[data-testid="village-name"]')!.textContent = villageTitle(save)
  paintSky()
  const mood = moodOf(todayEntry?.mood ?? 'calm')
  app.querySelector('[data-testid="weather"]')!.textContent = todayEntry ? `${mood.emoji} 오늘은 ${mood.weather}` : '✨ 오늘 자리가 비어 있어요'
  // 날이 바뀌었을 때만 오늘 구역으로 화면을 옮긴다(둘러보던 자리를 지킨다)
  // 처음엔 오늘 자리 쪽을 집이 또렷이 보이게 가까이 보고, 그달 섬이 화면 가운데에 알맞게 오게 맞춘다
  if (shownDay !== today) {
    const block = village.blocks.find((b) => b.month === today.slice(0, 7))!
    const lot = block.lots.find((l) => l.date === today)!
    // 집이 몇 채 없으면 그 집들과 오늘 자리(첫 집 팻말, 이달 이름표까지)가 화면에 꽉 차게 본다
    const houses = [...svg.querySelectorAll<SVGGraphicsElement>('.house[data-date]')]
    const marks = svg.querySelectorAll<SVGGraphicsElement>(`[data-testid="today-spot"], [data-testid="first-sign"], [data-testid="month-${block.month}"]`)
    const boxes = [...houses, ...marks].map((n) => {
      const b = n.getBBox()
      return { x: b.x, y: b.y, w: b.width, h: b.height }
    })
    if (!camera.open(iso(lot.gx + 0.5, lot.gy + 0.5, 22), START_UNIT, blockView(block), boxes, houses.length)) camera.show(blockView(block))
    shownDay = today
    // 잔치 카드가 있으면 그 카드를 닫은 뒤 편지가 찾아온다
    if (festival) showFestival(festival, showArrivals)
    else showArrivals()
  } else if (newDate && !calm) {
    const lot = village.blocks.flatMap((b) => b.lots).find((l) => l.date === newDate)
    if (lot) camera.visit(iso(lot.gx + 0.5, lot.gy + 0.5, 22))
  }
}

/**
 * 하늘 색과 날씨는 오늘 기분을 따르고, 지금 때(낮·저녁·밤)로 물든다.
 * 오늘 자리가 비었으면 구름 조금 낀 평온한 하늘이다. 저녁·밤에는 창문에 불이 켜진다
 */
function paintSky() {
  const now = Date.now()
  const today = dayKey(now)
  const part = dayPart(now)
  const [top, bottom] = skyColors(entryOn(save, today)?.mood ?? 'calm', part)
  scene.style.setProperty('--sky-top', top)
  scene.style.setProperty('--sky-bottom', bottom)
  scene.dataset.time = part
  scene.classList.toggle('lit', windowsLit(part))
  scene.classList.toggle('smoky', smokeOn(today, part))
  drawSky(skyBack, skyFar, skyFront, weatherOf(save.entries, today), part, today)
}

/** "오늘의 한 줄" 카드만 다시 그린다 */
function renderCard(today: string) {
  const prompts = { today: todayPrompt(save.entries, today).text, yesterday: yesterdayPrompt(today) }
  card.render(today, entryOn(save, today), readOnly ? null : yesterdayOpen(save, Date.now()), memoryOf(save.entries, today), yearRecapOf(save.entries, today) ?? recapOf(save.entries, today), prompts)
}

/** 숫자 잠금(⚙️ 설정에서 켠다). 잠긴 동안 마을은 흐리고 글·사진·쪽지는 그리지 않는다 */
const lockScreen = createLockScreen({
  lock: () => readLock(kv),
  keep: (lock) => {
    try {
      writeLock(kv, lock)
    } catch {
      // 못 남겨도 잠금 화면은 그대로 쓴다
    }
  },
  onOpen: () => {},
})
document.body.appendChild(lockScreen.root)
/** 번호를 잊은 뒤 하루가 지났으면 잠금만 풀어 두고 알린다(글·사진은 그대로) */
function lockNow(now: number): boolean {
  const lock = readLock(kv)
  if (!lock) return false
  if (lockOn(lock, now)) return true
  try {
    writeLock(kv, null)
  } catch {
    // 못 지워도 lockOn 이 잠그지 않는다
  }
  showNote('하루가 지나 잠금이 풀렸어요 · ⚙️에서 새 번호를 정할 수 있어요', 0)
  return false
}
if (lockNow(Date.now())) lockScreen.show()
/** 다른 앱으로 떠난 시각. 5분 넘게 떠났다 돌아오면 다시 잠근다 */
let leftAt: number | null = null

render()
// 사진 보관함은 따로 천천히 연다. 열리면 쓰기 칸에 "📷 사진"이 생긴다(못 열면 사진 없이 그대로)
openPhotoStore()
  .then(async (store) => {
    if (!store) return
    photos = photosShown(save, await store.all())
    photoStore = store
    // 사진이 붙은 날이 있으면 마당 액자가 서게 마을까지 다시 그린다
    if (Object.keys(photos).length && !growth.playing) render()
    else if (!readOnly) renderCard(shownDay)
  })
  .catch(() => {})
// 앱을 켜 둔 채 자정을 넘기면 새 날로 다시 그리고, 저녁·밤이 되면 하늘을 바꾼다
function refresh() {
  // 잠긴 채 하루가 지나면(번호를 잊었어요) 잠금만 푼다
  if (lockScreen.locked && !lockNow(Date.now())) lockScreen.hide()
  // 자라 온 길을 보는 동안은 다시 그리지 않는다(끝나면 다시 그린다)
  if (growth.playing) return
  if (dayKey(Date.now()) !== shownDay || dayPart(Date.now()) !== drawnPart) render()
  else paintSky()
}
setInterval(refresh, 30_000)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    leftAt = Date.now()
    return
  }
  if (!lockScreen.locked && shouldRelock(leftAt, Date.now()) && lockNow(Date.now())) lockScreen.show()
  leftAt = null
  refresh()
})
