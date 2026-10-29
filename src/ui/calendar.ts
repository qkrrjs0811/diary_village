import { calendarMonth, calendarRange, shiftMonth } from '../core/calendar'
import { monthKey } from '../core/date'
import { moodOf } from '../core/mood'
import { searchEntries, type SearchPart } from '../core/search'
import { treasuredDays } from '../core/treasure'
import { buildingInfo, hasFinal, type BuildingId } from '../core/building'
import { daysOfBuilding } from '../core/collection'
import { monthRecap, yearRecap } from '../core/recap'
import { TITLE_MAX } from '../core/title'
import { monthChapter } from '../core/chapter'
import { monthSong, type Note } from '../core/sound'
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
 * "소중한 날"로 바꾸면 사용자가 표시한 날만 날짜 순으로 모아 보이고, 누르면 그 집으로 간다
 * 마을 수첩 도감에서 건물을 골라 열면 그 건물이 선 날만 날짜 순으로 같은 쪽지 목록에 모아 보인다
 * 한 달 보기의 "📖 이 달 이어 읽기"는 그달 한 줄들을 같은 쪽지로 한 장에 잇고, 아래에서 이웃한 달로 넘긴다
 * 한 해 보기에서는 그해 첫 달부터 이어 읽고, "📅 달력으로"를 누르면 들어온 달력으로 돌아간다
 */
export function createCalendar(handlers: {
  onOpen: (entry: Entry) => void
  /** 사용자가 붙인 달 이름(달 → 이름) */
  titles?: () => Record<string, string>
  /** 달 이름을 붙이거나 고친다(비우면 걷기). 실패하면 이유. 저장을 못 읽은 때는 null(이름 단추가 없다) */
  onTitle?: ((month: string, input: string) => string | null) | null
  /** 사진이 붙은 날(최근 날부터). 사진 보관함을 못 열면 null(사진 갈래가 없다) */
  photos?: () => { entry: Entry; photo: string }[] | null
  /** 이 달의 노래를 울린다(돌려준 함수로 멈춘다). on: 소리를 켜 두었는지, calm: 움직임 줄이기 */
  song?: { play: (notes: Note[]) => () => void; on: () => boolean; calm: () => boolean }
}) {
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
        <button type="button" class="cal-mode" data-testid="calendar-mode-treasure" data-mode="treasure">💛 소중한 날</button>
        <button type="button" class="cal-mode" data-testid="calendar-mode-photo" data-mode="photo" hidden>📷 사진</button>
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
  const close = () => {
    stopSong()
    back.hidden = true
  }
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
      const gathered = mode === 'treasure' || mode === 'building' || mode === 'photo' || mode === 'chapter'
      if (b.dataset.mode === 'treasure' || b.dataset.mode === 'photo') {
        if (mode === 'month' || mode === 'year') before = mode
        mode = b.dataset.mode as 'treasure' | 'photo'
      } else if (b.dataset.mode === 'year') {
        if (mode === 'month' || (gathered && before === 'month')) year = Number(month.slice(0, 4))
        mode = 'year'
      } else if (gathered && (before === 'month' || mode === 'chapter')) {
        // 이어 읽던 달이면 그달 달력으로
        mode = 'month'
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
  let mode: 'month' | 'year' | 'treasure' | 'building' | 'photo' | 'chapter' = 'month'
  /** 건물 모아 보기에서 보이는 건물 */
  let kind: BuildingId | null = null
  /** 소중한 날·건물 모아 보기를 열기 전에 보던 달력. 돌아오면 보던 달·해 그대로 */
  let before: 'month' | 'year' = 'month'
  /** 달 머리에서 이름 칸을 펼쳐 둔 달 */
  let naming = ''
  /** 울리는 이 달의 노래를 멈추는 함수(울리지 않으면 null) */
  let singing: (() => void) | null = null

  /** 이 달의 노래를 멈추고 단추·빛·안내를 처음대로 돌린다 */
  function stopSong() {
    const stop = singing
    singing = null
    stop?.()
  }

  /**
   * 이 달의 노래. 가락을 울리며 울리는 날의 쪽지를 차례로 살짝 빛낸다(소리를 꺼 두었으면 빛만).
   * 움직임 줄이기면 빛 없이 안내 한 줄만 둔다. 다시 누르거나 달을 넘기거나 창을 닫으면 멈춘다
   */
  function singChapter(days: { date: string; mood: Entry['mood'] }[]) {
    const btn = sheet.querySelector<HTMLButtonElement>('[data-testid="chapter-song"]')!
    const line = sheet.querySelector<HTMLElement>('[data-testid="chapter-song-line"]')!
    const notes = monthSong(days)
    const calm = handlers.song?.calm() ?? false
    const on = handlers.song?.on() ?? false
    const timers: number[] = []
    let lit: HTMLElement | null = null
    const unlight = () => {
      lit?.classList.remove('sing')
      lit = null
    }
    const silence = handlers.song?.play(notes) ?? (() => {})
    btn.textContent = '⏹ 노래 멈추기'
    btn.setAttribute('aria-pressed', 'true')
    line.textContent = calm ? (on ? '🎵 이 달의 노래가 흐르고 있어요' : '🔇 소리를 꺼 두었어요 · 설정에서 켤 수 있어요') : on ? '' : '🔇 소리를 꺼 두어서 빛으로만 따라가요'
    line.hidden = !line.textContent
    if (!calm) {
      for (const n of notes) {
        if (!n.date) continue
        const date = n.date
        timers.push(
          window.setTimeout(() => {
            unlight()
            lit = sheet.querySelector<HTMLElement>(`[data-testid="hit-${date}"]`)
            lit?.classList.add('sing')
            lit?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          }, (n.at + 0.05) * 1000),
        )
      }
    }
    const last = notes[notes.length - 1]
    timers.push(window.setTimeout(stopSong, (last.at + last.dur + 0.1) * 1000))
    singing = () => {
      silence()
      for (const t of timers) window.clearTimeout(t)
      unlight()
      btn.textContent = '🎵 이 달의 노래'
      btn.setAttribute('aria-pressed', 'false')
      line.hidden = true
    }
  }

  const titleOf = (m: string) => handlers.titles?.()[m] ?? ''

  function show() {
    const { first, last } = calendarRange(entries, erased, today)
    const m = calendarMonth(entries, erased, month, today)
    sheet.innerHTML = `
      <div class="cal-head">
        <button type="button" class="cal-move" data-testid="calendar-prev" aria-label="지난달" ${month <= first ? 'disabled' : ''}>‹</button>
        <div class="cal-title"><b data-testid="calendar-title">${m.title}</b><span data-testid="calendar-count">${m.written ? `한 줄 ${m.written}일` : '아직 쓴 날이 없어요'}</span></div>
        <button type="button" class="cal-move" data-testid="calendar-next" aria-label="다음 달" ${month >= last ? 'disabled' : ''}>›</button>
      </div>
      <div class="cal-name" data-testid="calendar-name"></div>
      <div class="cal-band" data-testid="calendar-band" aria-hidden="true">
        ${m.moods.map((x) => `<span style="flex:${x.count};background:${soft(x.mood, 0.8)}"></span>`).join('')}
      </div>
      ${m.written ? `<div class="cal-recap" data-testid="calendar-recap">${recapLine(monthRecap(entries, month))}</div>` : ''}
      ${m.written ? '<div class="cal-read"><button type="button" class="cal-read-btn" data-testid="calendar-chapter">📖 이 달 이어 읽기</button></div>' : ''}
      <div class="cal-grid cal-week" aria-hidden="true">${WEEK.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cal-grid" data-testid="calendar-days">
        ${m.weeks
          .flat()
          .map((c) => {
            if (!c) return '<span class="cal-blank"></span>'
            const style = c.mood ? ` style="background:${soft(c.mood)}"` : ''
            const mark = c.mood ? moodOf(c.mood).emoji : c.state === 'erased' ? '🌱' : ''
            const treasured = c.state === 'written' && entries.some((e) => e.date === c.date && e.treasured === true)
            return `<button type="button" class="cal-day ${c.state}${c.today ? ' today' : ''}" data-testid="cal-${c.date}" data-state="${c.state}"${c.mood ? ` data-mood="${c.mood}"` : ''}${treasured ? ' data-treasured="true"' : ''}${style} ${c.state === 'future' ? 'disabled' : ''}>
              <span class="cal-num">${c.day}</span><span class="cal-mark" aria-hidden="true">${mark}</span>${treasured ? '<span class="cal-heart" aria-label="소중한 날">💛</span>' : ''}
            </button>`
          })
          .join('')}
      </div>
      <div class="book-detail" data-testid="calendar-detail" role="status">${m.written ? '칠한 날을 누르면 그날 한 줄을 열어요' : '한 줄을 쓰면 그날이 기분 색으로 물들어요'}</div>`
    sheet.querySelector('[data-testid="calendar-prev"]')!.addEventListener('click', () => go(-1))
    sheet.querySelector('[data-testid="calendar-next"]')!.addEventListener('click', () => go(1))
    showName(sheet.querySelector<HTMLElement>('[data-testid="calendar-name"]')!)
    sheet.querySelector('[data-testid="calendar-chapter"]')?.addEventListener('click', () => {
      before = 'month'
      mode = 'chapter'
      render()
    })
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

  /**
   * 달 머리 아래 달 이름. 붙인 이름은 「이사한 달」 ✏️, 없으면 "✏️ 이 달에 이름 붙이기". 누르면 그 자리에서 이름 칸이 펼쳐진다.
   * 이름은 textContent로만 넣는다
   */
  function showName(box: HTMLElement) {
    const title = titleOf(month)
    box.replaceChildren()
    if (naming !== month) {
      if (!handlers.onTitle) {
        box.hidden = !title
        box.textContent = title ? `「${title}」` : ''
        return
      }
      const b = document.createElement('button')
      b.type = 'button'
      b.className = `cal-name-btn${title ? ' named' : ''}`
      b.dataset.testid = 'calendar-name-open'
      b.textContent = title ? `「${title}」 ✏️` : '✏️ 이 달에 이름 붙이기'
      b.setAttribute('aria-label', title ? `달 이름 ${title} 고치기` : '이 달에 이름 붙이기')
      b.addEventListener('click', () => {
        naming = month
        showName(box)
        box.querySelector<HTMLInputElement>('input')?.focus()
      })
      box.appendChild(b)
      return
    }
    box.innerHTML = `
      <div class="name-row">
        <input class="line-input" data-testid="calendar-name-input" type="text" maxlength="${TITLE_MAX + 10}" enterkeyhint="done" autocomplete="off" placeholder="예: 이사한 달" aria-label="이 달의 이름" />
        <button type="button" class="build" data-testid="calendar-name-save">붙이기</button>
      </div>
      <div class="cal-name-msg" data-testid="calendar-name-msg" role="status">${TITLE_MAX}자까지, 비우면 "${Number(month.slice(5, 7))}월"로 돌아가요</div>`
    const input = box.querySelector<HTMLInputElement>('input')!
    const msg = box.querySelector<HTMLElement>('.cal-name-msg')!
    input.value = title
    const help = msg.textContent
    input.addEventListener('input', () => {
      msg.textContent = help
      msg.classList.remove('err')
    })
    const keep = () => {
      const err = handlers.onTitle?.(month, input.value) ?? null
      if (err) {
        msg.textContent = err
        msg.classList.add('err')
        return
      }
      naming = ''
      showName(box)
    }
    box.querySelector('[data-testid="calendar-name-save"]')!.addEventListener('click', keep)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) keep()
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
            const named = titleOf(m.month) ? ' named' : ''
            return `<button type="button" class="cal-month${m.mood ? ' written' : ''}${m.month === now ? ' today' : ''}${named}" data-testid="calm-${m.month}"${m.mood ? ` data-mood="${m.mood}"` : ''}${style} ${off ? 'disabled' : ''}>
              <span class="cal-num">${m.label}</span>${named ? '<span class="cal-mtitle" data-testid="calm-name"></span>' : ''}<span class="cal-mark" aria-hidden="true">${mark}</span><span class="cal-days">${m.written ? `${m.written}일` : ''}</span>
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
      ${r.firstDate ? `<div class="cal-read"><button type="button" class="cal-read-btn" data-testid="calendar-year-chapter">📖 ${year}년 첫 달부터 이어 읽기</button></div>` : ''}
      <div class="book-detail" data-testid="calendar-detail" role="status">${r.written ? '달을 누르면 그달 달력을 열어요' : '한 줄을 쓰면 그달이 기분 색으로 물들어요'}</div>`
    sheet.querySelector('[data-testid="calendar-prev"]')!.addEventListener('click', () => goYear(-1))
    sheet.querySelector('[data-testid="calendar-next"]')!.addEventListener('click', () => goYear(1))
    // 달 이름은 사용자가 쓴 글이라 textContent로만 넣는다(칸이 좁으면 말줄임, 다 읽을 땐 그달 달력에서)
    sheet.querySelectorAll<HTMLElement>('.cal-mtitle').forEach((name) => {
      name.textContent = titleOf(name.closest<HTMLElement>('.cal-month')!.dataset.testid!.slice(5))
    })
    // 그해 쓴 날이 있는 첫 달부터 읽고, 아래 "다음 달 ›"로 이어 간다
    sheet.querySelector('[data-testid="calendar-year-chapter"]')?.addEventListener('click', () => {
      before = 'year'
      month = monthKey(r.firstDate!)
      mode = 'chapter'
      render()
    })
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
    for (const { entry, parts, more } of hits) list.appendChild(note(entry, parts, more))
  }

  /** 소중한 날 모아 보기. 표시한 날만 날짜 순으로, 찾은 한 줄과 같은 쪽지로 놓는다 */
  function showTreasured() {
    const days = treasuredDays({ version: 1, entries })
    sheet.innerHTML = `
      <div class="cal-found" data-testid="treasure-count" role="status">${days.length ? `💛 소중한 날 ${days.length}일` : '아직 소중한 날이 없어요<br>다시 읽고 싶은 날, 그 집을 열어 🤍를 눌러 보세요'}</div>
      <div class="cal-hits" data-testid="treasure-list"></div>`
    const list = sheet.querySelector('.cal-hits')!
    for (const entry of days) list.appendChild(note(entry, [{ text: entry.text, hit: false }]))
  }

  /** 사진 모아 보기. 사진이 붙은 날을 작은 폴라로이드로 최근 날부터 놓고, 누르면 그 집으로 간다 */
  function showPhotos() {
    const days = handlers.photos?.() ?? []
    sheet.innerHTML = `
      <div class="cal-found" data-testid="photo-count" role="status">${days.length ? `📷 사진 붙인 날 ${days.length}일` : '아직 사진을 붙인 날이 없어요<br>한 줄을 쓸 때 📷 사진을 눌러 보세요'}</div>
      <div class="cal-photos" data-testid="photo-list"></div>`
    const list = sheet.querySelector('.cal-photos')!
    for (const { entry, photo } of days) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'cal-photo'
      b.dataset.testid = `photo-hit-${entry.date}`
      b.setAttribute('aria-label', `${monthDay(entry.date)} 사진 일기 열기`)
      b.innerHTML = '<img alt="" /><span class="cal-photo-date"></span><span class="cal-photo-text"></span>'
      b.querySelector('img')!.src = photo
      b.querySelector('.cal-photo-date')!.textContent = `${moodOf(entry.mood).emoji} ${monthDay(entry.date)}`
      // 글은 textContent로만 넣는다
      b.querySelector('.cal-photo-text')!.textContent = entry.text
      b.addEventListener('click', () => {
        close()
        handlers.onOpen(entry)
      })
      list.appendChild(b)
    }
  }

  /** 건물 모아 보기. 그 건물이 선 날(남은 글)만 날짜 순으로 소중한 날과 같은 쪽지로 놓는다 */
  function showBuilding(id: BuildingId) {
    const b = buildingInfo(id)
    const days = daysOfBuilding(entries, id)
    const ga = hasFinal(b.name) ? '이' : '가'
    sheet.innerHTML = `
      <div class="cal-found" data-testid="building-count" role="status"></div>
      <div class="cal-hits" data-testid="building-list"></div>`
    sheet.querySelector('.cal-found')!.textContent = days.length ? `${b.icon} ${b.name}${ga} 선 날 ${days.length}일` : `아직 ${b.name}${ga} 선 날이 없어요`
    const list = sheet.querySelector('.cal-hits')!
    for (const entry of days) list.appendChild(note(entry, [{ text: entry.text, hit: false }]))
  }

  /**
   * 한 달 이어 읽기. 그달 한 줄들을 날짜 순으로 같은 쪽지에 잇고, 날짜 옆에 건물 아이콘·📝(긴 글)·💛(소중한 날)을 붙인다.
   * 아래 "‹ 9월 · 11월 ›"로 쓴 날이 있는 이웃한 달로 넘긴다. 장 제목(달 이름)과 글은 textContent로만 넣는다
   */
  function showChapter() {
    stopSong()
    const c = monthChapter({ version: 1, entries, monthTitles: handlers.titles?.() }, month)
    const label = (m: string) => `${Number(m.slice(5, 7))}월`
    const singable = c.written > 0 && !!handlers.song
    sheet.innerHTML = `
      <div class="cal-chapter-head" data-testid="chapter-head"><b data-testid="chapter-title"></b><span data-testid="chapter-count">${c.written ? `${month.slice(0, 4)}년 · 한 줄 ${c.written}일` : '아직 쓴 날이 없어요'}</span>${
        singable
          ? '<button type="button" class="cal-read-btn cal-song" data-testid="chapter-song" aria-pressed="false">🎵 이 달의 노래</button><span class="cal-song-line" data-testid="chapter-song-line" role="status" hidden></span>'
          : ''
      }</div>
      <div class="cal-hits" data-testid="chapter-list"></div>
      <div class="cal-chapter-nav">
        <button type="button" class="cal-chapter-move" data-testid="chapter-prev" ${c.prev ? `aria-label="지난달 ${label(c.prev)} 이어 읽기"` : 'hidden'}>‹ ${c.prev ? label(c.prev) : ''}</button>
        <button type="button" class="cal-chapter-move cal-chapter-back" data-testid="chapter-calendar">📅 달력으로</button>
        <button type="button" class="cal-chapter-move" data-testid="chapter-next" ${c.next ? `aria-label="다음 달 ${label(c.next)} 이어 읽기"` : 'hidden'}>${c.next ? label(c.next) : ''} ›</button>
      </div>`
    sheet.querySelector('[data-testid="chapter-title"]')!.textContent = c.heading
    const list = sheet.querySelector('.cal-hits')!
    for (const d of c.days) {
      const hit = note(entries.find((e) => e.date === d.date)!, [{ text: d.text, hit: false }])
      hit.querySelector('.cal-hit-date')!.textContent = `${dateLabel(d.date)} · ${d.icon}${d.more ? ' 📝' : ''}${d.treasured ? ' 💛' : ''}`
      list.appendChild(hit)
    }
    sheet.querySelector('[data-testid="chapter-song"]')?.addEventListener('click', () => (singing ? stopSong() : singChapter(c.days)))
    const move = (to: string | null) => {
      if (!to) return
      month = to
      showChapter()
      // 넘긴 달은 장 제목부터 읽는다
      back.querySelector<HTMLElement>('.sheet')!.scrollTop = 0
    }
    sheet.querySelector('[data-testid="chapter-prev"]')!.addEventListener('click', () => move(c.prev))
    sheet.querySelector('[data-testid="chapter-next"]')!.addEventListener('click', () => move(c.next))
    // 들어온 달력으로 돌아간다(한 달 보기면 읽던 달, 한 해 보기면 읽던 달의 해)
    sheet.querySelector('[data-testid="chapter-calendar"]')!.addEventListener('click', () => {
      if (before === 'year') year = Number(month.slice(0, 4))
      mode = before
      render()
      back.querySelector<HTMLElement>('.sheet')!.scrollTop = 0
    })
  }

  /** 한 줄 쪽지 단추. 글은 textContent로만 넣고, 누르면 창을 닫고 그 집으로 간다 */
  function note(entry: Entry, parts: SearchPart[], more?: SearchPart[]) {
    const hit = document.createElement('button')
    hit.type = 'button'
    hit.className = 'cal-hit'
    hit.dataset.testid = `hit-${entry.date}`
    hit.style.background = soft(entry.mood, 0.3)
    hit.innerHTML = `<span class="cal-hit-mood" aria-hidden="true">${moodOf(entry.mood).emoji}</span><span class="cal-hit-main"><span class="cal-hit-date"></span><span class="cal-hit-text"></span></span>`
    hit.querySelector('.cal-hit-date')!.textContent = `${entry.date.slice(0, 4)}년 ${dateLabel(entry.date)}`
    const fill = (box: Element, list: SearchPart[]) => {
      for (const p of list) {
        const span = document.createElement(p.hit ? 'mark' : 'span')
        span.textContent = p.text
        box.appendChild(span)
      }
    }
    fill(hit.querySelector('.cal-hit-text')!, parts)
    // 긴 글에서 찾았으면 한 줄 아래에 찾은 말 둘레 조각을 작게 덧붙인다
    if (more) {
      const piece = document.createElement('span')
      piece.className = 'cal-hit-more'
      piece.dataset.testid = `hit-more-${entry.date}`
      piece.textContent = '📝 '
      fill(piece, more)
      hit.querySelector('.cal-hit-main')!.appendChild(piece)
    }
    hit.addEventListener('click', () => {
      close()
      handlers.onOpen(entry)
    })
    return hit
  }

  /** 찾을 말이 있으면 찾은 한 줄, 없으면 한 달 또는 한 해 달력 */
  function render() {
    stopSong()
    clear.hidden = !input.value
    const finding = !!input.value.trim()
    modes.hidden = finding
    // 사진 보관함을 열 수 있을 때만 사진 갈래가 있다
    const canPhoto = !!handlers.photos?.()
    modes.querySelector<HTMLElement>('[data-mode="photo"]')!.hidden = !canPhoto
    if (mode === 'photo' && !canPhoto) mode = before
    modes.querySelectorAll<HTMLButtonElement>('.cal-mode').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)))
    if (finding) find(input.value)
    else if (mode === 'treasure') showTreasured()
    else if (mode === 'photo') showPhotos()
    else if (mode === 'building' && kind) showBuilding(kind)
    else if (mode === 'chapter') showChapter()
    else if (mode === 'year') showYear()
    else show()
  }

  function goYear(n: number) {
    year += n
    showYear()
  }

  function go(n: number) {
    month = shiftMonth(month, n)
    naming = ''
    show()
  }

  return {
    root: back,
    /**
     * 처음 열면 찾기 칸을 비우고 이번 달을 보인다. at에 달("2026-10")을 주면 그달, 해("2026")를 주면 그해 한 해 보기.
     * name: 그달 이름 칸을 펼친 채 연다(돌아보기 쪽지의 "✏️ 이 달에 이름 붙이기")
     */
    open(list: Entry[], erasedDates: string[], now: string, at?: string, name = false) {
      entries = list
      erased = erasedDates
      today = now
      mode = at?.length === 4 ? 'year' : 'month'
      before = mode
      month = at && mode === 'month' ? at : monthKey(now)
      year = mode === 'year' ? Number(at) : Number(month.slice(0, 4))
      naming = name && mode === 'month' && handlers.onTitle ? month : ''
      input.value = ''
      render()
      back.hidden = false
      if (naming) sheet.querySelector<HTMLInputElement>('[data-testid="calendar-name-input"]')?.focus()
    },
    /** 그 말로 찾은 채 연다(읽기 창의 메아리 꼬리표). 찾기 칸을 비우면 이번 달 달력이다 */
    openSearch(list: Entry[], erasedDates: string[], now: string, word: string) {
      this.open(list, erasedDates, now)
      input.value = word
      render()
    },
    /** 그 건물이 선 날 모아 보기로 연다. 한 달·한 해를 누르면 이번 달·올해 달력으로 간다 */
    openBuilding(list: Entry[], erasedDates: string[], now: string, id: BuildingId) {
      this.open(list, erasedDates, now)
      kind = id
      mode = 'building'
      render()
    },
  }
}
