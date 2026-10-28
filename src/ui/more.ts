import { checkMore, MAX_MORE } from '../core/entries'

/** 이만큼 넘게 쓰면 긴 글 글자 수를 살며시 보여 준다 */
const SHOW_LEN = MAX_MORE - 200

export interface MoreField {
  /** "＋ 더 쓰기" 단추. 쓰는 칸의 안내 줄에 둔다 */
  toggle: HTMLButtonElement
  /** 펼치면 보이는 긴 글 칸 */
  field: HTMLElement
  /** keepInitial 이고 처음 글에서 바뀌지 않았으면 undefined(고칠 때 건네지 않으면 긴 글이 그대로다) */
  value(): string | undefined
  /** 한도 안이면 true */
  ok(): boolean
}

/**
 * "더 쓰기" 긴 글 칸. 한 줄은 그대로 집이 되고, 긴 글은 읽기 위한 것이다. 쓴 글이 있으면 펼친 채로 시작한다.
 * prefix 는 data-testid 앞머리(write → write-more, write-more-toggle). onChange 는 글이 바뀔 때마다 불린다.
 * keepInitial: 고치기에서 손대지 않은 예전 긴 글은 한도를 넘어도 그대로 둔다(쓴 글은 사라지지 않는다)
 */
export function createMoreField(prefix: string, initial: string, onChange: (value: string) => void, keepInitial = false): MoreField {
  let opened = initial.length > 0
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'more-toggle'
  toggle.dataset.testid = `${prefix}-more-toggle`

  const field = document.createElement('div')
  field.className = 'more-field'
  field.innerHTML = `
    <textarea class="more-input" data-testid="${prefix}-more" rows="4" aria-label="더 쓰기"
      placeholder="더 남기고 싶은 이야기를 이어 써요. 집은 위의 한 줄로 지어요"></textarea>
    <div class="more-hint"><span class="msg" data-testid="${prefix}-more-msg"></span><span class="len" data-testid="${prefix}-more-len"></span></div>`
  const area = field.querySelector<HTMLTextAreaElement>('.more-input')!
  const hint = field.querySelector<HTMLElement>('.more-hint')!
  const msg = field.querySelector<HTMLElement>('.msg')!
  const len = field.querySelector<HTMLElement>('.len')!
  area.value = initial

  const same = () => keepInitial && area.value === initial
  const ok = () => same() || checkMore(area.value).ok
  const sync = () => {
    field.hidden = !opened
    toggle.setAttribute('aria-expanded', String(opened))
    toggle.textContent = opened ? '접어 두기' : area.value.trim() ? '📝 더 쓴 글' : '＋ 더 쓰기'
    const n = [...area.value.trim()].length
    const over = !ok()
    len.textContent = n > SHOW_LEN ? `${n} / ${MAX_MORE}` : ''
    len.classList.toggle('err', over)
    msg.textContent = over ? `조금만 줄여 주세요 · ${MAX_MORE}자까지 담겨요` : ''
    msg.classList.toggle('err', over)
    hint.hidden = !msg.textContent && !len.textContent
  }
  toggle.addEventListener('click', () => {
    opened = !opened
    sync()
    if (opened) area.focus()
  })
  area.addEventListener('input', () => {
    sync()
    onChange(area.value)
  })
  sync()

  return { toggle, field, value: () => (same() ? undefined : area.value), ok }
}
