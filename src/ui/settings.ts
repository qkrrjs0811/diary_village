import type { ImportPlan } from '../core/backup'
import { DEFAULT_NAME, NAME_MAX } from '../core/name'

/** 위쪽 ⚙️ 로 여는 설정 창. 마을 이름 짓기, 소리 켜기·끄기, 백업 내려받기·가져오기가 있다 */
export function createSettings(handlers: {
  /** 지금 소리가 켜져 있는지 */
  soundOn: () => boolean
  /** 소리를 켜거나 끈다. 저장하지 못하면 false */
  setSound: (on: boolean) => boolean
  /** 지금 지어 둔 이름(없으면 빈 글) */
  villageName: () => string
  /** 이름을 바꾼다. 성공하면 null, 실패하면 이유. 저장을 못 읽는 상태면 null(덮어쓰지 않도록 막는다) */
  rename: ((input: string) => string | null) | null
  /** 내려받을 파일. 저장을 못 읽는 상태면 null */
  exportFile: (() => { name: string; text: string }) | null
  /** 저장을 못 읽는 상태면 null(덮어쓰지 않도록 가져오기를 막는다) */
  planImport: ((text: string) => ImportPlan) | null
  /** 성공하면 null, 실패하면 사용자에게 보일 이유 */
  applyImport: (plan: Extract<ImportPlan, { ok: true }>) => string | null
  /** 마지막 백업을 알리는 짧은 줄(없으면 빈 글) */
  backupNote: () => string
  /** 폰에 보관 중인 사진 수 */
  photoCount: () => number
  /** 백업 파일을 내려받은 뒤 */
  onExported: () => void
}) {
  const back = document.createElement('div')
  back.className = 'sheet-back'
  back.hidden = true
  back.innerHTML = `<div class="sheet" data-testid="settings" role="dialog" aria-modal="true" aria-label="설정"></div>`
  const sheet = back.querySelector<HTMLElement>('.sheet')!
  const close = () => (back.hidden = true)
  back.addEventListener('click', (e) => {
    if (e.target === back) close()
  })

  function showMain(message = '', error = false) {
    sheet.innerHTML = `
      <div class="edit-title">⚙️ 설정</div>
      <div class="settings-group">
        <div class="settings-label">마을 이름</div>
        <p class="settings-help">비워 두면 "${DEFAULT_NAME}"로 불러요.</p>
        <div class="name-row">
          <input class="line-input" data-testid="name-input" type="text" maxlength="${NAME_MAX}" enterkeyhint="done" autocomplete="off" placeholder="${DEFAULT_NAME}" aria-label="마을 이름" ${handlers.rename ? '' : 'disabled'} />
          <button type="button" class="build" data-testid="name-save" disabled>이름 짓기</button>
        </div>
        <div class="settings-msg" data-testid="name-msg" role="status"></div>
      </div>
      <div class="settings-group">
        <button type="button" class="sound-toggle" data-testid="sound-toggle" role="switch">
          <span class="sound-text"><b class="settings-label"></b><small></small></span>
          <span class="switch" aria-hidden="true"><i></i></span>
        </button>
        <div class="settings-msg" data-testid="sound-msg" role="status"></div>
      </div>
      <div class="settings-group">
        <div class="settings-label">백업</div>
        <p class="settings-help">쓴 글을 파일로 받아 두면 폰을 바꿔도 마을을 다시 지을 수 있어요.</p>
        <p class="settings-help backup-note" data-testid="backup-note"></p>
        <p class="settings-help photo-note" data-testid="photo-note"></p>
        <button type="button" class="settings-btn" data-testid="backup-export" ${handlers.exportFile ? '' : 'disabled'}>📦 백업 파일 내려받기</button>
        <button type="button" class="settings-btn" data-testid="backup-import" ${handlers.planImport ? '' : 'disabled'}>📂 백업 파일 가져오기</button>
        <input type="file" accept=".json,application/json" data-testid="backup-file" hidden />
        <div class="settings-msg" data-testid="settings-msg" role="status"></div>
      </div>
      <div class="sheet-buttons">
        <button type="button" class="sheet-btn close" data-testid="settings-close">닫기</button>
      </div>`
    const msg = sheet.querySelector<HTMLElement>('[data-testid="settings-msg"]')!
    msg.textContent = message
    msg.classList.toggle('err', error)
    const note = sheet.querySelector<HTMLElement>('[data-testid="backup-note"]')!
    const showNote = () => {
      note.textContent = handlers.backupNote()
      note.hidden = !note.textContent
    }
    showNote()
    // 사진은 폰 안에만 있어서, 폰을 바꾸면 백업 파일로만 옮겨 갈 수 있다
    const photoNote = sheet.querySelector<HTMLElement>('[data-testid="photo-note"]')!
    const photoCount = handlers.photoCount()
    photoNote.textContent = photoCount ? `📷 사진 ${photoCount}장 · 폰에 보관 중이에요. 백업 파일에 함께 담겨요` : ''
    photoNote.hidden = !photoCount
    sheet.querySelector('.close')!.addEventListener('click', close)
    const nameInput = sheet.querySelector<HTMLInputElement>('[data-testid="name-input"]')!
    const nameSave = sheet.querySelector<HTMLButtonElement>('[data-testid="name-save"]')!
    const nameMsg = sheet.querySelector<HTMLElement>('[data-testid="name-msg"]')!
    nameInput.value = handlers.villageName()
    // 지금 이름과 같으면 누를 것이 없다
    const same = () => nameInput.value.trim().replace(/\s+/g, ' ') === handlers.villageName()
    nameInput.addEventListener('input', () => {
      nameSave.disabled = !handlers.rename || same()
      nameMsg.textContent = ''
    })
    const rename = () => {
      if (!handlers.rename || same()) return
      const error = handlers.rename(nameInput.value)
      nameMsg.classList.toggle('err', !!error)
      if (error) return void (nameMsg.textContent = error)
      const name = handlers.villageName()
      nameInput.value = name
      nameSave.disabled = true
      nameInput.blur()
      nameMsg.textContent = name ? '🏡 마을에 새 이름을 지었어요' : '🏡 처음 이름으로 돌아왔어요'
    }
    nameSave.addEventListener('click', rename)
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) rename()
    })
    const toggle = sheet.querySelector<HTMLButtonElement>('[data-testid="sound-toggle"]')!
    const soundMsg = sheet.querySelector<HTMLElement>('[data-testid="sound-msg"]')!
    const showSound = () => {
      const on = handlers.soundOn()
      toggle.setAttribute('aria-checked', String(on))
      toggle.querySelector('b')!.textContent = on ? '🔔 소리' : '🔕 소리'
      toggle.querySelector('small')!.textContent = on ? '집을 지을 때 실로폰 소리와 떨림이 나요' : '소리도 떨림도 없이 조용히 지어요'
    }
    showSound()
    toggle.addEventListener('click', () => {
      const ok = handlers.setSound(!handlers.soundOn())
      soundMsg.classList.toggle('err', !ok)
      soundMsg.textContent = ok ? '' : '저장하지 못했어요. 저장 공간을 확인해 주세요'
      showSound()
    })
    sheet.querySelector('[data-testid="backup-export"]')!.addEventListener('click', () => {
      if (!handlers.exportFile) return
      const { name, text } = handlers.exportFile()
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      handlers.onExported()
      showNote()
      msg.classList.remove('err')
      msg.textContent = '📦 백업 파일을 내려받았어요'
    })
    const file = sheet.querySelector<HTMLInputElement>('[data-testid="backup-file"]')!
    sheet.querySelector('[data-testid="backup-import"]')!.addEventListener('click', () => file.click())
    file.addEventListener('change', async () => {
      const f = file.files?.[0]
      if (!f || !handlers.planImport) return
      let text = ''
      try {
        text = await f.text()
      } catch {
        return showMain('파일을 열지 못했어요', true)
      }
      const plan = handlers.planImport(text)
      if (!plan.ok) return showMain('한 줄 마을 백업 파일이 아니에요. 다른 파일을 골라 주세요', true)
      showConfirm(plan)
    })
  }

  function showConfirm(plan: Extract<ImportPlan, { ok: true }>) {
    const lines = [`백업에 ${plan.total}일의 한 줄이 있어요.`]
    if (plan.added > 0) lines.push(`그중 ${plan.added}일을 마을에 더해요.`)
    if (plan.kept > 0) lines.push(`이미 쓴 ${plan.kept}일은 지금 글을 그대로 둬요.`)
    if (plan.added === 0) lines.push('새로 더할 날은 없어요.')
    if (plan.lettersAdded > 0) lines.push(`미래의 나에게 쓴 편지 ${plan.lettersAdded}통을 더해요.`)
    if (plan.photosAdded > 0) lines.push(`사진 ${plan.photosAdded}장도 그날에 붙여요.`)
    if (plan.photosLeft > 0) lines.push(`사진 ${plan.photosLeft}장은 이 폰에 담을 수 없어 글만 가져와요.`)
    const fresh = plan.added > 0 || plan.lettersAdded > 0 || plan.photosAdded > 0
    sheet.innerHTML = `
      <div class="edit-title">📂 백업 가져오기</div>
      <p class="settings-help confirm" data-testid="import-summary"></p>
      <div class="settings-msg" data-testid="import-msg" role="status"></div>
      <div class="sheet-buttons">
        <button type="button" class="sheet-btn" data-testid="import-cancel">그만두기</button>
        <button type="button" class="sheet-btn build" data-testid="import-ok" ${fresh ? '' : 'disabled'}>가져오기</button>
      </div>`
    sheet.querySelector('.confirm')!.textContent = lines.join(' ')
    sheet.querySelector('[data-testid="import-cancel"]')!.addEventListener('click', () => showMain())
    sheet.querySelector('[data-testid="import-ok"]')!.addEventListener('click', () => {
      const error = handlers.applyImport(plan)
      if (error) {
        const msg = sheet.querySelector<HTMLElement>('[data-testid="import-msg"]')!
        msg.textContent = error
        msg.classList.add('err')
        return
      }
      showMain(
        plan.added > 0
          ? `🏠 ${plan.added}일의 집을 다시 지었어요`
          : plan.lettersAdded > 0
            ? `💌 편지 ${plan.lettersAdded}통을 우체통에 넣었어요`
            : `📷 사진 ${plan.photosAdded}장을 그날에 붙였어요`,
      )
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
