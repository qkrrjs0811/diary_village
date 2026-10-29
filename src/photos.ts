import { isDate } from './core/date'
import { isPhotoData, readPhotos, type Photos } from './core/photo'

/**
 * 사진 일기 보관함. 사진은 localStorage 에 담기엔 커서 폰 안 IndexedDB 에 둔다.
 * 같은 사이트의 grow_together 와 섞이지 않게 이름은 "diary-village:" 로 시작한다. 밖으로 보내지 않는다
 */
export const PHOTO_DB = 'diary-village:photos'
const STORE = 'photos'

export interface PhotoStore {
  /** 날짜 → 사진. 이상한 장은 건너뛴다 */
  all(): Promise<Photos>
  /** 그날 사진을 붙이거나 바꾼다 */
  put(date: string, data: string): Promise<void>
  /** 그날 사진을 뗀다 */
  remove(date: string): Promise<void>
}

const done = <T>(req: IDBRequest<T>) =>
  new Promise<T>((ok, fail) => {
    req.onsuccess = () => ok(req.result)
    req.onerror = () => fail(req.error)
  })

/** 보관함을 연다. IndexedDB 가 없거나 열리지 않으면 null(사진 없이 앱은 그대로 쓴다) */
export async function openPhotoStore(idb: IDBFactory | undefined = globalThis.indexedDB): Promise<PhotoStore | null> {
  if (!idb) return null
  let db: IDBDatabase
  try {
    const req = idb.open(PHOTO_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'date' })
    db = await done(req)
  } catch {
    return null
  }
  // 다른 탭이 판을 올리려 하면 막지 않게 닫아 준다
  db.onversionchange = () => db.close()
  const write = (fn: (s: IDBObjectStore) => IDBRequest) =>
    new Promise<void>((ok, fail) => {
      const tx = db.transaction(STORE, 'readwrite')
      fn(tx.objectStore(STORE))
      tx.oncomplete = () => ok()
      tx.onerror = () => fail(tx.error)
      tx.onabort = () => fail(tx.error)
    })
  return {
    async all() {
      const rows = await done(db.transaction(STORE).objectStore(STORE).getAll())
      return readPhotos(Object.fromEntries((rows as { date: unknown; data: unknown }[]).map((r) => [r.date, r.data])))
    },
    async put(date, data) {
      if (!isDate(date) || !isPhotoData(data)) throw new Error('사진을 붙일 수 없어요')
      await write((s) => s.put({ date, data }))
    },
    async remove(date) {
      await write((s) => s.delete(date))
    },
  }
}
