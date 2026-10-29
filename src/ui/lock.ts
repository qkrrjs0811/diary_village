import { cancelForget, checkPin, forgetLeft, requestForget, type LockSettings } from '../core/lock'

/** 남은 시간을 "N시간 M분"으로(1분 아래는 "1분") */
export function leftLabel(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000))
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? (m ? `${h}시간 ${m}분` : `${h}시간`) : `${m}분`
}

/**
 * 잠금 화면. 마을을 흐리게 덮고 둥근 숫자판과 점 네 개를 보인다.
 * 틀려도 벌은 없다(점이 살짝 흔들릴 뿐). 번호를 잊으면 하루 뒤 잠금만 풀린다 — 글·사진은 그대로다
 */
export function createLockScreen(handlers: {
  /** 지금 잠금 설정 */
  lock: () => LockSettings | null
  /** 잊음 요청을 남기거나 거둔다 */
  keep: (lock: LockSettings) => void
  /** 맞는 번호로 열렸을 때 */
  onOpen: () => void
}) {
  const root = document.createElement('div')
  root.className = 'lock-screen'
  root.dataset.testid = 'lock'
  root.hidden = true
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', '잠금')
  root.innerHTML = `
    <div class="lock-card">
      <div class="lock-title">🔒 우리 마을 열쇠</div>
      <p class="lock-help">네 자리 번호를 눌러 주세요</p>
      <div class="lock-dots" data-testid="lock-dots" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="lock-msg" data-testid="lock-msg" role="status"></div>
      <div class="lock-pad" data-testid="lock-pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" class="lock-key" data-key="${n}" data-testid="lock-key-${n}">${n}</button>`).join('')}
        <span></span>
        <button type="button" class="lock-key" data-key="0" data-testid="lock-key-0">0</button>
        <button type="button" class="lock-key lock-back" data-key="back" data-testid="lock-back" aria-label="하나 지우기">⌫</button>
      </div>
      <div class="lock-links">
        <button type="button" class="lock-link" data-testid="lock-hint-btn">💡 힌트 보기</button>
        <button type="button" class="lock-link" data-testid="lock-forget">번호를 잊었어요</button>
      </div>
      <div class="lock-ask" data-testid="lock-forget-ask" hidden>
        <p>번호가 떠오르지 않으면 하루 뒤에 잠금만 풀어 드릴게요.<br />글과 사진은 하나도 지우지 않아요.</p>
        <div class="lock-ask-row">
          <button type="button" class="lock-link" data-testid="lock-forget-no">다시 생각해 볼게요</button>
          <button type="button" class="build" data-testid="lock-forget-yes">하루 뒤 풀어 주세요</button>
        </div>
      </div>
    </div>`
  const dots = Array.from(root.querySelectorAll<HTMLElement>('.lock-dots i'))
  const dotBox = root.querySelector<HTMLElement>('.lock-dots')!
  const msg = root.querySelector<HTMLElement>('.lock-msg')!
  const hintBtn = root.querySelector<HTMLButtonElement>('[data-testid="lock-hint-btn"]')!
  const forgetBtn = root.querySelector<HTMLButtonElement>('[data-testid="lock-forget"]')!
  const ask = root.querySelector<HTMLElement>('.lock-ask')!
  let pin = ''
  let checking = false

  function paintDots() {
    dots.forEach((d, i) => d.classList.toggle('on', i < pin.length))
  }

  /** 잊음 요청 중이면 남은 시간을 다정하게 알린다 */
  function waitNote(): string {
    const lock = handlers.lock()
    const left = lock ? forgetLeft(lock, Date.now()) : null
    return left === null ? '' : `${leftLabel(left)} 뒤 잠금이 풀려요 · 그사이 번호가 떠오르면 눌러 주세요`
  }

  async function press(key: string) {
    if (checking || root.hidden) return
    if (key === 'back') {
      pin = pin.slice(0, -1)
      paintDots()
      return
    }
    if (pin.length >= 4) return
    pin += key
    paintDots()
    if (pin.length < 4) return
    const lock = handlers.lock()
    checking = true
    const ok = lock ? await checkPin(lock, pin) : true
    checking = false
    if (ok) {
      if (lock && lock.forgotAt !== undefined) handlers.keep(cancelForget(lock))
      hide()
      handlers.onOpen()
      return
    }
    pin = ''
    paintDots()
    msg.textContent = '번호가 달라요 · 천천히 다시 눌러 보세요'
    dotBox.classList.remove('shake')
    void dotBox.offsetWidth
    dotBox.classList.add('shake')
  }

  root.querySelector('.lock-pad')!.addEventListener('click', (e) => {
    const key = (e.target as Element).closest<HTMLElement>('[data-key]')?.dataset.key
    if (key) void press(key)
  })
  dotBox.addEventListener('animationend', () => dotBox.classList.remove('shake'))
  window.addEventListener('keydown', (e) => {
    if (root.hidden) return
    if (/^[0-9]$/.test(e.key)) void press(e.key)
    else if (e.key === 'Backspace') void press('back')
  })
  hintBtn.addEventListener('click', () => {
    const hint = handlers.lock()?.hint ?? ''
    msg.textContent = hint ? `💡 ${hint}` : '적어 둔 힌트가 없어요'
  })
  forgetBtn.addEventListener('click', () => {
    ask.hidden = false
    forgetBtn.hidden = true
  })
  root.querySelector('[data-testid="lock-forget-no"]')!.addEventListener('click', () => {
    ask.hidden = true
    forgetBtn.hidden = false
  })
  root.querySelector('[data-testid="lock-forget-yes"]')!.addEventListener('click', () => {
    const lock = handlers.lock()
    if (lock) handlers.keep(requestForget(lock, Date.now()))
    ask.hidden = true
    forgetBtn.hidden = false
    msg.textContent = waitNote()
  })

  function show() {
    pin = ''
    paintDots()
    ask.hidden = true
    forgetBtn.hidden = false
    hintBtn.hidden = !handlers.lock()?.hint
    msg.textContent = waitNote()
    root.hidden = false
    document.body.classList.add('locked')
    for (const el of Array.from(document.body.children)) if (el !== root) (el as HTMLElement).inert = true
  }

  function hide() {
    root.hidden = true
    document.body.classList.remove('locked')
    for (const el of Array.from(document.body.children)) (el as HTMLElement).inert = false
  }

  return {
    root,
    show,
    hide,
    get locked() {
      return !root.hidden
    },
  }
}
