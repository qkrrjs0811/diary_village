import { checkText, MAX_TEXT, type Day } from '../core/entries'
import { MOODS, moodOf } from '../core/mood'
import type { Memory } from '../core/memory'
import type { Entry, MoodId } from '../core/types'
import { dateLabel } from './format'

export interface WriteCard {
  root: HTMLElement
  /**
   * 오늘 쓴 글이 있으면 보여 주고, 없으면 쓰는 칸을 보여 준다. yesterday: 아직 쓰지 않은 어제 날짜(없으면 null).
   * memory: 한 달 전·100일 전·작년 오늘의 글(없으면 null). 카드 아래에 작게 보인다
   */
  render(today: string, entry: Entry | undefined, yesterday: string | null, memory?: Memory | null): void
}

const WORD: Record<Day, string> = { today: '오늘', yesterday: '어제' }

export function createWriteCard(handlers: {
  /** 실패하면 사용자에게 보일 이유를 돌려준다 */
  onSubmit(text: string, mood: MoodId, day: Day): string | null
  onOpen(entry: Entry): void
  /** "N일 전 오늘"을 누르면 그 집으로 간다 */
  onMemory(entry: Entry): void
}): WriteCard {
  const root = document.createElement('section')
  root.className = 'card'
  root.dataset.testid = 'write-card'
  /** 어제 칸에 쓰는 중이면 'yesterday'. 오늘과 어제의 쓰던 글·기분은 따로 둔다 */
  let day: Day = 'today'
  const mood: Record<Day, MoodId | null> = { today: null, yesterday: null }
  const draft: Record<Day, string> = { today: '', yesterday: '' }
  let shown: { today: string; entry: Entry | undefined; yesterday: string | null; memory: Memory | null } = {
    today: '',
    entry: undefined,
    yesterday: null,
    memory: null,
  }

  function renderForm(date: string, d: Day) {
    root.innerHTML = `
      <div class="card-head"><b>${WORD[d]}의 한 줄</b><span data-testid="today-date">${dateLabel(date)}</span></div>
      <div class="moods" role="group" aria-label="${WORD[d]} 기분">
        ${MOODS.map((m) => `<button type="button" class="mood" data-mood="${m.id}" data-testid="mood-${m.id}" aria-pressed="${m.id === mood[d]}"><span class="e">${m.emoji}</span><span class="l">${m.label}</span></button>`).join('')}
      </div>
      <div class="line-row">
        <input class="line-input" data-testid="write-input" type="text" enterkeyhint="done" autocomplete="off" placeholder="${WORD[d]}을 한 줄로 남겨요" />
        <button type="button" class="build" data-testid="write-submit">집 짓기</button>
      </div>
      <div class="hint"><span class="msg" data-testid="write-msg"></span><span class="len" data-testid="write-len"></span></div>`
    const input = root.querySelector<HTMLInputElement>('.line-input')!
    const submit = root.querySelector<HTMLButtonElement>('.build')!
    const msg = root.querySelector<HTMLElement>('.msg')!
    const len = root.querySelector<HTMLElement>('.len')!
    input.value = draft[d]

    const update = () => {
      draft[d] = input.value
      const n = [...draft[d].replace(/\s+/g, ' ').trim()].length
      len.textContent = `${n} / ${MAX_TEXT}`
      len.classList.toggle('err', n > MAX_TEXT)
      const checked = checkText(draft[d])
      submit.disabled = !checked.ok || mood[d] == null
      msg.classList.remove('err')
      if (mood[d] == null) msg.textContent = `${WORD[d]} 기분을 골라 주세요`
      else if (!checked.ok && checked.reason === 'long') msg.textContent = '조금만 짧게 써 주세요'
      else msg.textContent = ''
    }
    root.querySelectorAll<HTMLButtonElement>('.mood').forEach((b) =>
      b.addEventListener('click', () => {
        mood[d] = b.dataset.mood as MoodId
        root.querySelectorAll('.mood').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
        update()
      }),
    )
    input.addEventListener('input', update)
    const send = () => {
      const m = mood[d]
      if (submit.disabled || m == null) return
      const err = handlers.onSubmit(draft[d], m, d)
      if (err) {
        msg.textContent = err
        msg.classList.add('err')
        return
      }
      draft[d] = ''
      mood[d] = null
    }
    submit.addEventListener('click', send)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) send()
    })
    update()
  }

  function renderDone(today: string, entry: Entry) {
    root.innerHTML = `
      <div class="card-head"><b>오늘의 한 줄</b><span data-testid="today-date">${dateLabel(today)}</span></div>
      <button type="button" class="today-line" data-testid="today-line"><span class="e">${moodOf(entry.mood).emoji}</span><span class="t"></span></button>
      <div class="done-note">오늘 집을 지었어요 · 내일 또 한 채 지어요</div>`
    root.querySelector('.today-line .t')!.textContent = entry.text
    root.querySelector('.today-line')!.addEventListener('click', () => handlers.onOpen(entry))
  }

  /** 어제를 안 썼으면 카드 아래에 작게 어제 칸으로 가는(또는 오늘로 돌아오는) 버튼을 둔다 */
  function renderSwitch(yesterday: string) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'other-day'
    if (day === 'yesterday') {
      b.dataset.testid = 'back-today'
      b.textContent = shown.entry ? '오늘의 한 줄 보기' : '오늘의 한 줄로 돌아가기'
    } else {
      b.dataset.testid = 'write-yesterday'
      const [, m, dd] = yesterday.split('-').map(Number)
      b.textContent = `🌙 어제(${m}월 ${dd}일)도 남길까요?`
    }
    b.addEventListener('click', () => {
      day = day === 'yesterday' ? 'today' : 'yesterday'
      draw()
    })
    root.appendChild(b)
  }

  /** "📖 한 달 전 오늘 · 9월 28일" + 그날 글. 누르면 그 집으로 날아간다 */
  function renderMemory(m: Memory) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'memory'
    b.dataset.testid = 'memory'
    b.dataset.kind = m.kind
    const [, mm, dd] = m.entry.date.split('-').map(Number)
    b.innerHTML = `<span class="k">📖 ${m.label} · ${mm}월 ${dd}일</span><span class="t"></span>`
    b.querySelector('.t')!.textContent = `${moodOf(m.entry.mood).emoji} ${m.entry.text}`
    b.addEventListener('click', () => handlers.onMemory(m.entry))
    root.appendChild(b)
  }

  function draw() {
    const { today, entry, yesterday, memory } = shown
    if (!yesterday) day = 'today'
    if (day === 'yesterday' && yesterday) renderForm(yesterday, 'yesterday')
    else if (entry) renderDone(today, entry)
    else renderForm(today, 'today')
    // 어제 칸에 쓰는 중에는 그 한 줄에 마음을 두도록 지난 글을 숨긴다
    if (memory && day === 'today') renderMemory(memory)
    if (yesterday) renderSwitch(yesterday)
  }

  return {
    root,
    render(today, entry, yesterday, memory = null) {
      shown = { today, entry, yesterday, memory }
      draw()
    },
  }
}
