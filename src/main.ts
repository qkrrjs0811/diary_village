import './style.css'
import { backupFileName, backupText, planImport } from './core/backup'
import { buildingNote, buildingOf } from './core/building'
import { dayKey } from './core/date'
import { editEntry, entryOn, writeEntry, yesterdayOpen, type Day } from './core/entries'
import { moodOf } from './core/mood'
import { loadSave, writeSave, type KV } from './core/storage'
import type { MoodId, SaveData } from './core/types'
import { buildVillage } from './core/village'
import { LANDMARKS, earnedLandmarks, landmarkSpot, nextSign, reachedLandmarks, type Landmark } from './core/landmark'
import { NAME_MAX, renameVillage, villageTitle } from './core/name'
import { milestoneCard, reachedStages, stageLabel } from './core/stage'
import { RESIDENTS, residentLine, residentWalks, residentsOf } from './core/resident'
import { createBook } from './ui/book'
import { createCelebration } from './ui/celebrate'
import { createReader } from './ui/reader'
import { createSettings } from './ui/settings'
import { createWriteCard } from './ui/write'
import { createCamera } from './village/camera'
import { drawSky } from './village/sky'
import { dayPart, skyColors, weatherOf, windowsLit } from './core/weather'
import { SHOW, START_UNIT } from './core/view'
import { blockView, drawVillage, iso } from './village/render'

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

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <header class="top"><b data-testid="village-name">한 줄 마을</b><button type="button" class="stage-btn" data-testid="village-stage" aria-label="마을 수첩 열기"><span class="stage"></span></button><span class="count" data-testid="house-count"></span><button type="button" class="gear" data-testid="settings-open" aria-label="설정">⚙️</button></header>
  <div class="banner" data-testid="storage-warning" hidden></div>
  <main class="scene" data-testid="scene">
    <div class="sky sky-back" data-testid="sky" aria-hidden="true"></div>
    <svg data-testid="village" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"></svg>
    <div class="sky sky-front" data-testid="rain" aria-hidden="true"></div>
    <div class="weather" data-testid="weather"></div>
    <div class="build-note" data-testid="build-note" role="status" hidden></div>
  </main>`
const svg = app.querySelector<SVGSVGElement>('svg')!
const scene = app.querySelector<HTMLElement>('.scene')!
const skyBack = app.querySelector<HTMLElement>('.sky-back')!
const skyFront = app.querySelector<HTMLElement>('.sky-front')!
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
    : (date, text, mood) => {
        const r = editEntry(save, date, { text, mood }, Date.now())
        if (!r.ok) return { error: r.reason === 'missing' ? '이 날의 기록을 찾지 못했어요' : '한 줄을 다시 확인해 주세요' }
        if (!r.changed) return { entry: r.entry }
        try {
          writeSave(kv, r.save)
        } catch {
          return { error: '저장하지 못했어요. 저장 공간을 확인해 주세요' }
        }
        save = r.save
        render()
        return { entry: r.entry }
      },
})
document.body.appendChild(reader.root)

const settings = createSettings({
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
  exportFile: readOnly ? null : () => ({ name: backupFileName(dayKey(Date.now())), text: backupText(save) }),
  planImport: readOnly ? null : (text) => planImport(save, text),
  applyImport(plan) {
    if (readOnly) return '지금은 가져올 수 없어요'
    try {
      writeSave(kv, plan.save)
    } catch {
      return '저장하지 못했어요. 저장 공간을 확인해 주세요'
    }
    const before = save.entries
    save = plan.save
    render()
    celebrate(before, 0)
    return null
  },
})
document.body.appendChild(settings.root)

const celebrateCard = createCelebration({ onVisit: visitLandmark })
document.body.appendChild(celebrateCard.root)
let celebrateTimer = 0
/** before → 지금 기록으로 명소가 생기거나 마을 단계가 올랐으면 축하 카드를 띄운다. wait: 짓는 연출이 끝날 때까지 기다리는 시간 */
function celebrate(before: SaveData['entries'], wait: number) {
  const landmarks = reachedLandmarks(before, save.entries)
  const stages = reachedStages(before, save.entries)
  if (landmarks.length === 0 && stages.length === 0) return
  clearTimeout(celebrateTimer)
  const text = milestoneCard(landmarks, stages, save.entries)
  celebrateTimer = window.setTimeout(() => celebrateCard.open(text), wait)
}
/** 광장의 명소로 화면을 옮기고, 그 명소가 쑥 올라온다 */
function visitLandmark(l: Landmark) {
  const s = landmarkSpot(l)
  // 처음 보기보다 조금 멀리: 옆 자리의 다음 명소 팻말까지 함께 보인다
  camera.glide(iso(s.gx + 0.5, s.gy + 0.5, 26), 0.8)
  const node = svg.querySelector<SVGGElement>(`[data-landmark="${l.id}"].landmark`)
  if (!node || calm) return
  node.classList.remove('pop')
  node.style.setProperty('--delay', `${SHOW.go}ms`)
  void node.getBoundingClientRect()
  node.classList.add('pop')
}
app.querySelector('[data-testid="settings-open"]')!.addEventListener('click', () => settings.open())

/** 머리줄 단계 이름표를 누르면 마을 수첩(단계·건물 도감·명소)이 열린다 */
const book = createBook()
document.body.appendChild(book.root)
app.querySelector('[data-testid="village-stage"]')!.addEventListener('click', () => book.open(save.entries))

const card = createWriteCard({
  onSubmit(text: string, mood: MoodId, day: Day) {
    if (readOnly) return '지금은 쓸 수 없어요'
    const r = writeEntry(save, { text, mood }, Date.now(), day)
    if (!r.ok) return r.reason === 'already' ? `${day === 'today' ? '오늘은' : '어제는'} 이미 집을 지었어요` : '한 줄을 다시 확인해 주세요'
    try {
      writeSave(kv, r.save)
    } catch {
      return '저장하지 못했어요. 저장 공간을 확인해 주세요'
    }
    const before = save.entries
    save = r.save
    render(r.entry.date)
    showNote(buildingNote(buildingOf(r.entry)))
    celebrate(before, calm ? 0 : SHOW.go + SHOW.hold + SHOW.back)
    return null
  },
  onOpen: (entry) => reader.open(entry),
})
app.appendChild(card.root)

const camera = createCamera(svg, (target) => {
  const id = target.closest('.landmark')?.getAttribute('data-landmark')
  const landmark = LANDMARKS.find((l) => l.id === id)
  if (landmark) return showNote(`${landmark.icon} ${landmark.name} · 한 줄을 ${landmark.days}일 남겨 생겼어요`, 0)
  const rid = target.closest('.resident')?.getAttribute('data-resident')
  const resident = RESIDENTS.find((r) => r.id === rid)
  if (resident) {
    const tap = taps.get(resident.id) ?? 0
    taps.set(resident.id, tap + 1)
    return showNote(`${resident.name}: “${residentLine(resident, save.entries, dayKey(Date.now()), tap)}”`, 0)
  }
  const date = target.closest('[data-date]')?.getAttribute('data-date')
  const entry = date ? entryOn(save, date) : undefined
  if (entry) reader.open(entry)
})

let shownDay = ''
/** 주민마다 누른 횟수(누를 때마다 다른 한마디). 저장하지 않는다 */
const taps = new Map<string, number>()

const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** 지은 건물을 마을 아래쪽에 잠깐 알려 준다("'커피'를 찾아 카페가 생겼어요"). 누르면 닫힌다 */
const note = app.querySelector<HTMLElement>('.build-note')!
let noteTimer = 0
note.addEventListener('click', () => (note.hidden = true))
function showNote(text: string | null, delay = SHOW.go) {
  clearTimeout(noteTimer)
  note.hidden = !text
  if (!text) return
  note.textContent = text
  note.style.setProperty('--delay', `${calm ? 0 : delay}ms`)
  noteTimer = window.setTimeout(() => (note.hidden = true), delay + SHOW.hold + SHOW.back + 2500)
}

/** newDate: 방금 지은 집이 있으면 그 집으로 다가가 짓는 연출을 보인다 */
function render(newDate?: string) {
  const today = dayKey(Date.now())
  const village = buildVillage(save.entries, today)
  drawVillage(svg, village, {
    today,
    newDate,
    buildDelay: newDate && !calm ? SHOW.go : 0,
    landmarks: earnedLandmarks(save.entries),
    sign: nextSign(save.entries),
    walks: residentWalks(village, residentsOf(save.entries)),
  })
  const todayEntry = entryOn(save, today)
  card.render(today, todayEntry, readOnly ? null : yesterdayOpen(save, Date.now()))
  const count = save.entries.length
  app.querySelector('[data-testid="house-count"]')!.textContent = `🏠 ${count}채`
  app.querySelector('[data-testid="village-stage"] .stage')!.textContent = stageLabel(save.entries)
  app.querySelector('[data-testid="village-name"]')!.textContent = villageTitle(save)
  paintSky()
  const mood = moodOf(todayEntry?.mood ?? 'calm')
  app.querySelector('[data-testid="weather"]')!.textContent = todayEntry ? `${mood.emoji} 오늘은 ${mood.weather}` : '✨ 오늘 자리가 비어 있어요'
  // 날이 바뀌었을 때만 오늘 구역으로 화면을 옮긴다(둘러보던 자리를 지킨다)
  // 처음엔 오늘 자리를 가운데에 두고 집이 또렷이 보이게 가까이 본다
  if (shownDay !== today) {
    const block = village.blocks.find((b) => b.month === today.slice(0, 7))!
    const lot = block.lots.find((l) => l.date === today)!
    if (!camera.focus(iso(lot.gx + 0.5, lot.gy + 0.5, 22), START_UNIT)) camera.show(blockView(block))
    shownDay = today
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
  drawSky(skyBack, skyFront, weatherOf(save.entries, today), part)
}

render()
// 앱을 켜 둔 채 자정을 넘기면 새 날로 다시 그리고, 저녁·밤이 되면 하늘을 바꾼다
function refresh() {
  if (dayKey(Date.now()) !== shownDay) render()
  else paintSky()
}
setInterval(refresh, 30_000)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh()
})
