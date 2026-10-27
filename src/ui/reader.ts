import { buildingInfo, buildingOf } from '../core/building'
import { dayKey } from '../core/date'
import { checkText, MAX_TEXT } from '../core/entries'
import { MOODS, moodOf } from '../core/mood'
import type { Entry, MoodId } from '../core/types'
import { dateLabel, fullDateLabel } from './format'

/** 집을 누르면 그날 쓴 글을 보여 주는 아래쪽 창. onEdit 이 있으면 "고치기"로 글과 기분을 바꾼다 */
export function createReader(handlers: {
  /** 저장 못 하는 상태면 null. 실패하면 사용자에게 보일 이유를, 성공하면 고친 기록을 돌려준다 */
  onEdit: ((date: string, text: string, mood: MoodId) => { error: string } | { entry: Entry }) | null
  /** 저장 못 하는 상태면 null. 실패하면 사용자에게 보일 이유를, 성공하면 null 을 돌려준다 */
  onErase: ((date: string) => string | null) | null
  /** 창이 닫힐 때 */
  onClose?: () => void
  /** 바로 앞·뒤 쓴 날의 글(없으면 null) */
  neighbors?: (date: string) => { prev: Entry | null; next: Entry | null }
  /** 앞뒤 날로 넘겨 다른 글을 보일 때(마을 보기를 그 집으로 옮긴다) */
  onTurn?: (entry: Entry) => void
}) {
  const back = document.createElement('div')
  back.className = 'sheet-back'
  back.hidden = true
  back.innerHTML = `<div class="sheet" data-testid="reader" role="dialog" aria-modal="true"></div>`
  const sheet = back.querySelector<HTMLElement>('.sheet')!
  const close = () => {
    back.hidden = true
    handlers.onClose?.()
  }
  back.addEventListener('click', (e) => {
    if (e.target === back) close()
  })

  function showRead(entry: Entry) {
    const m = moodOf(entry.mood)
    sheet.innerHTML = `
      <div class="reader-date" data-testid="reader-date"></div>
      <div class="reader-mood" data-testid="reader-mood"></div>
      <div class="reader-building" data-testid="reader-building" hidden></div>
      <p class="reader-text" data-testid="reader-text"></p>
      <div class="reader-edited" data-testid="reader-edited" hidden></div>
      ${handlers.neighbors ? `<div class="reader-turn">
        <button type="button" class="turn-btn" data-testid="reader-prev">◀ 앞 날</button>
        <button type="button" class="turn-btn" data-testid="reader-next">뒷 날 ▶</button>
      </div>` : ''}
      <div class="sheet-buttons">
        ${handlers.onEdit ? '<button type="button" class="sheet-btn" data-testid="reader-edit">✏️ 고치기</button>' : ''}
        ${handlers.onErase ? '<button type="button" class="sheet-btn" data-testid="reader-erase">🗑️ 지우기</button>' : ''}
        <button type="button" class="sheet-btn close" data-testid="reader-close">닫기</button>
      </div>`
    sheet.querySelector('.reader-date')!.textContent = fullDateLabel(entry.date)
    sheet.querySelector('.reader-mood')!.textContent = `${m.emoji} ${m.label} · ${m.weather}`
    sheet.querySelector('.reader-text')!.textContent = entry.text
    const found = buildingOf(entry)
    if (found) {
      const b = buildingInfo(found.id)
      const line = sheet.querySelector<HTMLElement>('.reader-building')!
      line.textContent = `${b.icon} ${b.name} · '${found.word}'에서 생겼어요`
      line.hidden = false
    }
    if (entry.editedAt != null) {
      const edited = sheet.querySelector<HTMLElement>('.reader-edited')!
      edited.textContent = `✏️ ${dateLabel(dayKey(entry.editedAt)).replace(/ \S+요일$/, '')}에 고쳤어요`
      edited.hidden = false
    }
    if (handlers.neighbors) {
      const near = handlers.neighbors(entry.date)
      const turn = (id: string, to: Entry | null, label: string) => {
        const btn = sheet.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!
        btn.disabled = !to
        if (to) btn.setAttribute('aria-label', `${label} · ${fullDateLabel(to.date)}`)
        btn.addEventListener('click', () => {
          if (!to) return
          showRead(to)
          handlers.onTurn?.(to)
        })
      }
      turn('reader-prev', near.prev, '앞 날')
      turn('reader-next', near.next, '뒷 날')
    }
    sheet.querySelector('.close')!.addEventListener('click', close)
    sheet.querySelector('[data-testid="reader-edit"]')?.addEventListener('click', () => showEdit(entry))
    sheet.querySelector('[data-testid="reader-erase"]')?.addEventListener('click', () => showErase(entry))
  }

  /** 지우기는 확인을 한 번 더 받는다(기획서 8번) */
  function showErase(entry: Entry) {
    sheet.innerHTML = `
      <div class="reader-date" data-testid="reader-date"></div>
      <div class="edit-title">이 날의 한 줄을 지울까요?</div>
      <p class="reader-text erase-text" data-testid="erase-text"></p>
      <p class="erase-note" data-testid="erase-note">지운 글은 되돌릴 수 없어요. 집은 빈 땅으로 돌아가지만, 명소와 마을 단계는 그대로예요.</p>
      <div class="hint"><span class="msg err" data-testid="erase-msg"></span></div>
      <div class="sheet-buttons">
        <button type="button" class="sheet-btn" data-testid="erase-cancel">그만두기</button>
        <button type="button" class="sheet-btn erase" data-testid="erase-confirm">지울게요</button>
      </div>`
    sheet.querySelector('.reader-date')!.textContent = fullDateLabel(entry.date)
    sheet.querySelector('.erase-text')!.textContent = entry.text
    sheet.querySelector('[data-testid="erase-cancel"]')!.addEventListener('click', () => showRead(entry))
    sheet.querySelector('[data-testid="erase-confirm"]')!.addEventListener('click', () => {
      if (!handlers.onErase) return
      const error = handlers.onErase(entry.date)
      if (error) sheet.querySelector('[data-testid="erase-msg"]')!.textContent = error
      else close()
    })
  }

  function showEdit(entry: Entry) {
    let mood: MoodId = entry.mood
    sheet.innerHTML = `
      <div class="reader-date" data-testid="reader-date"></div>
      <div class="edit-title">한 줄 고치기</div>
      <div class="moods" role="group" aria-label="기분">
        ${MOODS.map((m) => `<button type="button" class="mood" data-mood="${m.id}" data-testid="edit-mood-${m.id}" aria-pressed="${m.id === mood}"><span class="e">${m.emoji}</span><span class="l">${m.label}</span></button>`).join('')}
      </div>
      <input class="line-input" data-testid="edit-input" type="text" enterkeyhint="done" autocomplete="off" />
      <div class="hint"><span class="msg" data-testid="edit-msg"></span><span class="len" data-testid="edit-len"></span></div>
      <div class="sheet-buttons">
        <button type="button" class="sheet-btn" data-testid="edit-cancel">그만두기</button>
        <button type="button" class="sheet-btn build" data-testid="edit-save">다 고쳤어요</button>
      </div>`
    sheet.querySelector('.reader-date')!.textContent = fullDateLabel(entry.date)
    const input = sheet.querySelector<HTMLInputElement>('.line-input')!
    const save = sheet.querySelector<HTMLButtonElement>('[data-testid="edit-save"]')!
    const msg = sheet.querySelector<HTMLElement>('.msg')!
    const len = sheet.querySelector<HTMLElement>('.len')!
    input.value = entry.text

    const update = () => {
      const n = [...input.value.replace(/\s+/g, ' ').trim()].length
      len.textContent = `${n} / ${MAX_TEXT}`
      len.classList.toggle('err', n > MAX_TEXT)
      const checked = checkText(input.value)
      save.disabled = !checked.ok
      msg.classList.remove('err')
      msg.textContent = checked.ok ? '' : checked.reason === 'long' ? '조금만 짧게 써 주세요' : '한 줄을 남겨 주세요'
    }
    sheet.querySelectorAll<HTMLButtonElement>('.mood').forEach((b) =>
      b.addEventListener('click', () => {
        mood = b.dataset.mood as MoodId
        sheet.querySelectorAll('.mood').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
      }),
    )
    input.addEventListener('input', update)
    const send = () => {
      if (save.disabled || !handlers.onEdit) return
      const r = handlers.onEdit(entry.date, input.value, mood)
      if ('error' in r) {
        msg.textContent = r.error
        msg.classList.add('err')
        return
      }
      showRead(r.entry)
    }
    save.addEventListener('click', send)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) send()
    })
    sheet.querySelector('[data-testid="edit-cancel"]')!.addEventListener('click', () => showRead(entry))
    update()
  }

  return {
    root: back,
    open(entry: Entry) {
      showRead(entry)
      back.hidden = false
    },
  }
}
