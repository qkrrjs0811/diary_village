import type { Decor, DecorId } from '../core/decor'

/**
 * 꾸미기 모드에서 "오늘의 한 줄" 카드 자리에 들어오는 소품 바구니.
 * 열린 소품을 골라 마을의 빈 자리(점선)를 누르면 놓이고, 놓은 소품은 눌러 고른 뒤 옮기거나 치운다
 */
export function createDecorTray(handlers: {
  /** 바구니에서 소품을 고른다(같은 것을 다시 누르면 null) */
  onPick(id: DecorId | null): void
  /** 고른(놓아 둔) 소품을 치운다 */
  onRemove(): void
  onDone(): void
}) {
  const root = document.createElement('section')
  root.className = 'card decorate'
  root.dataset.testid = 'decorate'
  root.hidden = true

  return {
    root,
    /** decors: 열린 소품. pick: 바구니에서 고른 소품. moving: 마을에 놓인 소품을 골랐는지 */
    render(decors: Decor[], pick: DecorId | null, moving: boolean, msg: string) {
      // 다시 그려도 옆으로 넘겨 보던 바구니 자리를 지킨다
      const scrolled = root.querySelector('.decor-picks')?.scrollLeft ?? 0
      root.innerHTML = `
        <div class="card-head"><b>🎨 마을 꾸미기</b><span>열린 소품 ${decors.length}개</span></div>
        <div class="decor-picks" role="group" aria-label="놓을 소품">
          ${decors
            .map(
              (d) => `<button type="button" class="decor-pick" data-testid="decorate-pick-${d.id}" aria-pressed="${d.id === pick}">
                <span class="e" aria-hidden="true">${d.icon}</span><span class="l">${d.name}</span>
              </button>`,
            )
            .join('')}
        </div>
        <div class="decorate-msg" data-testid="decorate-msg" role="status"></div>
        <div class="sheet-buttons">
          <button type="button" class="sheet-btn erase" data-testid="decorate-remove"${moving ? '' : ' hidden'}>치우기</button>
          <button type="button" class="sheet-btn build" data-testid="decorate-done">다 했어요</button>
        </div>`
      root.querySelector('.decor-picks')!.scrollLeft = scrolled
      root.querySelector('.decorate-msg')!.textContent = msg
      root.querySelectorAll<HTMLButtonElement>('.decor-pick').forEach((b, i) =>
        b.addEventListener('click', () => handlers.onPick(decors[i].id === pick ? null : decors[i].id)),
      )
      root.querySelector('[data-testid="decorate-remove"]')!.addEventListener('click', () => handlers.onRemove())
      root.querySelector('[data-testid="decorate-done"]')!.addEventListener('click', () => handlers.onDone())
    },
  }
}
