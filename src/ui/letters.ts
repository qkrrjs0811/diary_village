import { MAX_LETTER, checkLetter, letterAge, opensOnFor, type LetterWait } from '../core/letter'
import type { Letter } from '../core/types'

/** 편지 창이 보여 줄 편지들(지금 저장에서 계산) */
export interface LetterLists {
  /** 오늘(쓰는 날) 날짜 */
  today: string
  /** 열리는 날이 지났는데 아직 안 읽은 편지 */
  arrived: Letter[]
  /** 아직 열리지 않은 편지(내용은 보이지 않는다) */
  waiting: Letter[]
  /** 이미 읽은 편지(다시 읽기) */
  received: Letter[]
  now: number
}

const WAITS: { id: LetterWait; label: string }[] = [
  { id: 'month', label: '한 달 뒤' },
  { id: 'days100', label: '100일 뒤' },
  { id: 'year', label: '1년 뒤' },
]

/** "11월 28일", 올해가 아니면 "2027년 10월 28일" */
export function letterDay(date: string, today: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${y === Number(today.slice(0, 4)) ? '' : `${y}년 `}${m}월 ${d}일`
}

/**
 * 광장 우체통을 누르면 여는 편지 창. 미래의 나에게 편지를 쓰고(열리는 날 고르기),
 * 기다리는 편지는 열리는 날만, 도착한 편지는 열어 읽고, 받은 편지는 다시 읽는다. 지우기는 한 번 더 묻는다
 */
export function createLetterBox(handlers: {
  lists: () => LetterLists
  /** 편지를 부친다. 성공하면 null, 실패하면 이유. 저장을 못 읽는 상태면 null(쓰기를 막는다) */
  onWrite: ((text: string, wait: LetterWait) => string | null) | null
  /** 도착한 편지를 연다(읽음 표시). 성공하면 null, 실패하면 이유 */
  onRead: ((writtenAt: number) => string | null) | null
  /** 편지를 지운다. 성공하면 null, 실패하면 이유 */
  onErase: ((writtenAt: number) => string | null) | null
}) {
  const back = document.createElement('div')
  back.className = 'sheet-back'
  back.hidden = true
  back.innerHTML = `<div class="sheet letters" data-testid="letters" role="dialog" aria-modal="true" aria-label="마을 우체통"></div>`
  const sheet = back.querySelector<HTMLElement>('.sheet')!
  const close = () => (back.hidden = true)
  back.addEventListener('click', (e) => {
    if (e.target === back) close()
  })
  let wait: LetterWait = 'month'
  let draft = ''

  function showMain(message = '', error = false) {
    const { today, arrived, waiting, received, now } = handlers.lists()
    const writable = !!handlers.onWrite
    sheet.innerHTML = `
      <div class="edit-title">📮 마을 우체통</div>
      ${arrived.length ? `<div class="settings-group"><div class="settings-label">도착한 편지</div><div class="letter-list" data-testid="letters-arrived"></div></div>` : ''}
      <div class="settings-group">
        <div class="settings-label">미래의 나에게</div>
        <p class="settings-help">열리는 날까지는 나도 읽을 수 없어요. 그날 앱을 열면 편지가 찾아와요.</p>
        <textarea class="line-input letter-input" data-testid="letter-input" rows="3" maxlength="${MAX_LETTER + 50}" aria-label="미래의 나에게 쓰는 편지" placeholder="그때의 나는 어떤 하루를 보내고 있을까요?" ${writable ? '' : 'disabled'}></textarea>
        <div class="hint"><span class="msg" data-testid="letter-msg"></span><span class="len" data-testid="letter-len"></span></div>
        <div class="letter-waits" role="group" aria-label="열리는 날">
          ${WAITS.map((w) => `<button type="button" class="letter-wait" data-testid="letter-wait-${w.id}" data-wait="${w.id}" aria-pressed="${w.id === wait}" ${writable ? '' : 'disabled'}><b>${w.label}</b><small>${letterDay(opensOnFor(today, w.id), today)}</small></button>`).join('')}
        </div>
        <button type="button" class="settings-btn build letter-send" data-testid="letter-send" disabled>📮 편지 부치기</button>
        <div class="settings-msg" data-testid="letters-msg" role="status"></div>
      </div>
      <div class="settings-group">
        <div class="settings-label">기다리는 편지</div>
        <div class="letter-list" data-testid="letters-waiting"></div>
      </div>
      ${received.length ? `<div class="settings-group"><div class="settings-label">받은 편지</div><div class="letter-list" data-testid="letters-received"></div></div>` : ''}
      <div class="sheet-buttons">
        <button type="button" class="sheet-btn" data-testid="letters-close">닫기</button>
      </div>`
    sheet.querySelector('[data-testid="letters-close"]')!.addEventListener('click', close)
    const msg = sheet.querySelector<HTMLElement>('[data-testid="letters-msg"]')!
    msg.textContent = message
    msg.classList.toggle('err', error)

    const input = sheet.querySelector<HTMLTextAreaElement>('.letter-input')!
    const send = sheet.querySelector<HTMLButtonElement>('.letter-send')!
    const len = sheet.querySelector<HTMLElement>('[data-testid="letter-len"]')!
    const hint = sheet.querySelector<HTMLElement>('[data-testid="letter-msg"]')!
    input.value = draft
    const update = () => {
      draft = input.value
      const n = [...draft.replace(/\r\n?/g, '\n').trim()].length
      len.textContent = `${n} / ${MAX_LETTER}`
      len.classList.toggle('err', n > MAX_LETTER)
      const checked = checkLetter(draft)
      send.disabled = !writable || !checked.ok
      hint.textContent = !checked.ok && checked.reason === 'long' ? `${MAX_LETTER}자까지 쓸 수 있어요` : ''
      hint.classList.toggle('err', !checked.ok && checked.reason === 'long')
    }
    update()
    input.addEventListener('input', () => {
      msg.textContent = ''
      update()
    })
    for (const b of sheet.querySelectorAll<HTMLButtonElement>('.letter-wait')) {
      b.addEventListener('click', () => {
        wait = b.dataset.wait as LetterWait
        for (const x of sheet.querySelectorAll('.letter-wait')) x.setAttribute('aria-pressed', String(x === b))
      })
    }
    send.addEventListener('click', () => {
      if (!handlers.onWrite || !checkLetter(draft).ok) return
      const error = handlers.onWrite(draft, wait)
      if (error) {
        msg.textContent = error
        msg.classList.add('err')
        return
      }
      const opens = letterDay(opensOnFor(today, wait), today)
      draft = ''
      showMain(`📮 편지를 부쳤어요. ${opens}에 열려요`)
    })

    const waitingList = sheet.querySelector<HTMLElement>('[data-testid="letters-waiting"]')!
    if (waiting.length === 0) {
      waitingList.innerHTML = `<p class="settings-help letter-none" data-testid="letters-none">아직 부친 편지가 없어요</p>`
    }
    for (const l of waiting) {
      const row = letterRow(l, 'waiting')
      row.querySelector('.letter-when')!.textContent = `✉️ ${letterDay(l.opensOn, today)}에 열려요`
      row.querySelector('.letter-from')!.textContent = `${letterDay(l.writtenOn, today)}에 썼어요`
      waitingList.appendChild(row)
    }
    const arrivedList = sheet.querySelector<HTMLElement>('[data-testid="letters-arrived"]')
    for (const l of arrived) {
      const row = letterRow(l, 'arrived')
      row.querySelector('.letter-when')!.textContent = `💌 ${letterAge(l, now)}일 전의 내가 보낸 편지`
      row.querySelector('.letter-from')!.textContent = `${letterDay(l.writtenOn, today)}에 썼어요`
      if (handlers.onRead) {
        const open = document.createElement('button')
        open.type = 'button'
        open.className = 'letter-open'
        open.dataset.testid = `letter-open-${l.writtenAt}`
        open.textContent = '열어 보기'
        open.addEventListener('click', () => {
          const error = handlers.onRead!(l.writtenAt)
          if (error) showMain(error, true)
          else showMain()
        })
        row.querySelector('.letter-actions')!.prepend(open)
      }
      arrivedList!.appendChild(row)
    }
    const receivedList = sheet.querySelector<HTMLElement>('[data-testid="letters-received"]')
    for (const l of [...received].reverse()) {
      const row = letterRow(l, 'received')
      row.querySelector('.letter-when')!.textContent = `💌 ${letterAge(l, now)}일 전의 내가`
      row.querySelector('.letter-from')!.textContent = `${letterDay(l.writtenOn, today)}에 썼어요`
      const text = document.createElement('p')
      text.className = 'letter-text'
      text.dataset.testid = `letter-text-${l.writtenAt}`
      text.textContent = l.text
      row.querySelector('.letter-main')!.appendChild(text)
      receivedList!.appendChild(row)
    }
  }

  /** 편지 한 통 줄. 글은 받은 편지에만 붙인다 */
  function letterRow(l: Letter, kind: 'waiting' | 'arrived' | 'received'): HTMLElement {
    const row = document.createElement('div')
    row.className = `letter-row ${kind}`
    row.dataset.testid = `letter-${l.writtenAt}`
    row.innerHTML = `<div class="letter-main"><b class="letter-when"></b><small class="letter-from"></small></div><div class="letter-actions"></div>`
    if (handlers.onErase) {
      const erase = document.createElement('button')
      erase.type = 'button'
      erase.className = 'letter-erase'
      erase.dataset.testid = `letter-erase-${l.writtenAt}`
      erase.setAttribute('aria-label', '이 편지 지우기')
      erase.textContent = '🗑️'
      erase.addEventListener('click', () => showErase(l, kind))
      row.querySelector('.letter-actions')!.appendChild(erase)
    }
    return row
  }

  function showErase(l: Letter, kind: 'waiting' | 'arrived' | 'received') {
    const { today } = handlers.lists()
    sheet.innerHTML = `
      <div class="edit-title">이 편지를 지울까요?</div>
      <p class="erase-note" data-testid="letter-erase-note"></p>
      <div class="hint"><span class="msg err" data-testid="letter-erase-msg"></span></div>
      <div class="sheet-buttons">
        <button type="button" class="sheet-btn" data-testid="letter-erase-cancel">그만두기</button>
        <button type="button" class="sheet-btn erase" data-testid="letter-erase-confirm">지울게요</button>
      </div>`
    const when =
      kind === 'waiting' ? `${letterDay(l.opensOn, today)}에 열릴 편지예요. 읽지 않은 채로 지워져요.` : `${letterDay(l.writtenOn, today)}에 쓴 편지예요.`
    sheet.querySelector('[data-testid="letter-erase-note"]')!.textContent = `${when} 지운 편지는 되돌릴 수 없어요.`
    sheet.querySelector('[data-testid="letter-erase-cancel"]')!.addEventListener('click', () => showMain())
    sheet.querySelector('[data-testid="letter-erase-confirm"]')!.addEventListener('click', () => {
      if (!handlers.onErase) return
      const error = handlers.onErase(l.writtenAt)
      if (error) sheet.querySelector('[data-testid="letter-erase-msg"]')!.textContent = error
      else showMain('🍂 편지를 지웠어요')
    })
  }

  return {
    root: back,
    open() {
      showMain()
      back.hidden = false
    },
  }
}
