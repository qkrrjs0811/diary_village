import { hasFinal, type BuildingId } from '../core/building'
import { collectionOf, landmarkBook } from '../core/collection'
import { decorBook } from '../core/decor'
import { writtenDays } from '../core/landmark'
import { arrivalsOf } from '../core/resident'
import { nextStage, stageOf } from '../core/stage'
import type { Dated, Entry } from '../core/types'
import { residentIcon } from '../village/render'
import { dateLabel } from './format'

/**
 * 머리줄 단계 이름표를 누르면 여는 마을 수첩. 지금 단계, 건물 도감, 명소, 우리 이웃, 꾸밈 소품을 한 창에 모았다.
 * 모두 기록에서 계산한다. 칸을 누르면 아래에 그 칸 이야기가 보인다
 */
export function createBook(handlers: {
  /** 소품 칸 아래 "마을 꾸미기"로 꾸미기 모드에 들어간다. 저장을 못 쓰면 null */
  onDecorate: (() => void) | null
  /** 단계 칸 아래 "기분 달력 · 찾기"로 달력(위에 찾기 칸이 있다)을 연다 */
  onCalendar: () => void
  /** 도감 칸 아래 "선 날 보기"로 그 건물이 선 날 모아 보기를 연다 */
  onBuilding: (id: BuildingId) => void
  /** 이웃 칸 아래 "이사 온 날 글 보기"로 그날 집으로 날아가 글을 연다 */
  onEntry: (entry: Entry) => void
  /** 단계 칸 아래 "마을이 자라 온 길"로 첫 집부터 오늘까지 다시 보는 장면을 연다 */
  onGrowth: () => void
}) {
  const back = document.createElement('div')
  back.className = 'sheet-back'
  back.hidden = true
  back.innerHTML = `<div class="sheet book" data-testid="book" role="dialog" aria-modal="true" aria-label="마을 수첩"></div>`
  const sheet = back.querySelector<HTMLElement>('.sheet')!
  const close = () => (back.hidden = true)
  back.addEventListener('click', (e) => {
    if (e.target === back) close()
  })

  /** built: 집을 지었던 날(지운 날 포함). 단계·명소는 이 날 수로, 도감은 남은 글로 센다 */
  function show(entries: Entry[], built: Dated[]) {
    const days = writtenDays(built)
    const stage = stageOf(built)
    const next = nextStage(built)
    const items = collectionOf(entries)
    const found = items.filter((c) => c.found).length
    const marks = landmarkBook(built)
    const decors = decorBook(built)
    const arrivals = arrivalsOf(built)
    sheet.innerHTML = `
      <div class="edit-title">📖 마을 수첩</div>
      <div class="book-stage" data-testid="book-stage">
        <span class="book-stage-icon" aria-hidden="true">${stage.icon}</span>
        <div><b></b><p></p></div>
      </div>
      ${built.length ? `<button type="button" class="sheet-btn book-growth" data-testid="book-growth">▶ 마을이 자라 온 길</button>` : ''}
      <button type="button" class="sheet-btn book-calendar" data-testid="book-calendar">📅 기분 달력 · 🔍 찾기</button>
      <div class="settings-group">
        <div class="settings-label">건물 도감 <span class="book-count" data-testid="book-count">${found} / ${items.length}</span></div>
        <div class="book-grid" data-testid="book-buildings">
          ${items
            .map(
              (c) => `<button type="button" class="book-cell${c.found ? '' : ' unknown'}" data-testid="book-${c.building.id}" data-found="${c.found}">
                <span class="book-icon" aria-hidden="true">${c.building.icon}</span><span class="book-name">${c.found ? c.building.name : '???'}</span>
              </button>`,
            )
            .join('')}
        </div>
        <div class="book-detail" data-testid="book-detail" role="status">칸을 누르면 이야기가 보여요</div>
        <button type="button" class="sheet-btn book-days" data-testid="book-building-days" hidden></button>
      </div>
      <div class="settings-group">
        <div class="settings-label">광장 명소 <span class="book-count">${marks.filter((m) => m.earned).length} / ${marks.length}</span></div>
        <div class="book-grid seven" data-testid="book-landmarks">
          ${marks
            .map(
              (m) => `<button type="button" class="book-cell${m.earned ? '' : ' unknown'}" data-testid="book-${m.landmark.id}" data-found="${m.earned}">
                <span class="book-icon" aria-hidden="true">${m.landmark.icon}</span><span class="book-name">${m.earned ? m.landmark.name : `${m.landmark.days}일`}</span>
              </button>`,
            )
            .join('')}
        </div>
        <div class="book-detail" data-testid="book-landmark-detail" role="status">칸을 누르면 이야기가 보여요</div>
      </div>
      <div class="settings-group">
        <div class="settings-label">우리 이웃 <span class="book-count" data-testid="book-neighbor-count">${arrivals.filter((a) => a.date).length} / ${arrivals.length}</span></div>
        <div class="book-grid six" data-testid="book-neighbors">
          ${arrivals
            .map(
              (a) => `<button type="button" class="book-cell${a.date ? '' : ' unknown'}" data-testid="book-neighbor-${a.resident.id}" data-found="${!!a.date}">
                <span class="book-icon" aria-hidden="true"></span><span class="book-name">${a.date ? a.resident.name : `${a.resident.days}일`}</span>
              </button>`,
            )
            .join('')}
        </div>
        <div class="book-detail" data-testid="book-neighbor-detail" role="status">칸을 누르면 이야기가 보여요</div>
        <button type="button" class="sheet-btn book-days" data-testid="book-neighbor-day" hidden>📖 이사 온 날 글 보기</button>
      </div>
      <div class="settings-group">
        <div class="settings-label">꾸밈 소품 <span class="book-count" data-testid="book-decor-count">${decors.filter((d) => d.unlocked).length} / ${decors.length}</span></div>
        <div class="book-grid six" data-testid="book-decors">
          ${decors
            .map(
              (d) => `<button type="button" class="book-cell${d.unlocked ? '' : ' unknown'}" data-testid="book-decor-${d.decor.id}" data-found="${d.unlocked}">
                <span class="book-icon" aria-hidden="true">${d.decor.icon}</span><span class="book-name">${d.unlocked ? d.decor.name : `${d.decor.days}일`}</span>
              </button>`,
            )
            .join('')}
        </div>
        <div class="book-detail" data-testid="book-decor-detail" role="status">칸을 누르면 이야기가 보여요</div>
        ${handlers.onDecorate && decors.some((d) => d.unlocked) ? `<button type="button" class="sheet-btn build book-decorate" data-testid="book-decorate">🎨 마을 꾸미기</button>` : ''}
      </div>
      <div class="sheet-buttons">
        <button type="button" class="sheet-btn close" data-testid="book-close">닫기</button>
      </div>`
    sheet.querySelector('.book-stage b')!.textContent = `${stage.name} · 한 줄을 ${days}일 남겼어요`
    sheet.querySelector('.book-stage p')!.textContent = next ? `${next.left}일 더 쓰면 ${next.stage.icon} ${next.stage.name}` : '가장 큰 마을이 되었어요'
    sheet.querySelector('.close')!.addEventListener('click', close)
    sheet.querySelector('.book-calendar')!.addEventListener('click', () => {
      close()
      handlers.onCalendar()
    })
    sheet.querySelector('.book-growth')?.addEventListener('click', () => {
      close()
      handlers.onGrowth()
    })
    sheet.querySelector('.book-decorate')?.addEventListener('click', () => {
      close()
      handlers.onDecorate?.()
    })

    const detail = sheet.querySelector<HTMLElement>('[data-testid="book-detail"]')!
    const daysBtn = sheet.querySelector<HTMLButtonElement>('[data-testid="book-building-days"]')!
    let picked: BuildingId | null = null
    daysBtn.addEventListener('click', () => {
      if (!picked) return
      close()
      handlers.onBuilding(picked)
    })
    sheet.querySelectorAll<HTMLButtonElement>('[data-testid="book-buildings"] .book-cell').forEach((cell, i) => {
      const c = items[i]
      cell.addEventListener('click', () => {
        select(cell)
        // 찾은 건물이면 그 건물이 선 날 모아 보기로 잇는다(지운 날만 남아 0채면 숨긴다)
        picked = c.count ? c.building.id : null
        daysBtn.hidden = !picked
        daysBtn.textContent = `${c.building.icon} ${c.building.name}${hasFinal(c.building.name) ? '이' : '가'} 선 날 ${c.count}일 보기`
        detail.textContent = c.first
          ? `${c.building.icon} ${c.building.name} · ${c.count}채 · ${dateLabel(c.first.date).replace(/ .요일$/, '')}에 '${c.first.word}'에서 처음 생겼어요`
          : `❔ ${c.hint}에 생겨요`
      })
    })
    const markDetail = sheet.querySelector<HTMLElement>('[data-testid="book-landmark-detail"]')!
    sheet.querySelectorAll<HTMLButtonElement>('[data-testid="book-landmarks"] .book-cell').forEach((cell, i) => {
      const m = marks[i]
      cell.addEventListener('click', () => {
        select(cell)
        markDetail.textContent = m.earned
          ? `${m.landmark.icon} ${m.landmark.name} · 한 줄을 ${m.landmark.days}일 남겨 생겼어요`
          : `❔ ${m.left}일 더 쓰면 광장에 새 명소가 생겨요`
      })
    })
    const neighborDetail = sheet.querySelector<HTMLElement>('[data-testid="book-neighbor-detail"]')!
    const dayBtn = sheet.querySelector<HTMLButtonElement>('[data-testid="book-neighbor-day"]')!
    let arrivedEntry: Entry | null = null
    dayBtn.addEventListener('click', () => {
      if (!arrivedEntry) return
      close()
      handlers.onEntry(arrivedEntry)
    })
    sheet.querySelectorAll<HTMLButtonElement>('[data-testid="book-neighbors"] .book-cell').forEach((cell, i) => {
      const a = arrivals[i]
      cell.querySelector('.book-icon')!.appendChild(residentIcon(a.resident))
      cell.addEventListener('click', () => {
        select(cell)
        // 이사 온 날 글이 남아 있을 때만 다시 읽으러 간다(지운 날이면 숨긴다)
        arrivedEntry = (a.date && entries.find((e) => e.date === a.date)) || null
        dayBtn.hidden = !arrivedEntry
        neighborDetail.textContent = a.date
          ? `${a.resident.name} · ${dateLabel(a.date).replace(/ .요일$/, '')}에 이사 왔어요 · 좋아하는 것: ${a.resident.likes}`
          : `❔ ${a.left}일 더 쓰면 새 이웃이 와요`
      })
    })
    const decorDetail = sheet.querySelector<HTMLElement>('[data-testid="book-decor-detail"]')!
    sheet.querySelectorAll<HTMLButtonElement>('[data-testid="book-decors"] .book-cell').forEach((cell, i) => {
      const d = decors[i]
      cell.addEventListener('click', () => {
        select(cell)
        decorDetail.textContent = d.unlocked
          ? `${d.decor.icon} ${d.decor.name} · 한 줄을 ${d.decor.days}일 남겨 열렸어요`
          : `❔ ${d.left}일 더 쓰면 새 소품이 열려요`
      })
    })
  }

  function select(cell: HTMLElement) {
    cell.parentElement!.querySelectorAll('.book-cell').forEach((c) => c.classList.toggle('on', c === cell))
  }

  return {
    root: back,
    open(entries: Entry[], built: Dated[]) {
      show(entries, built)
      back.hidden = false
    },
  }
}
