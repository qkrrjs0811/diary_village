import type { ImportPlan } from '../core/backup'

/** 위쪽 ⚙️ 로 여는 설정 창. 지금은 백업 내려받기·가져오기만 있다 */
export function createSettings(handlers: {
  /** 내려받을 파일. 저장을 못 읽는 상태면 null */
  exportFile: (() => { name: string; text: string }) | null
  /** 저장을 못 읽는 상태면 null(덮어쓰지 않도록 가져오기를 막는다) */
  planImport: ((text: string) => ImportPlan) | null
  /** 성공하면 null, 실패하면 사용자에게 보일 이유 */
  applyImport: (plan: Extract<ImportPlan, { ok: true }>) => string | null
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
        <div class="settings-label">백업</div>
        <p class="settings-help">쓴 글을 파일로 받아 두면 폰을 바꿔도 마을을 다시 지을 수 있어요.</p>
        <button type="button" class="settings-btn" data-testid="backup-export" ${handlers.exportFile ? '' : 'disabled'}>📦 백업 파일 내려받기</button>
        <button type="button" class="settings-btn" data-testid="backup-import" ${handlers.planImport ? '' : 'disabled'}>📂 백업 파일 가져오기</button>
        <input type="file" accept=".json,application/json" data-testid="backup-file" hidden />
        <div class="settings-msg" data-testid="settings-msg" role="status"></div>
      </div>
      <div class="sheet-buttons">
        <button type="button" class="sheet-btn close" data-testid="settings-close">닫기</button>
      </div>`
    const msg = sheet.querySelector<HTMLElement>('.settings-msg')!
    msg.textContent = message
    msg.classList.toggle('err', error)
    sheet.querySelector('.close')!.addEventListener('click', close)
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
    sheet.innerHTML = `
      <div class="edit-title">📂 백업 가져오기</div>
      <p class="settings-help confirm" data-testid="import-summary"></p>
      <div class="settings-msg" data-testid="import-msg" role="status"></div>
      <div class="sheet-buttons">
        <button type="button" class="sheet-btn" data-testid="import-cancel">그만두기</button>
        <button type="button" class="sheet-btn build" data-testid="import-ok" ${plan.added > 0 ? '' : 'disabled'}>가져오기</button>
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
      showMain(`🏠 ${plan.added}일의 집을 다시 지었어요`)
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
