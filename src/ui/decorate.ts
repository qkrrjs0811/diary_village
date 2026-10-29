import type { Decor, DecorId } from '../core/decor'

type Kind = Decor['kind']

/** 바구니 두 갈래 */
const KINDS: { kind: Kind; label: string; empty: string }[] = [
  { kind: 'decor', label: '🌷 소품', empty: '아직 열린 소품이 없어요' },
  { kind: 'facility', label: '🛝 시설', empty: '아직 열린 시설이 없어요' },
]

/**
 * 꾸미기 모드에서 "오늘의 한 줄" 카드 자리에 들어오는 소품 바구니.
 * "소품 · 시설" 두 갈래로 나눠 한 갈래만 보인다(고른 갈래는 저장하지 않는다).
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
  let kind: Kind = 'decor'
  let followed: DecorId | null = null
  let last: Parameters<typeof draw> | null = null

  /**
   * decors: 열린 소품. pick: 바구니에서 고른 소품. moving: 마을에 놓인 소품을 골랐는지.
   * next: 갈래마다 다음에 열릴 것(빈 갈래에 "N일 더 쓰면 …"으로 보인다)
   */
  function draw(decors: Decor[], pick: DecorId | null, moving: boolean, msg: string, next: Partial<Record<Kind, { decor: Decor; left: number }>> = {}) {
    last = [decors, pick, moving, msg, next]
    // 새로 고른 것이 있으면 그 갈래를 연다("놓으러 가기"). 고른 채 다른 갈래를 넘겨 보는 것은 막지 않는다
    const picked = decors.find((d) => d.id === pick)
    if (picked && pick !== followed) kind = picked.kind
    followed = pick
    const shown = decors.filter((d) => d.kind === kind)
    const ahead = next[kind]
    // 다시 그려도 옆으로 넘겨 보던 바구니 자리를 지킨다(갈래를 바꾸면 처음부터)
    const picks = root.querySelector<HTMLElement>('.decor-picks')
    const scrolled = picks?.dataset.kind === kind ? picks.scrollLeft : 0
    root.innerHTML = `
      <div class="card-head"><b>🎨 마을 꾸미기</b></div>
      <div class="decor-kinds" role="tablist" aria-label="바구니">
        ${KINDS.map(
          (k) => `<button type="button" class="book-tab decor-kind" role="tab" data-testid="decorate-kind-${k.kind}" aria-selected="${k.kind === kind}">
            <b>${k.label}</b><span>${decors.filter((d) => d.kind === k.kind).length}개</span>
          </button>`,
        ).join('')}
      </div>
      <div class="decor-picks" role="group" aria-label="놓을 것" data-kind="${kind}">
        ${shown
          .map(
            (d) => `<button type="button" class="decor-pick" data-testid="decorate-pick-${d.id}" aria-pressed="${d.id === pick}">
              <span class="e" aria-hidden="true">${d.icon}</span><span class="l">${d.name}</span>
            </button>`,
          )
          .join('')}
        ${shown.length ? '' : `<p class="decor-empty" data-testid="decorate-empty"></p>`}
      </div>
      <div class="decorate-msg" data-testid="decorate-msg" role="status"></div>
      <div class="sheet-buttons">
        <button type="button" class="sheet-btn erase" data-testid="decorate-remove"${moving ? '' : ' hidden'}>치우기</button>
        <button type="button" class="sheet-btn build" data-testid="decorate-done">다 했어요</button>
      </div>`
    root.querySelector('.decor-picks')!.scrollLeft = scrolled
    root.querySelector('.decorate-msg')!.textContent = msg
    const empty = root.querySelector('.decor-empty')
    if (empty) {
      const words = KINDS.find((k) => k.kind === kind)!.empty
      empty.textContent = ahead ? `${words} · ${ahead.left}일 더 쓰면 ${ahead.decor.icon} ${ahead.decor.name}` : words
    }
    root.querySelectorAll<HTMLButtonElement>('.decor-kind').forEach((b, i) =>
      b.addEventListener('click', () => {
        if (KINDS[i].kind === kind) return
        kind = KINDS[i].kind
        draw(...last!)
      }),
    )
    root.querySelectorAll<HTMLButtonElement>('.decor-pick').forEach((b, i) =>
      b.addEventListener('click', () => handlers.onPick(shown[i].id === pick ? null : shown[i].id)),
    )
    root.querySelector('[data-testid="decorate-remove"]')!.addEventListener('click', () => handlers.onRemove())
    root.querySelector('[data-testid="decorate-done"]')!.addEventListener('click', () => handlers.onDone())
  }

  return {
    root,
    render: draw,
    /** 꾸미기를 새로 열 때 소품 갈래부터 */
    reset() {
      kind = 'decor'
      followed = null
    },
  }
}
