import { checkMore, checkText, MAX_TEXT, type Day } from '../core/entries'
import { MOODS, moodOf } from '../core/mood'
import type { Memory } from '../core/memory'
import type { MonthRecap, YearRecap } from '../core/recap'
import type { Entry, MoodId } from '../core/types'
import { dateLabel, recapLine, softMood } from './format'
import { createMoreField } from './more'
import { createPhotoField } from './photo'

export interface WriteCard {
  root: HTMLElement
  /**
   * 오늘 쓴 글이 있으면 보여 주고, 없으면 쓰는 칸을 보여 준다. yesterday: 아직 쓰지 않은 어제 날짜(없으면 null).
   * memory: 한 달 전·100일 전·작년 오늘의 글(없으면 null). 카드 아래에 작게 보인다.
   * recap: 새 달 첫 주의 지난달 돌아보기, 새해 첫 주에는 지난해 돌아보기(없으면 null). 있으면 memory 대신 보인다.
   * prompts: 오늘·어제 쓰기 칸 빈 글자 자리에 띄울 오늘의 물음(없으면 "오늘을 한 줄로 남겨요")
   */
  render(today: string, entry: Entry | undefined, yesterday: string | null, memory?: Memory | null, recap?: Recap | null, prompts?: Prompts | null): void
}

export type Prompts = Record<Day, string>
export type Recap = MonthRecap | YearRecap

const WORD: Record<Day, string> = { today: '오늘', yesterday: '어제' }

export function createWriteCard(handlers: {
  /** 실패하면 사용자에게 보일 이유를 돌려준다. more 는 "더 쓰기" 긴 글(쓰지 않았으면 빈 글), photo 는 붙인 사진(없으면 null) */
  onSubmit(text: string, mood: MoodId, day: Day, more: string, photo: string | null): string | null
  onOpen(entry: Entry): void
  /** 사진 보관함을 쓸 수 있으면 true. 아니면 "📷 사진"을 두지 않는다 */
  canPhoto?: () => boolean
  /** "N일 전 오늘"을 누르면 그 집으로 간다 */
  onMemory(entry: Entry): void
  /** 지난달 돌아보기를 누르면 그달 달력을, 지난해 돌아보기를 누르면 그해 한 해 보기를 연다("2026-10" 또는 "2026") */
  onRecap(at: string, name?: boolean): void
  /** 그달에 붙인 이름(없으면 빈 글) */
  monthTitle?(month: string): string
  /** 지난달 돌아보기에 "✏️ 이 달에 이름 붙이기"를 둘지(저장을 못 읽은 때는 두지 않는다) */
  canName?: boolean
}): WriteCard {
  const root = document.createElement('section')
  root.className = 'card'
  root.dataset.testid = 'write-card'
  /** 어제 칸에 쓰는 중이면 'yesterday'. 오늘과 어제의 쓰던 글·기분은 따로 둔다 */
  let day: Day = 'today'
  const mood: Record<Day, MoodId | null> = { today: null, yesterday: null }
  const draft: Record<Day, string> = { today: '', yesterday: '' }
  /** "더 쓰기" 긴 글도 오늘·어제 따로 둔다 */
  const draftMore: Record<Day, string> = { today: '', yesterday: '' }
  /** 붙인 사진도 오늘·어제 따로 둔다 */
  const draftPhoto: Record<Day, string | null> = { today: null, yesterday: null }
  let shown: {
    today: string
    entry: Entry | undefined
    yesterday: string | null
    memory: Memory | null
    recap: Recap | null
    prompts: Prompts | null
  } = {
    today: '',
    entry: undefined,
    yesterday: null,
    memory: null,
    recap: null,
    prompts: null,
  }

  function renderForm(date: string, d: Day) {
    root.innerHTML = `
      <div class="card-head"><b>${WORD[d]}의 한 줄</b><span data-testid="today-date">${dateLabel(date)}</span></div>
      <div class="moods" role="group" aria-label="${WORD[d]} 기분">
        ${MOODS.map((m) => `<button type="button" class="mood" data-mood="${m.id}" data-testid="mood-${m.id}" aria-pressed="${m.id === mood[d]}"><span class="e">${m.emoji}</span><span class="l">${m.label}</span></button>`).join('')}
      </div>
      <div class="line-row">
        <input class="line-input" data-testid="write-input" type="text" enterkeyhint="done" autocomplete="off" aria-label="${WORD[d]}의 한 줄" />
        <button type="button" class="build" data-testid="write-submit">집 짓기</button>
      </div>
      <div class="hint"><span class="msg" data-testid="write-msg"></span><span class="len" data-testid="write-len"></span></div>`
    const input = root.querySelector<HTMLInputElement>('.line-input')!
    const submit = root.querySelector<HTMLButtonElement>('.build')!
    const msg = root.querySelector<HTMLElement>('.msg')!
    const len = root.querySelector<HTMLElement>('.len')!
    // 물음은 빈 글자 자리에만 띄운다(쓴 글에는 들어가지 않는다)
    // 사진을 붙였으면 짧은 한마디만 붙여도 된다고 다정하게 알려 준다
    const placeholder = () =>
      (input.placeholder = draftPhoto[d] ? '사진에 한마디만 붙여도 돼요' : (shown.prompts?.[d] ?? `${WORD[d]}을 한 줄로 남겨요`))
    placeholder()
    input.value = draft[d]
    // "＋ 더 쓰기"는 홈 단추를 늘리지 않게 안내 줄 안에 두고, 긴 글 칸은 한 줄 아래에 펼친다
    const more = createMoreField('write', draftMore[d], (v) => {
      draftMore[d] = v
      update()
    })
    root.querySelector('.line-row')!.after(more.field)
    len.after(more.toggle)
    // "📷 사진"도 안내 줄 안에 둔다. 사진은 한 줄을 꾸미고, 집은 여전히 한 줄로 짓는다
    if (handlers.canPhoto?.()) {
      const photo = createPhotoField('write', draftPhoto[d], (v) => {
        draftPhoto[d] = v
        placeholder()
      })
      root.querySelector('.line-row')!.after(photo.field)
      more.toggle.after(photo.toggle)
    }

    const update = () => {
      draft[d] = input.value
      const n = [...draft[d].replace(/\s+/g, ' ').trim()].length
      len.textContent = `${n} / ${MAX_TEXT}`
      len.classList.toggle('err', n > MAX_TEXT)
      const checked = checkText(draft[d])
      submit.disabled = !checked.ok || mood[d] == null || !checkMore(draftMore[d]).ok
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
      const err = handlers.onSubmit(draft[d], m, d, draftMore[d], draftPhoto[d])
      if (err) {
        msg.textContent = err
        msg.classList.add('err')
        return
      }
      draft[d] = ''
      draftMore[d] = ''
      draftPhoto[d] = null
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

  /** "🗓️ 9월 돌아보기 · 한 줄 20일" + 기분 색 띠 + 가장 많이 지은 건물. 누르면 그달 달력(지난해면 한 해 보기) */
  function renderRecap(r: Recap) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'memory recap'
    b.dataset.testid = 'recap'
    const at = 'year' in r ? String(r.year) : r.month
    b.dataset.at = at
    // 지난해는 열두 달을 한 칸씩 칠하고, 쉬어 간 달은 띠 바탕색으로 둔다
    const band = ('year' in r ? r.months.map((m) => ({ mood: m.mood, count: 1 })) : r.moods)
      .map((x) => `<span style="flex:${x.count};background:${x.mood ? softMood(x.mood, 0.8) : 'transparent'}"></span>`)
      .join('')
    b.innerHTML = `<span class="k">🗓️ ${r.label} 돌아보기 · 한 줄 ${r.written}일</span>
      <span class="recap-band" data-testid="recap-band" aria-hidden="true">${band}</span>
      <span class="t">${recapLine(r)}</span>`
    root.appendChild(b)
    b.addEventListener('click', () => handlers.onRecap(at))
    if ('year' in r) return
    // 지난달에 붙인 이름은 쪽지 머리에 함께, 아직 없으면 쪽지 아래에 작게 "✏️ 이 달에 이름 붙이기"(누르면 이름 칸을 펼친 달력)
    const title = handlers.monthTitle?.(r.month) ?? ''
    if (title) {
      const k = b.querySelector('.k')!
      k.textContent = `🗓️ ${r.label} 「${title}」 돌아보기 · 한 줄 ${r.written}일`
      b.dataset.title = title
    } else if (handlers.canName) {
      // 쪽지 머리줄 오른쪽에 겹쳐 둔다(카드 높이가 늘면 마을이 작아진다). 쪽지 안에 단추를 넣을 수 없어 감싼다
      const wrap = document.createElement('div')
      wrap.className = 'recap-wrap'
      root.replaceChild(wrap, b)
      wrap.appendChild(b)
      const name = document.createElement('button')
      name.type = 'button'
      name.className = 'recap-name'
      name.dataset.testid = 'recap-name'
      name.textContent = '✏️ 이 달에 이름 붙이기'
      name.addEventListener('click', () => handlers.onRecap(at, true))
      wrap.appendChild(name)
    }
  }

  function draw() {
    const { today, entry, yesterday, memory, recap } = shown
    if (!yesterday) day = 'today'
    if (day === 'yesterday' && yesterday) renderForm(yesterday, 'yesterday')
    else if (entry) renderDone(today, entry)
    else renderForm(today, 'today')
    // 어제 칸에 쓰는 중에는 그 한 줄에 마음을 두도록 지난 글을 숨긴다
    if (recap && day === 'today') renderRecap(recap)
    else if (memory && day === 'today') renderMemory(memory)
    if (yesterday) renderSwitch(yesterday)
  }

  return {
    root,
    render(today, entry, yesterday, memory = null, recap = null, prompts = null) {
      shown = { today, entry, yesterday, memory, recap, prompts }
      draw()
    },
  }
}
