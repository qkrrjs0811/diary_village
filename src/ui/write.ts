import { checkText, MAX_TEXT } from '../core/entries'
import { MOODS, moodOf } from '../core/mood'
import type { Entry, MoodId } from '../core/types'
import { dateLabel } from './format'

export interface WriteCard {
  root: HTMLElement
  /** 오늘 쓴 글이 있으면 보여 주고, 없으면 쓰는 칸을 보여 준다 */
  render(today: string, entry: Entry | undefined): void
}

export function createWriteCard(handlers: {
  /** 실패하면 사용자에게 보일 이유를 돌려준다 */
  onSubmit(text: string, mood: MoodId): string | null
  onOpen(entry: Entry): void
}): WriteCard {
  const root = document.createElement('section')
  root.className = 'card'
  root.dataset.testid = 'write-card'
  let mood: MoodId | null = null
  let draft = ''

  function renderForm(today: string) {
    root.innerHTML = `
      <div class="card-head"><b>오늘의 한 줄</b><span data-testid="today-date">${dateLabel(today)}</span></div>
      <div class="moods" role="group" aria-label="오늘 기분">
        ${MOODS.map((m) => `<button type="button" class="mood" data-mood="${m.id}" data-testid="mood-${m.id}" aria-pressed="${m.id === mood}"><span class="e">${m.emoji}</span><span class="l">${m.label}</span></button>`).join('')}
      </div>
      <div class="line-row">
        <input class="line-input" data-testid="write-input" type="text" enterkeyhint="done" autocomplete="off" placeholder="오늘을 한 줄로 남겨요" />
        <button type="button" class="build" data-testid="write-submit">집 짓기</button>
      </div>
      <div class="hint"><span class="msg" data-testid="write-msg"></span><span class="len" data-testid="write-len"></span></div>`
    const input = root.querySelector<HTMLInputElement>('.line-input')!
    const submit = root.querySelector<HTMLButtonElement>('.build')!
    const msg = root.querySelector<HTMLElement>('.msg')!
    const len = root.querySelector<HTMLElement>('.len')!
    input.value = draft

    const update = () => {
      draft = input.value
      const n = [...draft.replace(/\s+/g, ' ').trim()].length
      len.textContent = `${n} / ${MAX_TEXT}`
      len.classList.toggle('err', n > MAX_TEXT)
      const checked = checkText(draft)
      submit.disabled = !checked.ok || mood == null
      msg.classList.remove('err')
      if (mood == null) msg.textContent = '오늘 기분을 골라 주세요'
      else if (!checked.ok && checked.reason === 'long') msg.textContent = '조금만 짧게 써 주세요'
      else msg.textContent = ''
    }
    root.querySelectorAll<HTMLButtonElement>('.mood').forEach((b) =>
      b.addEventListener('click', () => {
        mood = b.dataset.mood as MoodId
        root.querySelectorAll('.mood').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
        update()
      }),
    )
    input.addEventListener('input', update)
    const send = () => {
      if (submit.disabled || mood == null) return
      const err = handlers.onSubmit(draft, mood)
      if (err) {
        msg.textContent = err
        msg.classList.add('err')
        return
      }
      draft = ''
      mood = null
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

  return {
    root,
    render(today, entry) {
      if (entry) renderDone(today, entry)
      else renderForm(today)
    },
  }
}
