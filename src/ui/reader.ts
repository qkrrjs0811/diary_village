import { moodOf } from '../core/mood'
import type { Entry } from '../core/types'
import { fullDateLabel } from './format'

/** 집을 누르면 그날 쓴 글을 보여 주는 아래쪽 창 */
export function createReader() {
  const back = document.createElement('div')
  back.className = 'sheet-back'
  back.hidden = true
  back.innerHTML = `
    <div class="sheet" data-testid="reader" role="dialog" aria-modal="true">
      <div class="reader-date" data-testid="reader-date"></div>
      <div class="reader-mood" data-testid="reader-mood"></div>
      <p class="reader-text" data-testid="reader-text"></p>
      <button type="button" class="close" data-testid="reader-close">닫기</button>
    </div>`
  const close = () => (back.hidden = true)
  back.addEventListener('click', (e) => {
    if (e.target === back) close()
  })
  back.querySelector('.close')!.addEventListener('click', close)
  return {
    root: back,
    open(entry: Entry) {
      const m = moodOf(entry.mood)
      back.querySelector('.reader-date')!.textContent = fullDateLabel(entry.date)
      back.querySelector('.reader-mood')!.textContent = `${m.emoji} ${m.label} · ${m.weather}`
      back.querySelector('.reader-text')!.textContent = entry.text
      back.hidden = false
    },
  }
}
