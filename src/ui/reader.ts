import { agingLine } from '../core/aging'
import { buildingInfo, buildingOf, type BuildingId } from '../core/building'
import { dayKey } from '../core/date'
import { checkText, MAX_TEXT } from '../core/entries'
import { MOODS, moodOf } from '../core/mood'
import { roomLight, roomOf } from '../core/interior'
import type { Entry, MoodId } from '../core/types'
import { dayPart } from '../core/weather'
import { yardNote, yardOf } from '../core/yard'
import { roomSvg } from '../village/room'
import { dateLabel, fullDateLabel } from './format'
import { createMoreField } from './more'
import { createPhotoField } from './photo'

/** 이만큼(px) 옆으로 밀면 앞뒤 날로 넘긴다 */
const SWIPE = 56

/** 가장 처음·가장 최근 날에 다정하게 건네는 한마디. 빠진 날 이야기는 하지 않는다 */
function edgeLine(first: boolean, last: boolean): string | null {
  if (first && last) return '🌱 마을에 처음 지은 집이에요'
  if (first) return '🌱 가장 처음 지은 집이에요'
  if (last) return '🏡 가장 최근에 지은 집이에요'
  return null
}

/** 집을 누르면 그날 쓴 글을 보여 주는 아래쪽 창. onEdit 이 있으면 "고치기"로 글과 기분을 바꾼다 */
export function createReader(handlers: {
  /** 저장 못 하는 상태면 null. 실패하면 사용자에게 보일 이유를, 성공하면 고친 기록을 돌려준다 */
  onEdit: ((date: string, text: string, mood: MoodId, more?: string) => { error: string } | { entry: Entry }) | null
  /** 저장 못 하는 상태면 null. 실패하면 사용자에게 보일 이유를, 성공하면 null 을 돌려준다 */
  onErase: ((date: string) => string | null) | null
  /** 창이 닫힐 때 */
  onClose?: () => void
  /** 바로 앞·뒤 쓴 날의 글(없으면 null) */
  neighbors?: (date: string) => { prev: Entry | null; next: Entry | null }
  /** 앞뒤 날로 넘겨 다른 글을 보일 때(마을 보기를 그 집으로 옮긴다) */
  onTurn?: (entry: Entry) => void
  /** 저장 못 하는 상태면 null. 소중한 날 표시를 켜고 끈 기록을, 실패하면 null 을 돌려준다 */
  onTreasure?: ((date: string) => Entry | null) | null
  /** 그날 첫 손님이 그 글에 건넨 맞장구 한 줄(없으면 null) */
  reply?: (entry: Entry) => string | null
  /** 건물 꼬리표를 누르면 그 건물이 선 날 모아 보기를 연다(읽기 창은 닫힌다) */
  onBuilding?: (id: BuildingId) => void
  /** 그날 한 줄의 말이 지난날에도 나왔으면 메아리 꼬리표(없으면 null) */
  echo?: (entry: Entry) => { word: string; text: string } | null
  /** 메아리 꼬리표를 누르면 찾기 창이 그 말로 열린다(읽기 창은 닫힌다) */
  onEcho?: (word: string) => void
  /** 그날 붙인 사진(없으면 null) */
  photo?: (date: string) => string | null
  /** 사진 보관함을 못 쓰거나 저장 못 하는 상태면 null. 고치기에서 사진을 붙이거나(data) 뗀다(null) */
  onPhoto?: ((date: string, data: string | null) => void) | null
  /** 사진 보관함이 열려 있으면 true */
  canPhoto?: () => boolean
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

  /** 읽는 중일 때만 옆으로 밀어 넘길 수 있다(고치기·지우기 창에서는 null) */
  let swipeTo: ((dir: 'prev' | 'next') => void) | null = null
  let start: { id: number; x: number; y: number; selecting: boolean } | null = null
  const selected = () => !!window.getSelection()?.toString()
  sheet.addEventListener('pointerdown', (e) => {
    const onControl = (e.target as Element).closest('button, input')
    start = swipeTo && !onControl ? { id: e.pointerId, x: e.clientX, y: e.clientY, selecting: selected() } : null
  })
  sheet.addEventListener('pointercancel', () => (start = null))
  sheet.addEventListener('pointerup', (e) => {
    const s = start
    start = null
    if (!s || s.id !== e.pointerId || !swipeTo) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    // 세로로 움직였거나 글자를 고르는 중이면 넘기지 않는다(마우스로 끌면 글자 고르기다)
    if (Math.abs(dx) < SWIPE || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (s.selecting || (e.pointerType === 'mouse' && selected())) return
    swipeTo(dx < 0 ? 'next' : 'prev')
  })

  function showRead(entry: Entry, from?: 'prev' | 'next', enter = true) {
    swipeTo = null
    const m = moodOf(entry.mood)
    // 내 글이 가장 먼저, 가장 크게 온다. 날짜·기분은 그 위 옅은 두 줄, 소중한 날·닫기는 오른쪽 위 동그란 단추.
    // 건물·집 나이·고친 날·처음 한마디는 글 아래 작은 한 묶음으로 모으고, 그날의 방은 그 아래 그림으로 둔다.
    // 방은 날짜·기분·건물로만 그리고 글은 담지 않는다. 빛은 지금 때(낮·저녁·밤)를 따른다
    sheet.innerHTML = `
      <div class="reader-head">
        <div class="reader-when">
          <div class="reader-date" data-testid="reader-date"></div>
          <div class="reader-mood" data-testid="reader-mood"></div>
        </div>
        ${handlers.onTreasure ? '<button type="button" class="round-btn treasure-btn" data-testid="reader-treasure"></button>' : ''}
        <button type="button" class="round-btn close" data-testid="reader-close" aria-label="닫기">✕</button>
      </div>
      <figure class="polaroid reader-photo" data-testid="reader-photo" hidden><img alt="그날의 사진" /></figure>
      <p class="reader-text" data-testid="reader-text"></p>
      <div class="reader-more" data-testid="reader-more" tabindex="0" aria-label="더 쓴 글" hidden></div>
      <div class="reader-reply" data-testid="reader-reply" hidden></div>
      <div class="reader-tags">
        ${handlers.onBuilding
          ? '<button type="button" class="reader-building-btn" data-testid="reader-building" hidden><span class="reader-building"></span></button>'
          : '<span class="reader-building" data-testid="reader-building" hidden></span>'}
        <button type="button" class="reader-building-btn reader-echo-btn" data-testid="reader-echo" hidden><span class="reader-building reader-echo"></span></button>
        <span class="reader-yard" data-testid="reader-yard" hidden></span>
        <span class="reader-aging" data-testid="reader-aging" hidden></span>
        <span class="reader-edited" data-testid="reader-edited" hidden></span>
        <span class="reader-edge" data-testid="reader-edge" hidden></span>
      </div>
      ${roomSvg(roomOf(entry), roomLight(dayPart(Date.now())))}
      <div class="reader-actions">
        ${handlers.neighbors ? '<button type="button" class="turn-btn" data-testid="reader-prev">◀</button>' : ''}
        ${handlers.onEdit ? '<button type="button" class="sheet-btn" data-testid="reader-edit">✏️ 고치기</button>' : ''}
        ${handlers.onErase ? '<button type="button" class="sheet-btn" data-testid="reader-erase">🗑️ 지우기</button>' : ''}
        ${handlers.neighbors ? '<button type="button" class="turn-btn" data-testid="reader-next">▶</button>' : ''}
      </div>`
    sheet.querySelector('.reader-date')!.textContent = fullDateLabel(entry.date)
    sheet.querySelector('.reader-mood')!.textContent = `${m.emoji} ${m.label} · ${m.weather}`
    sheet.querySelector('.reader-text')!.textContent = entry.text
    // 그날 붙인 사진은 내 글 바로 위에 폴라로이드처럼 살짝 기울여 둔다
    const photo = handlers.photo?.(entry.date)
    if (photo) {
      const frame = sheet.querySelector<HTMLElement>('.reader-photo')!
      frame.querySelector('img')!.src = photo
      frame.hidden = false
    }
    // 더 쓴 글은 한 줄 아래에 줄바꿈 그대로. 길면 이 칸 안에서만 굴러간다
    if (entry.more) {
      const more = sheet.querySelector<HTMLElement>('.reader-more')!
      more.textContent = entry.more
      more.hidden = false
    }
    const found = buildingOf(entry)
    if (found) {
      const b = buildingInfo(found.id)
      const line = sheet.querySelector<HTMLElement>('[data-testid="reader-building"]')!
      const pill = line.querySelector<HTMLElement>('.reader-building') ?? line
      pill.textContent = `${b.icon} ${b.name} · '${found.word}'에서 생겼어요`
      line.hidden = false
      // 같은 건물이 선 날들을 이어 읽는다. 목록에서 고른 날로 읽기 창이 다시 열린다
      line.addEventListener('click', () => {
        if (!handlers.onBuilding) return
        close()
        handlers.onBuilding(found.id)
      })
    }
    // 말의 메아리: 같은 말이 나온 날들을 찾기 창에서 이어 읽는다. 글로 계산하므로 고치면 따라 바뀐다
    const echo = handlers.onEcho ? handlers.echo?.(entry) : null
    if (echo) {
      const line = sheet.querySelector<HTMLElement>('[data-testid="reader-echo"]')!
      line.querySelector('.reader-echo')!.textContent = echo.text
      line.hidden = false
      line.addEventListener('click', () => {
        close()
        handlers.onEcho?.(echo.word)
      })
    }
    // 건물이 없는 날의 마당 흔적. 글에서 찾은 말이 있을 때만 알려 준다
    const yard = yardNote(yardOf(entry))
    if (yard) {
      const line = sheet.querySelector<HTMLElement>('.reader-yard')!
      line.textContent = yard
      line.hidden = false
    }
    // 집 나이는 그날 날짜와 오늘로만 센다. 30일 전 새 집에는 말하지 않는다
    const age = agingLine(entry.date, dayKey(Date.now()))
    if (age) {
      const line = sheet.querySelector<HTMLElement>('.reader-aging')!
      line.textContent = age
      line.hidden = false
    }
    // 그날 손님의 맞장구. 글로 계산하므로 고치면 따라 바뀐다
    const reply = handlers.reply?.(entry)
    if (reply) {
      const line = sheet.querySelector<HTMLElement>('.reader-reply')!
      line.textContent = reply
      line.hidden = false
    }
    const heart = sheet.querySelector<HTMLButtonElement>('[data-testid="reader-treasure"]')
    if (heart) {
      // 소중한 날은 내 손으로 고른 날이다. 켜도 꺼도 건물·명소·단계는 그대로다
      const on = entry.treasured === true
      // 보이는 건 하트 하나, 읽어 주는 이름은 "소중한 날"
      heart.innerHTML = `${on ? '💛' : '🤍'}<span class="sr-only"> 소중한 날</span>`
      heart.setAttribute('aria-pressed', String(on))
      heart.addEventListener('click', () => {
        const next = handlers.onTreasure?.(entry.date)
        if (!next) return
        showRead(next, undefined, false)
        sheet.querySelector<HTMLButtonElement>('[data-testid="reader-treasure"]')?.focus()
      })
    }
    if (entry.editedAt != null) {
      const edited = sheet.querySelector<HTMLElement>('.reader-edited')!
      edited.textContent = `✏️ ${dateLabel(dayKey(entry.editedAt)).replace(/ \S+요일$/, '')}에 고쳤어요`
      edited.hidden = false
    }
    if (handlers.neighbors) {
      const near = handlers.neighbors(entry.date)
      const go = (dir: 'prev' | 'next') => {
        const to = near[dir]
        if (!to) return
        showRead(to, dir)
        handlers.onTurn?.(to)
      }
      const turn = (dir: 'prev' | 'next', label: string) => {
        const btn = sheet.querySelector<HTMLButtonElement>(`[data-testid="reader-${dir}"]`)!
        const to = near[dir]
        btn.disabled = !to
        btn.setAttribute('aria-label', to ? `${label} · ${fullDateLabel(to.date)}` : label)
        btn.addEventListener('click', () => go(dir))
      }
      turn('prev', '앞 날')
      turn('next', '뒷 날')
      swipeTo = go
      const edge = edgeLine(!near.prev, !near.next)
      if (edge) {
        const line = sheet.querySelector<HTMLElement>('.reader-edge')!
        line.textContent = edge
        line.hidden = false
      }
    }
    // 넘긴 쪽에서 글이 살며시 들어온다(움직임 줄이기면 CSS 가 멈춘다)
    // 작은 줄은 묶음째 숨겨 빈 자리가 남지 않게 한다
    sheet.querySelectorAll<HTMLElement>('.reader-tags').forEach((box) => {
      box.hidden = [...box.children].every((c) => (c as HTMLElement).hidden)
    })
    sheet.classList.remove('turn-from-prev', 'turn-from-next')
    if (from) {
      void sheet.offsetWidth
      sheet.classList.add(`turn-from-${from}`)
    }
    // 문을 열거나 다른 날로 넘기면 방이 옅게 밝아지고 커튼이 살랑인다(소중한 날 표시만 바꿀 때는 그대로)
    if (enter) sheet.querySelector('.reader-room')!.classList.add('room-enter')
    sheet.querySelector('.close')!.addEventListener('click', close)
    sheet.querySelector('[data-testid="reader-edit"]')?.addEventListener('click', () => showEdit(entry))
    sheet.querySelector('[data-testid="reader-erase"]')?.addEventListener('click', () => showErase(entry))
  }

  /** 지우기는 확인을 한 번 더 받는다(기획서 8번) */
  function showErase(entry: Entry) {
    swipeTo = null
    sheet.innerHTML = `
      <div class="reader-date" data-testid="reader-date"></div>
      <div class="edit-title">이 날의 한 줄을 지울까요?</div>
      <p class="reader-text erase-text" data-testid="erase-text"></p>
      <p class="erase-note" data-testid="erase-note">지운 ${handlers.photo?.(entry.date) ? '글과 사진은' : '글은'} 되돌릴 수 없어요. 집은 빈 땅으로 돌아가지만, 명소와 마을 단계는 그대로예요.</p>
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
    swipeTo = null
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
    // 긴 글이 있으면 펼친 채로, 없으면 "＋ 더 쓰기"로 이어 쓴다
    const more = createMoreField('edit', entry.more ?? '', () => update(), true)
    input.after(more.field)
    len.after(more.toggle)
    // 사진도 고치기에서 붙이고 바꾸고 뗀다
    const photo = handlers.onPhoto && handlers.canPhoto?.() ? createPhotoField('edit', handlers.photo?.(entry.date) ?? null, () => {}) : null
    if (photo) {
      input.after(photo.field)
      more.toggle.after(photo.toggle)
    }

    const update = () => {
      const n = [...input.value.replace(/\s+/g, ' ').trim()].length
      len.textContent = `${n} / ${MAX_TEXT}`
      len.classList.toggle('err', n > MAX_TEXT)
      const checked = checkText(input.value)
      save.disabled = !checked.ok || !more.ok()
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
      const r = handlers.onEdit(entry.date, input.value, mood, more.value())
      if ('error' in r) {
        msg.textContent = r.error
        msg.classList.add('err')
        return
      }
      if (photo?.changed()) handlers.onPhoto?.(entry.date, photo.value())
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
