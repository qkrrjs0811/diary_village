import { collectionOf, landmarkBook } from '../core/collection'
import { writtenDays } from '../core/landmark'
import { nextStage, stageOf } from '../core/stage'
import type { Entry } from '../core/types'
import { dateLabel } from './format'

/**
 * 머리줄 단계 이름표를 누르면 여는 마을 수첩. 지금 단계, 건물 도감, 명소를 한 창에 모았다.
 * 모두 기록에서 계산한다. 칸을 누르면 아래에 그 칸 이야기가 보인다
 */
export function createBook() {
  const back = document.createElement('div')
  back.className = 'sheet-back'
  back.hidden = true
  back.innerHTML = `<div class="sheet book" data-testid="book" role="dialog" aria-modal="true" aria-label="마을 수첩"></div>`
  const sheet = back.querySelector<HTMLElement>('.sheet')!
  const close = () => (back.hidden = true)
  back.addEventListener('click', (e) => {
    if (e.target === back) close()
  })

  function show(entries: Entry[]) {
    const days = writtenDays(entries)
    const stage = stageOf(entries)
    const next = nextStage(entries)
    const items = collectionOf(entries)
    const found = items.filter((c) => c.found).length
    const marks = landmarkBook(entries)
    sheet.innerHTML = `
      <div class="edit-title">📖 마을 수첩</div>
      <div class="book-stage" data-testid="book-stage">
        <span class="book-stage-icon" aria-hidden="true">${stage.icon}</span>
        <div><b></b><p></p></div>
      </div>
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
      <div class="sheet-buttons">
        <button type="button" class="sheet-btn close" data-testid="book-close">닫기</button>
      </div>`
    sheet.querySelector('.book-stage b')!.textContent = `${stage.name} · 한 줄을 ${days}일 남겼어요`
    sheet.querySelector('.book-stage p')!.textContent = next ? `${next.left}일 더 쓰면 ${next.stage.icon} ${next.stage.name}` : '가장 큰 마을이 되었어요'
    sheet.querySelector('.close')!.addEventListener('click', close)

    const detail = sheet.querySelector<HTMLElement>('[data-testid="book-detail"]')!
    sheet.querySelectorAll<HTMLButtonElement>('[data-testid="book-buildings"] .book-cell').forEach((cell, i) => {
      const c = items[i]
      cell.addEventListener('click', () => {
        select(cell)
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
  }

  function select(cell: HTMLElement) {
    cell.parentElement!.querySelectorAll('.book-cell').forEach((c) => c.classList.toggle('on', c === cell))
  }

  return {
    root: back,
    open(entries: Entry[]) {
      show(entries)
      back.hidden = false
    },
  }
}
