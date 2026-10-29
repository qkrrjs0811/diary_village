import { isPhotoData, photoSize } from '../core/photo'

/** 줄인 사진을 jpeg 로 담을 때 차례로 낮춰 보는 품질. 한도 안에 들면 멈춘다 */
const QUALITIES = [0.85, 0.7, 0.55, 0.4]

/** 고른 사진을 폰 안에서 줄여 jpeg data URL 로 만든다(밖으로 보내지 않는다). 읽지 못하면 던진다 */
export async function shrinkPhoto(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    const size = photoSize(img.naturalWidth, img.naturalHeight)
    if (!size) throw new Error('size')
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    // 투명한 사진은 바탕 크림색 위에 얹는다(jpeg 는 투명을 담지 못한다)
    ctx.fillStyle = '#fbf8f0'
    ctx.fillRect(0, 0, size.width, size.height)
    ctx.drawImage(img, 0, 0, size.width, size.height)
    for (const q of QUALITIES) {
      const data = canvas.toDataURL('image/jpeg', q)
      if (isPhotoData(data)) return data
    }
    throw new Error('big')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export interface PhotoField {
  /** "📷 사진" 단추. 쓰는 칸의 안내 줄에 둔다 */
  toggle: HTMLButtonElement
  /** 붙인 사진 미리 보기와 떼기. 사진이 없으면 숨는다 */
  field: HTMLElement
  /** 지금 붙인 사진(없으면 null) */
  value(): string | null
  /** 처음 사진에서 바뀌었는지 */
  changed(): boolean
}

/**
 * 하루 한 장 사진 칸. 찍거나 고른 사진을 폰 안에서 줄여 붙이고, 바꾸고, 뗀다.
 * prefix 는 data-testid 앞머리(write → write-photo, write-photo-file, write-photo-thumb, write-photo-remove).
 * onChange 는 사진이 바뀔 때마다 불린다
 */
export function createPhotoField(prefix: string, initial: string | null, onChange: (value: string | null) => void): PhotoField {
  let photo = initial
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'more-toggle photo-toggle'
  toggle.dataset.testid = `${prefix}-photo`

  const field = document.createElement('div')
  field.className = 'photo-field'
  field.innerHTML = `
    <input type="file" accept="image/*" class="photo-file" data-testid="${prefix}-photo-file" hidden />
    <div class="photo-row">
      <figure class="polaroid photo-thumb" data-testid="${prefix}-photo-thumb"><img alt="붙인 사진" /></figure>
      <span class="photo-note" data-testid="${prefix}-photo-msg"></span>
      <button type="button" class="photo-remove" data-testid="${prefix}-photo-remove">떼기</button>
    </div>`
  const file = field.querySelector<HTMLInputElement>('.photo-file')!
  const row = field.querySelector<HTMLElement>('.photo-row')!
  const thumb = field.querySelector<HTMLElement>('.photo-thumb')!
  const img = thumb.querySelector('img')!
  const note = field.querySelector<HTMLElement>('.photo-note')!
  const remove = field.querySelector<HTMLButtonElement>('.photo-remove')!

  const sync = (msg = '') => {
    toggle.textContent = photo ? '📷 바꾸기' : '📷 사진'
    if (photo) img.src = photo
    else img.removeAttribute('src')
    thumb.hidden = !photo
    remove.hidden = !photo
    note.textContent = msg || (photo ? '이 날에 붙일 사진이에요' : '')
    note.classList.toggle('err', !!msg)
    row.hidden = !photo && !msg
  }
  toggle.addEventListener('click', () => file.click())
  file.addEventListener('change', async () => {
    const picked = file.files?.[0]
    file.value = ''
    if (!picked) return
    try {
      photo = await shrinkPhoto(picked)
      sync()
      onChange(photo)
    } catch {
      sync('사진을 읽지 못했어요 · 다른 사진을 골라 주세요')
    }
  })
  remove.addEventListener('click', () => {
    photo = null
    sync()
    onChange(photo)
  })
  sync()

  return { toggle, field, value: () => photo, changed: () => photo !== initial }
}
