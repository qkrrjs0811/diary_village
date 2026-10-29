import { describe, expect, it } from 'vitest'
import { PHOTO_EDGE, PHOTO_MAX_CHARS, isPhotoData, mergePhotos, photoSize, photosShown, readPhotos } from './photo'
import type { SaveData } from './types'

const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const png = 'data:image/png;base64,iVBORw0KGgo='
const webp = 'data:image/webp;base64,UklGRg=='

const save: SaveData = {
  version: 1,
  entries: [
    { date: '2026-10-27', text: '바다', mood: 'great', writtenAt: 1 },
    { date: '2026-10-29', text: '커피', mood: 'calm', writtenAt: 3 },
  ],
  erased: [{ date: '2026-10-28', erasedAt: 9 }],
}

describe('사진 크기 줄이기', () => {
  it('긴 변을 한도에 맞추고 비율을 지킨다', () => {
    expect(photoSize(4032, 3024)).toEqual({ width: PHOTO_EDGE, height: 810 })
    expect(photoSize(3024, 4032)).toEqual({ width: 810, height: PHOTO_EDGE })
    expect(photoSize(2000, 2000)).toEqual({ width: PHOTO_EDGE, height: PHOTO_EDGE })
  })

  it('작은 사진은 키우지 않는다', () => {
    expect(photoSize(800, 600)).toEqual({ width: 800, height: 600 })
    expect(photoSize(PHOTO_EDGE, 10)).toEqual({ width: PHOTO_EDGE, height: 10 })
  })

  it('아주 가는 사진도 한 칸은 남긴다', () => {
    expect(photoSize(10000, 3)).toEqual({ width: PHOTO_EDGE, height: 1 })
  })

  it('이상한 크기는 null', () => {
    for (const [w, h] of [[0, 10], [10, 0], [-1, 5], [NaN, 5], [Infinity, 5]]) expect(photoSize(w, h)).toBeNull()
  })
})

describe('받는 사진 글자', () => {
  it('jpeg·png·webp data URL 을 받는다', () => {
    for (const ok of [jpeg, png, webp]) expect(isPhotoData(ok)).toBe(true)
  })

  it('다른 것은 받지 않는다', () => {
    const odd = [
      '',
      'data:image/jpeg;base64,',
      'data:image/gif;base64,R0lGOD==',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:text/html;base64,PGI+',
      'https://example.com/a.jpg',
      'data:image/jpeg;base64,<script>',
      'data:image/jpeg,raw',
      42,
      null,
    ]
    for (const x of odd) expect(isPhotoData(x)).toBe(false)
  })

  it('너무 큰 사진은 받지 않는다', () => {
    const head = 'data:image/jpeg;base64,'
    expect(isPhotoData(head + 'A'.repeat(PHOTO_MAX_CHARS - head.length))).toBe(true)
    expect(isPhotoData(head + 'A'.repeat(PHOTO_MAX_CHARS - head.length + 1))).toBe(false)
  })
})

describe('보일 사진', () => {
  it('글이 남은 날의 사진만 보인다(지운 날·글 없는 날은 빼기)', () => {
    const photos = { '2026-10-27': jpeg, '2026-10-28': png, '2026-10-30': webp }
    expect(photosShown(save, photos)).toEqual({ '2026-10-27': jpeg })
  })

  it('사진이 없으면 빈 묶음', () => {
    expect(photosShown(save, {})).toEqual({})
  })
})

describe('백업 사진 읽기', () => {
  it('날짜 → 사진 묶음을 읽고 날짜 순으로 둔다', () => {
    expect(Object.keys(readPhotos({ '2026-10-29': png, '2026-10-27': jpeg }))).toEqual(['2026-10-27', '2026-10-29'])
  })

  it('이상한 장만 버린다', () => {
    expect(readPhotos({ '2026-10-27': jpeg, '2026-13-01': png, hello: png, '2026-10-29': 'data:text/html;base64,PGI+', '2026-10-30': 3 })).toEqual({
      '2026-10-27': jpeg,
    })
  })

  it('묶음이 아니면 빈 묶음(사진 없는 이전 백업)', () => {
    for (const raw of [undefined, null, 'x', 3, [jpeg]]) expect(readPhotos(raw)).toEqual({})
  })
})

describe('사진 합치기', () => {
  it('폰 사진을 지키고 폰에 없는 날만 백업에서 더한다', () => {
    const merged = mergePhotos({ '2026-10-29': png }, { '2026-10-27': jpeg, '2026-10-29': webp }, save)
    expect(merged).toEqual({ '2026-10-27': jpeg, '2026-10-29': png })
  })

  it('글이 없는 날의 사진은 더하지 않는다', () => {
    expect(mergePhotos({}, { '2026-10-28': jpeg, '2026-11-01': png }, save)).toEqual({})
  })
})
