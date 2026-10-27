import type { Landmark } from '../core/landmark'
import type { MilestoneCard } from '../core/stage'

/** 명소가 생기거나 마을 단계가 오른 순간 띄우는 축하 카드. 명소가 생겼으면 "보러 가기"로 광장의 그 명소로 간다 */
export function createCelebration(handlers: { onVisit(landmark: Landmark): void }) {
  const back = document.createElement('div')
  back.className = 'sheet-back celebrate-back'
  back.hidden = true
  back.innerHTML = `<div class="sheet celebrate" data-testid="celebrate" role="dialog" aria-modal="true" aria-label="축하해요"></div>`
  const sheet = back.querySelector<HTMLElement>('.sheet')!
  const close = () => (back.hidden = true)
  back.addEventListener('click', (e) => {
    if (e.target === back) close()
  })

  return {
    root: back,
    open(text: MilestoneCard) {
      const visit = text.visit
      // 단계만 올랐으면 보러 갈 곳이 없으니 버튼 하나만 둔다
      const buttons = visit
        ? `<button type="button" class="sheet-btn" data-testid="celebrate-close">닫기</button>
          <button type="button" class="sheet-btn build" data-testid="celebrate-visit">보러 가기</button>`
        : `<button type="button" class="sheet-btn build" data-testid="celebrate-close">좋아요</button>`
      sheet.innerHTML = `
        <div class="celebrate-icons${text.icons.length > 3 ? ' many' : ''}" aria-hidden="true">${text.icons.map((i) => `<span>${i}</span>`).join('')}</div>
        <div class="celebrate-title" data-testid="celebrate-title"></div>
        <p class="celebrate-body" data-testid="celebrate-body"></p>
        <p class="celebrate-next" data-testid="celebrate-next"></p>
        <div class="sheet-buttons">
          ${buttons}
        </div>`
      sheet.querySelector('.celebrate-title')!.textContent = text.title
      sheet.querySelector('.celebrate-body')!.textContent = text.body
      const next = sheet.querySelector<HTMLElement>('.celebrate-next')!
      next.textContent = text.next ?? '명소를 모두 모았어요. 고마워요!'
      sheet.querySelector('[data-testid="celebrate-close"]')!.addEventListener('click', close)
      sheet.querySelector('[data-testid="celebrate-visit"]')?.addEventListener('click', () => {
        close()
        if (visit) handlers.onVisit(visit)
      })
      back.hidden = false
    },
    close,
  }
}
