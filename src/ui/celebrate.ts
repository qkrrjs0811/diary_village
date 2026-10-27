import type { Landmark } from '../core/landmark'

/** 명소가 생긴 순간 띄우는 축하 카드. "보러 가기"를 누르면 광장의 그 명소로 간다 */
export function createCelebration(handlers: { onVisit(landmark: Landmark): void }) {
  const back = document.createElement('div')
  back.className = 'sheet-back celebrate-back'
  back.hidden = true
  back.innerHTML = `<div class="sheet celebrate" data-testid="celebrate" role="dialog" aria-modal="true" aria-label="명소가 생겼어요"></div>`
  const sheet = back.querySelector<HTMLElement>('.sheet')!
  const close = () => (back.hidden = true)
  back.addEventListener('click', (e) => {
    if (e.target === back) close()
  })

  return {
    root: back,
    open(reached: Landmark[], text: { title: string; body: string; next: string | null }) {
      sheet.innerHTML = `
        <div class="celebrate-icons${reached.length > 3 ? ' many' : ''}" aria-hidden="true">${reached.map((l) => `<span>${l.icon}</span>`).join('')}</div>
        <div class="celebrate-title" data-testid="celebrate-title"></div>
        <p class="celebrate-body" data-testid="celebrate-body"></p>
        <p class="celebrate-next" data-testid="celebrate-next"></p>
        <div class="sheet-buttons">
          <button type="button" class="sheet-btn" data-testid="celebrate-close">닫기</button>
          <button type="button" class="sheet-btn build" data-testid="celebrate-visit">보러 가기</button>
        </div>`
      sheet.querySelector('.celebrate-title')!.textContent = text.title
      sheet.querySelector('.celebrate-body')!.textContent = text.body
      const next = sheet.querySelector<HTMLElement>('.celebrate-next')!
      next.textContent = text.next ?? '명소를 모두 모았어요. 고마워요!'
      sheet.querySelector('[data-testid="celebrate-close"]')!.addEventListener('click', close)
      sheet.querySelector('[data-testid="celebrate-visit"]')!.addEventListener('click', () => {
        close()
        handlers.onVisit(reached[reached.length - 1])
      })
      back.hidden = false
    },
    close,
  }
}
