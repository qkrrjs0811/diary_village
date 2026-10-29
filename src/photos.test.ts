import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { PHOTO_DB, openPhotoStore } from './photos'

const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const png = 'data:image/png;base64,iVBORw0KGgo='

describe('폰 안 사진 보관함', () => {
  it('이름이 diary-village: 로 시작한다', () => {
    expect(PHOTO_DB.startsWith('diary-village:')).toBe(true)
  })

  it('날짜마다 한 장을 넣고, 바꾸고, 뗀다', async () => {
    const store = (await openPhotoStore(new IDBFactory()))!
    expect(await store.all()).toEqual({})
    await store.put('2026-10-29', jpeg)
    await store.put('2026-10-27', png)
    expect(await store.all()).toEqual({ '2026-10-27': png, '2026-10-29': jpeg })
    await store.put('2026-10-29', png)
    expect(await store.all()).toEqual({ '2026-10-27': png, '2026-10-29': png })
    await store.remove('2026-10-27')
    expect(await store.all()).toEqual({ '2026-10-29': png })
  })

  it('닫았다 다시 열어도 남는다', async () => {
    const idb = new IDBFactory()
    await (await openPhotoStore(idb))!.put('2026-10-29', jpeg)
    expect(await (await openPhotoStore(idb))!.all()).toEqual({ '2026-10-29': jpeg })
  })

  it('이상한 사진·날짜는 넣지 않는다', async () => {
    const store = (await openPhotoStore(new IDBFactory()))!
    await expect(store.put('2026-10-29', 'https://example.com/a.jpg')).rejects.toThrow()
    await expect(store.put('어제', jpeg)).rejects.toThrow()
    expect(await store.all()).toEqual({})
  })

  it('보관함 속 이상한 장은 읽을 때 건너뛴다', async () => {
    const idb = new IDBFactory()
    const store = (await openPhotoStore(idb))!
    await store.put('2026-10-29', jpeg)
    await new Promise<void>((done) => {
      const req = idb.open(PHOTO_DB)
      req.onsuccess = () => {
        const tx = req.result.transaction('photos', 'readwrite')
        tx.objectStore('photos').put({ date: '2026-10-28', data: 'odd' })
        tx.oncomplete = () => (req.result.close(), done())
      }
    })
    expect(await store.all()).toEqual({ '2026-10-29': jpeg })
  })

  it('IndexedDB 가 없으면 null', async () => {
    expect(await openPhotoStore(undefined)).toBeNull()
  })
})
