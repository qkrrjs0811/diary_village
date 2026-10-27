import { calendarMonth, calendarRange, shiftMonth } from '../core/calendar'
import { monthKey } from '../core/date'
import { moodOf } from '../core/mood'
import { searchEntries } from '../core/search'
import { buildingInfo } from '../core/building'
import { monthRecap, yearRecap } from '../core/recap'
import type { Entry } from '../core/types'
import { dateLabel, recapLine, softMood as soft } from './format'

const WEEK = ['일', '월', '화', '수', '목', '금', '토']

/** "10월 27일" */
const monthDay = (date: string) => dateLabel(date).replace(/ \S+요일$/, '')

/**
 * 마을 수첩에서 여는 기분 색 달력. 쓴 날은 그날 기분 색으로 칠하고, 누르면 그 집으로 가서 글을 연다.
 * 넘겨 볼 수 있는 달은 처음 집을 지은 달부터 이번 달까지다.
 * "한 해"로 바꾸면 열두 달 칸을 그달 가장 많이 고른 기분 색으로 칠해 보이고, 달을 누르면 그달 달력으로 간다.
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
      <div class="cal-modes" role="group" aria-label="달력 보기">
        <button type="button" class="cal-mode" data-testid="calendar-mode-month" data-mode="month">한 달</button>
        <button type="button" class="cal-mode" data-testid="calendar-mode-year" data-mode="year">한 해</button>
      </div>
      <div class="cal-body"></div>
      <div class="sheet-buttons">
        <button type="button" class="sheet-btn close" data-testid="calendar-close">닫기</button>
      </div>
    </div>`
  const sheet = back.querySelector<HTMLElement>('.cal-body')!
  const input = back.querySelector<HTMLInputElement>('[data-testid="calendar-search"]')!
  const clear = back.querySelector<HTMLButtonElement>('.cal-clear')!
  const modes = back.querySelector<HTMLElement>('.cal-modes')!
  const close = () => (back.hidden = true)
  back.addEventListener('click', (e) => {
    if (e.target === back) close()
  })
  back.querySelector('.close')!.addEventListener('click', close)
  input.addEventListener('input', () => render())
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur()
  })
  modes.querySelectorAll<HTMLButtonElement>('.cal-mode').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.mode === 'year') {
        if (mode !== 'year') year = Number(month.slice(0, 4))
        mode = 'year'
      } else if (mode !== 'month') {
        mode = 'month'
        // 보던 해에서 넘겨 볼 수 있는 가장 늦은 달
        const { first, last } = calendarRange(entries, erased, today)
        const end = `${year}-12`
        month = end > last ? last : end < first ? first : end
      }
      render()
    }),
  )
  clear.addEventListener('click', () => {
    input.value = ''
    render()
  })

  let entries: Entry[] = []
  let erased: string[] = []
  let today = ''
  let month = ''
  let year = 0
  let mode: 'month' | 'year' = 'month'

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
      ${m.written ? `<div class="cal-recap" data-testid="calendar-recap">${recapLine(monthRecap(entries, month))}</div>` : ''}
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
        const day = monthDay(date)
        detail.textContent =
          cell.dataset.state === 'erased' ? `🌱 ${day} · 지운 날이에요. 집을 지었던 날로 세어요` : date === today ? '✏️ 오늘 자리가 비어 있어요' : `🌿 ${day} · 쉬어 간 날이에요`
      })
    })
  }

  /** 한 해 보기: 열두 달 칸과 그해 쓴 날 수·가장 많이 지은 건물·처음 만난 건물 */
  function showYear() {
    const { first, last } = calendarRange(entries, erased, today)
    const r = yearRecap(entries, year)
    const top = r.top ? buildingInfo(r.top.id) : null
    const found = r.firstFound.map((id) => buildingInfo(id))
    const now = monthKey(today)
    sheet.innerHTML = `
      <div class="cal-head">
        <button type="button" class="cal-move" data-testid="calendar-prev" aria-label="지난해" ${year <= Number(first.slice(0, 4)) ? 'disabled' : ''}>‹</button>
        <div class="cal-title"><b data-testid="calendar-title">${r.label}</b><span data-testid="calendar-count">${r.written ? `한 줄 ${r.written}일` : '아직 쓴 날이 없어요'}</span></div>
        <button type="button" class="cal-move" data-testid="calendar-next" aria-label="다음 해" ${year >= Number(last.slice(0, 4)) ? 'disabled' : ''}>›</button>
      </div>
      <div class="cal-months" data-testid="calendar-months">
        ${r.months
          .map((m) => {
            const off = m.month < first || m.month > last
            const style = m.mood ? ` style="background:${soft(m.mood)}"` : ''
            const mark = m.mood ? moodOf(m.mood).emoji : off ? '' : '🌿'
            return `<button type="button" class="cal-month${m.mood ? ' written' : ''}${m.month === now ? ' today' : ''}" data-testid="calm-${m.month}"${m.mood ? ` data-mood="${m.mood}"` : ''}${style} ${off ? 'disabled' : ''}>
              <span class="cal-num">${m.label}</span><span class="cal-mark" aria-hidden="true">${mark}</span><span class="cal-days">${m.written ? `${m.written}일` : ''}</span>
            </button>`
          })
          .join('')}
      </div>
      ${
        r.written
          ? `<div class="cal-year" data-testid="calendar-year-recap">
        <div data-testid="calendar-year-top">${top ? `가장 많이 지은 건물 · ${top.icon} ${top.name} ${r.top!.count}채` : '🏡 아담한 보통 집들로 채운 해예요'}</div>
        ${found.length ? `<div data-testid="calendar-year-found">처음 만난 건물 · ${found.map((b) => `<span class="cal-chip">${b.icon} ${b.name}</span>`).join('')}</div>` : ''}
        ${r.firstDate ? `<div data-testid="calendar-year-first">그해 첫 한 줄 · ${monthDay(r.firstDate)}</div>` : ''}
      </div>`
          : ''
      }
      <div class="book-detail" data-testid="calendar-detail" role="status">${r.written ? '달을 누르면 그달 달력을 열어요' : '한 줄을 쓰면 그달이 기분 색으로 물들어요'}</div>`
    sheet.querySelector('[data-testid="calendar-prev"]')!.addEventListener('click', () => goYear(-1))
    sheet.querySelector('[data-testid="calendar-next"]')!.addEventListener('click', () => goYear(1))
    sheet.querySelectorAll<HTMLButtonElement>('.cal-month').forEach((cell) =>
      cell.addEventListener('click', () => {
        month = cell.dataset.testid!.slice(5)
        mode = 'month'
        render()
      }),
    )
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

  /** 찾을 말이 있으면 찾은 한 줄, 없으면 한 달 또는 한 해 달력 */
  function render() {
    clear.hidden = !input.value
    const finding = !!input.value.trim()
    modes.hidden = finding
    modes.querySelectorAll<HTMLButtonElement>('.cal-mode').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)))
    if (finding) find(input.value)
    else if (mode === 'year') showYear()
    else show()
  }

  function goYear(n: number) {
    year += n
    showYear()
  }

  function go(n: number) {
    month = shiftMonth(month, n)
    show()
  }

  return {
    root: back,
    /** 처음 열면 찾기 칸을 비우고 이번 달을 보인다. at에 달("2026-10")을 주면 그달, 해("2026")를 주면 그해 한 해 보기 */
    open(list: Entry[], erasedDates: string[], now: string, at?: string) {
      entries = list
      erased = erasedDates
      today = now
      mode = at?.length === 4 ? 'year' : 'month'
      month = at && mode === 'month' ? at : monthKey(now)
      year = mode === 'year' ? Number(at) : Number(month.slice(0, 4))
      input.value = ''
      render()
      back.hidden = false
    },
  }
}
