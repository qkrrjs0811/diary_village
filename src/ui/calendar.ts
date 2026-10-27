import { calendarMonth, calendarRange, shiftMonth } from '../core/calendar'
import { monthKey } from '../core/date'
import { moodOf } from '../core/mood'
import { searchEntries } from '../core/search'
import type { Entry, MoodId } from '../core/types'
import { dateLabel } from './format'

const WEEK = ['일', '월', '화', '수', '목', '금', '토']

/** 기분 지붕 색을 흰색과 섞은 옅은 칸 색 */
function soft(mood: MoodId, k = 0.55): string {
  const hex = moodOf(mood).roofs[0]
  const mix = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k + 255 * (1 - k))
  return `rgb(${mix(1)}, ${mix(3)}, ${mix(5)})`
}

/**
 * 마을 수첩에서 여는 기분 색 달력. 쓴 날은 그날 기분 색으로 칠하고, 누르면 그 집으로 가서 글을 연다.
 * 넘겨 볼 수 있는 달은 처음 집을 지은 달부터 이번 달까지다.
 * 위쪽 찾기 칸에 말을 넣으면 달력 대신 그 말이 들어간 지난 글을 보이고, 누르면 그 집으로 간다(폰 안에서만 찾는다)
 */
export function createCalendar(handlers: { onOpen: (entry: Entry) => void }) {
  const back = document.createElement('div')
  back.className = 'sheet-back'
  back.hidden = true
  back.innerHTML = `<div class="sheet book calendar" data-testid="calendar" role="dialog" aria-modal="true" aria-label="기분 달력">
      <div class="edit-title">📅 기분 달력</div>
      <div class="cal-search">
        <input type="search" class="line-input" data-testid="calendar-search" placeholder="🔍 단어로 지난 글 찾기" maxlength="20" enterkeyhint="search" aria-label="단어로 지난 글 찾기" />
        <button type="button" class="cal-clear" data-testid="calendar-search-clear" aria-label="찾기 지우기" hidden>✕</button>
      </div>
      <div class="cal-body"></div>
      <div class="sheet-buttons">
        <button type="button" class="sheet-btn close" data-testid="calendar-close">닫기</button>
      </div>
    </div>`
  const sheet = back.querySelector<HTMLElement>('.cal-body')!
  const input = back.querySelector<HTMLInputElement>('[data-testid="calendar-search"]')!
  const clear = back.querySelector<HTMLButtonElement>('.cal-clear')!
  const close = () => (back.hidden = true)
  back.addEventListener('click', (e) => {
    if (e.target === back) close()
  })
  back.querySelector('.close')!.addEventListener('click', close)
  input.addEventListener('input', () => render())
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur()
  })
  clear.addEventListener('click', () => {
    input.value = ''
    render()
  })

  let entries: Entry[] = []
  let erased: string[] = []
  let today = ''
  let month = ''

  function show() {
    const { first, last } = calendarRange(entries, erased, today)
    const m = calendarMonth(entries, erased, month, today)
    sheet.innerHTML = `
      <div class="cal-head">
        <button type="button" class="cal-move" data-testid="calendar-prev" aria-label="지난달" ${month <= first ? 'disabled' : ''}>‹</button>
        <div class="cal-title"><b data-testid="calendar-title">${m.title}</b><span data-testid="calendar-count">${m.written ? `한 줄 ${m.written}일` : '아직 쓴 날이 없어요'}</span></div>
        <button type="button" class="cal-move" data-testid="calendar-next" aria-label="다음 달" ${month >= last ? 'disabled' : ''}>›</button>
      </div>
      <div class="cal-band" data-testid="calendar-band" aria-hidden="true">
        ${m.moods.map((x) => `<span style="flex:${x.count};background:${soft(x.mood, 0.8)}"></span>`).join('')}
      </div>
      <div class="cal-grid cal-week" aria-hidden="true">${WEEK.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cal-grid" data-testid="calendar-days">
        ${m.weeks
          .flat()
          .map((c) => {
            if (!c) return '<span class="cal-blank"></span>'
            const style = c.mood ? ` style="background:${soft(c.mood)}"` : ''
            const mark = c.mood ? moodOf(c.mood).emoji : c.state === 'erased' ? '🌱' : ''
            return `<button type="button" class="cal-day ${c.state}${c.today ? ' today' : ''}" data-testid="cal-${c.date}" data-state="${c.state}"${c.mood ? ` data-mood="${c.mood}"` : ''}${style} ${c.state === 'future' ? 'disabled' : ''}>
              <span class="cal-num">${c.day}</span><span class="cal-mark" aria-hidden="true">${mark}</span>
            </button>`
          })
          .join('')}
      </div>
      <div class="book-detail" data-testid="calendar-detail" role="status">${m.written ? '칠한 날을 누르면 그날 한 줄을 열어요' : '한 줄을 쓰면 그날이 기분 색으로 물들어요'}</div>`
    sheet.querySelector('[data-testid="calendar-prev"]')!.addEventListener('click', () => go(-1))
    sheet.querySelector('[data-testid="calendar-next"]')!.addEventListener('click', () => go(1))
    const detail = sheet.querySelector<HTMLElement>('[data-testid="calendar-detail"]')!
    sheet.querySelectorAll<HTMLButtonElement>('.cal-day').forEach((cell) => {
      const date = cell.dataset.testid!.slice(4)
      cell.addEventListener('click', () => {
        const entry = entries.find((e) => e.date === date)
        if (entry) {
          close()
          return handlers.onOpen(entry)
        }
        const day = dateLabel(date).replace(/ \S+요일$/, '')
        detail.textContent =
          cell.dataset.state === 'erased' ? `🌱 ${day} · 지운 날이에요. 집을 지었던 날로 세어요` : date === today ? '✏️ 오늘 자리가 비어 있어요' : `🌿 ${day} · 쉬어 간 날이에요`
      })
    })
  }

  /** 찾은 한 줄 목록. 글은 textContent로만 넣는다 */
  function find(query: string) {
    const hits = searchEntries(entries, query)
    sheet.innerHTML = `
      <div class="cal-found" data-testid="search-count" role="status"></div>
      <div class="cal-hits" data-testid="search-hits"></div>`
    const word = query.trim()
    sheet.querySelector('.cal-found')!.textContent = hits.length ? `"${word}" · 한 줄 ${hits.length}개를 찾았어요` : `"${word}"이(가) 들어간 한 줄은 아직 없어요`
    const list = sheet.querySelector('.cal-hits')!
    for (const { entry, parts } of hits) {
      const hit = document.createElement('button')
      hit.type = 'button'
      hit.className = 'cal-hit'
      hit.dataset.testid = `hit-${entry.date}`
      hit.style.background = soft(entry.mood, 0.3)
      hit.innerHTML = `<span class="cal-hit-mood" aria-hidden="true">${moodOf(entry.mood).emoji}</span><span class="cal-hit-main"><span class="cal-hit-date"></span><span class="cal-hit-text"></span></span>`
      hit.querySelector('.cal-hit-date')!.textContent = `${entry.date.slice(0, 4)}년 ${dateLabel(entry.date)}`
      const text = hit.querySelector('.cal-hit-text')!
      for (const p of parts) {
        const span = document.createElement(p.hit ? 'mark' : 'span')
        span.textContent = p.text
        text.appendChild(span)
      }
      hit.addEventListener('click', () => {
        close()
        handlers.onOpen(entry)
      })
      list.appendChild(hit)
    }
  }

  /** 찾을 말이 있으면 찾은 한 줄, 없으면 달력 */
  function render() {
    clear.hidden = !input.value
    if (input.value.trim()) find(input.value)
    else show()
  }

  function go(n: number) {
    month = shiftMonth(month, n)
    show()
  }

  return {
    root: back,
    /** 처음 열면 찾기 칸을 비우고 이번 달을 보인다 */
    open(list: Entry[], erasedDates: string[], now: string) {
      entries = list
      erased = erasedDates
      today = now
      month = monthKey(now)
      input.value = ''
      render()
      back.hidden = false
    },
  }
}
