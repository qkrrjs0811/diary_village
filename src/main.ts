import './style.css'
import { buildingNote, buildingOf } from './core/building'
import { dayKey } from './core/date'
import { editEntry, entryOn, writeEntry, yesterdayOpen, type Day } from './core/entries'
import { moodOf } from './core/mood'
import { loadSave, writeSave, type KV } from './core/storage'
import type { MoodId, SaveData } from './core/types'
import { buildVillage } from './core/village'
import { createReader } from './ui/reader'
import { createWriteCard } from './ui/write'
import { createCamera } from './village/camera'
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
  <header class="top"><b data-testid="village-name">한 줄 마을</b><span class="count" data-testid="house-count"></span></header>
  <div class="banner" data-testid="storage-warning" hidden></div>
  <main class="scene" data-testid="scene">
    <svg data-testid="village" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"></svg>
    <div class="weather" data-testid="weather"></div>
    <div class="build-note" data-testid="build-note" role="status" hidden></div>
  </main>`
const svg = app.querySelector<SVGSVGElement>('svg')!
const scene = app.querySelector<HTMLElement>('.scene')!
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
    save = r.save
    render(r.entry.date)
    showNote(buildingNote(buildingOf(r.entry)))
    return null
  },
  onOpen: (entry) => reader.open(entry),
})
app.appendChild(card.root)

const camera = createCamera(svg, (target) => {
  const date = target.closest('[data-date]')?.getAttribute('data-date')
  const entry = date ? entryOn(save, date) : undefined
  if (entry) reader.open(entry)
})

let shownDay = ''

const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** 지은 건물을 마을 아래쪽에 잠깐 알려 준다("'커피'를 찾아 카페가 생겼어요"). 누르면 닫힌다 */
const note = app.querySelector<HTMLElement>('.build-note')!
let noteTimer = 0
note.addEventListener('click', () => (note.hidden = true))
function showNote(text: string | null) {
  clearTimeout(noteTimer)
  note.hidden = !text
  if (!text) return
  note.textContent = text
  note.style.setProperty('--delay', `${calm ? 0 : SHOW.go}ms`)
  noteTimer = window.setTimeout(() => (note.hidden = true), SHOW.go + SHOW.hold + SHOW.back + 2500)
}

/** newDate: 방금 지은 집이 있으면 그 집으로 다가가 짓는 연출을 보인다 */
function render(newDate?: string) {
  const today = dayKey(Date.now())
  const village = buildVillage(save.entries, today)
  drawVillage(svg, village, { today, newDate, buildDelay: newDate && !calm ? SHOW.go : 0 })
  const todayEntry = entryOn(save, today)
  card.render(today, todayEntry, readOnly ? null : yesterdayOpen(save, Date.now()))
  const count = save.entries.length
  app.querySelector('[data-testid="house-count"]')!.textContent = `🏠 ${count}채`
  // 하늘은 오늘 기분(안 썼으면 가장 최근 기분)을 따른다
  const latest = todayEntry ?? save.entries[save.entries.length - 1]
  const mood = moodOf(latest?.mood ?? 'calm')
  scene.style.setProperty('--sky-top', mood.sky[0])
  scene.style.setProperty('--sky-bottom', mood.sky[1])
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

render()
// 앱을 켜 둔 채 자정을 넘기면 새 날로 다시 그린다
setInterval(() => {
  if (dayKey(Date.now()) !== shownDay) render()
}, 30_000)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && dayKey(Date.now()) !== shownDay) render()
})
